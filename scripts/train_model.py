"""Train VAE and calibrate a baseline-only percentile threshold."""
import argparse, json, random, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import numpy as np
import torch
from app.config import ARTIFACT_DIR, ARTIFACT_PATH, METADATA_PATH, TRAIN_PATH, CALIBRATION_PATH, MODEL_VERSION
from app.model import Preprocessor, VAE, read_csv, score_rows, loss_fn

def train(epochs=45, batch_size=64, lr=0.001, seed=23, latent=8, hidden=(48,24)):
    random.seed(seed); np.random.seed(seed); torch.manual_seed(seed)
    torch.set_num_threads(1)
    train_rows=read_csv(TRAIN_PATH); cal_rows=read_csv(CALIBRATION_PATH)
    pre=Preprocessor().fit(train_rows); x=torch.tensor(pre.encode(train_rows))
    model=VAE(pre.dim,hidden,latent); optimizer=torch.optim.Adam(model.parameters(),lr=lr)
    model.train()
    for epoch in range(epochs):
        order=torch.randperm(len(x))
        for start in range(0,len(x),batch_size):
            batch=x[order[start:start+batch_size]]; optimizer.zero_grad()
            recon,mu,logvar=model(batch); loss=loss_fn(recon,batch,mu,logvar); loss.backward(); optimizer.step()
    model.eval(); cal_scores=[s[0] for s in score_rows(model,pre,cal_rows)]
    threshold=float(np.quantile(cal_scores,0.99,method="higher"))
    ARTIFACT_DIR.mkdir(parents=True,exist_ok=True)
    torch.save({"state_dict":model.state_dict()},ARTIFACT_PATH)
    meta={"model_version":MODEL_VERSION,"artifact":ARTIFACT_PATH.name,"feature_schema":["policy_type","requested_coverage","deductible","payment_frequency","channel","submission_velocity_24h","recent_change_count"],"preprocessor":pre.as_dict(),"input_dim":pre.dim,"hidden_sizes":list(hidden),"latent_size":latent,"training":{"rows":len(train_rows),"epochs":epochs,"batch_size":batch_size,"learning_rate":lr,"seed":seed},"calibration":{"method":"99th percentile (higher order statistic) of baseline calibration reconstruction MSE","sample_size":len(cal_rows),"threshold":threshold,"score":"mean squared error across one-hot and standardized numeric dimensions"}}
    METADATA_PATH.write_text(json.dumps(meta,indent=2)+"\n")
    print(f"Trained {MODEL_VERSION}; threshold={threshold:.8f}; calibration n={len(cal_rows)}")
    return meta

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train and calibrate the synthetic AppGuard VAE")
    parser.add_argument("--epochs", type=int, default=45)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--learning-rate", type=float, default=0.001)
    parser.add_argument("--seed", type=int, default=23)
    parser.add_argument("--latent-size", type=int, default=8)
    parser.add_argument("--hidden-sizes", default="48,24", help="Comma-separated encoder/decoder widths")
    args = parser.parse_args()
    hidden = tuple(int(x) for x in args.hidden_sizes.split(","))
    if not hidden or any(width < 2 for width in hidden) or args.epochs < 1 or args.batch_size < 1 or args.latent_size < 1 or args.learning_rate <= 0:
        parser.error("epochs, batch-size, latent-size and hidden widths must be positive; learning-rate must be positive")
    train(epochs=args.epochs, batch_size=args.batch_size, lr=args.learning_rate, seed=args.seed, latent=args.latent_size, hidden=hidden)
