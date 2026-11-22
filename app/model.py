"""Compact mixed-feature VAE and preprocessing/scoring functions."""
import csv, json, math, random
from dataclasses import dataclass
from typing import Any
import numpy as np
import torch
from torch import nn
from app.config import CATEGORICAL, FEATURES, NUMERIC


def read_csv(path):
    with open(path, newline="") as f:
        return list(csv.DictReader(f))

class Preprocessor:
    def __init__(self, categories=None, means=None, stds=None):
        self.categories = categories or {}
        self.means = means or {}
        self.stds = stds or {}
    def fit(self, rows):
        for key in CATEGORICAL:
            self.categories[key] = sorted({str(r.get(key) or "__missing__") for r in rows} | {"__missing__", "__unknown__"})
        for key in NUMERIC:
            vals = [float(r[key]) for r in rows if r.get(key) not in (None, "") and math.isfinite(float(r[key]))]
            self.means[key] = float(np.mean(vals)) if vals else 0.0
            self.stds[key] = max(float(np.std(vals)) if vals else 1.0, 1e-6)
        return self
    @property
    def dim(self): return sum(len(self.categories[k]) for k in CATEGORICAL) + len(NUMERIC)
    def encode(self, rows):
        X=[]
        for row in rows:
            x=[]
            for key in CATEGORICAL:
                val = str(row.get(key) or "__missing__")
                cats = self.categories[key]
                if val not in cats: val = "__unknown__"
                x.extend([1.0 if val == c else 0.0 for c in cats])
            for key in NUMERIC:
                try: val=float(row.get(key)) if row.get(key) not in (None, "") else self.means[key]
                except (TypeError, ValueError): val=self.means[key]
                if not math.isfinite(val): val=self.means[key]
                x.append((val-self.means[key])/self.stds[key])
            X.append(x)
        return np.asarray(X, dtype=np.float32)
    def as_dict(self): return {"categories": self.categories, "means": self.means, "stds": self.stds}
    @classmethod
    def from_dict(cls,d): return cls(d["categories"], d["means"], d["stds"])

class VAE(nn.Module):
    def __init__(self, input_dim, hidden=(48,24), latent=8):
        super().__init__()
        self.encoder=nn.Sequential(nn.Linear(input_dim,hidden[0]),nn.ReLU(),nn.Linear(hidden[0],hidden[1]),nn.ReLU())
        self.mu=nn.Linear(hidden[1],latent); self.logvar=nn.Linear(hidden[1],latent)
        self.decoder=nn.Sequential(nn.Linear(latent,hidden[1]),nn.ReLU(),nn.Linear(hidden[1],hidden[0]),nn.ReLU(),nn.Linear(hidden[0],input_dim))
    def forward(self,x):
        h=self.encoder(x); mu=self.mu(h); logvar=self.logvar(h).clamp(-10,10)
        z=mu+torch.randn_like(mu)*torch.exp(0.5*logvar)
        return self.decoder(z),mu,logvar
    def reconstruct(self,x): return self.decoder(self.mu(self.encoder(x)))

def loss_fn(recon, x, mu, logvar):
    # Mean per-coordinate squared reconstruction error plus mean KL to N(0,1).
    rec=((recon-x)**2).mean(dim=1)
    kl=-0.5*(1+logvar-mu.pow(2)-logvar.exp()).mean(dim=1)
    return (rec+0.03*kl).mean()

def residuals(model, pre, rows):
    x=pre.encode(rows); xt=torch.tensor(x)
    with torch.no_grad(): pred=model.reconstruct(xt).numpy()
    # Per input feature residuals: absolute normalized residuals; aggregate numeric dims and categorical one-hot group.
    out=[]; offset=0
    for key in CATEGORICAL:
        n=len(pre.categories[key]); out.append((key, np.mean(np.abs(pred[:,offset:offset+n]-x[:,offset:offset+n]),axis=1))); offset+=n
    for key in NUMERIC:
        out.append((key,np.abs(pred[:,offset]-x[:,offset]))); offset+=1
    return x,pred,{k:v for k,v in out}

def score_rows(model, pre, rows):
    x,pred,byfeature=residuals(model,pre,rows)
    scores=np.mean((pred-x)**2,axis=1)
    result=[]
    for i,row in enumerate(rows):
        deviations={k:round(float(v[i]),5) for k,v in byfeature.items() if float(v[i]) >= 0.15}
        ranked=sorted(({"feature":k,"residual":round(float(v[i]),5)} for k,v in byfeature.items()),key=lambda z:z["residual"],reverse=True)[:4]
        result.append((float(scores[i]), deviations, ranked))
    return result
