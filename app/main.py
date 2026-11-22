"""Versioned API for synthetic educational anomaly scoring."""
import json, logging
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from app.config import ARTIFACT_PATH, CATEGORICAL, FEATURES, METADATA_PATH, NUMERIC, UNUSUAL_PATH, TRAIN_PATH
from app.model import Preprocessor, VAE, read_csv, review_recommended, score_rows
from app.schemas import Application, BatchRequest, BatchResponse, DemoSamples, ScoreResponse

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log=logging.getLogger("appguard")
DISCLAIMER="Anomaly score indicates statistical deviation from synthetic baseline patterns. It is not a finding of fraud or an automated decision. A qualified human must review any follow-up."
state={}

@asynccontextmanager
async def lifespan(app):
    if not ARTIFACT_PATH.exists() or not METADATA_PATH.exists():
        raise RuntimeError("Demo model artifact missing; run python scripts/train_model.py")
    meta=json.loads(METADATA_PATH.read_text())
    if meta.get("feature_schema") != FEATURES:
        raise RuntimeError("Model metadata feature order does not match the API scoring schema.")
    if meta.get("encoded_feature_order") != CATEGORICAL + NUMERIC:
        raise RuntimeError("Model metadata encoded feature order does not match the preprocessor.")
    pre=Preprocessor.from_dict(meta["preprocessor"])
    model=VAE(meta["input_dim"],tuple(meta["hidden_sizes"]),meta["latent_size"])
    checkpoint=__import__("torch").load(ARTIFACT_PATH,map_location="cpu",weights_only=True)
    model.load_state_dict(checkpoint["state_dict"]); model.eval()
    state.update(meta=meta,pre=pre,model=model)
    log.info("Loaded model version %s",meta["model_version"])
    yield

app=FastAPI(title="AppGuard AI — Synthetic Application Anomaly Demo",version="1.0.0",description="Educational anomaly scoring only. No fraud finding or automated adverse decision.",lifespan=lifespan)

WEB_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"
WEB_ASSETS = WEB_DIST / "assets"
if WEB_ASSETS.is_dir():
    app.mount("/assets", StaticFiles(directory=WEB_ASSETS), name="assets")

@app.exception_handler(Exception)
async def safe_error(request: Request, exc: Exception):
    log.error("Unhandled API error on %s",request.url.path)
    return JSONResponse(status_code=500,content={"detail":"Internal scoring service error. No submitted record was logged."})

@app.get("/api/v1/health")
def health(): return {"status":"healthy","model_loaded":bool(state),"model_version":state.get("meta",{}).get("model_version")}

@app.get("/api/v1/model-info")
def model_info():
    m=state["meta"]
    return {"model_version":m["model_version"],"feature_schema":m["feature_schema"],"calibration":m["calibration"],"intended_use":"Synthetic demonstration and software evaluation only","human_review_required":True,"disclaimer":DISCLAIMER}

@app.get("/api/v1/demo/samples",response_model=DemoSamples)
def demo_samples():
    baseline=read_csv(TRAIN_PATH)[:12]; unusual=read_csv(UNUSUAL_PATH)[:12]
    records=[]
    for i,r in enumerate(baseline): records.append({**{k:r[k] for k in state["meta"]["feature_schema"]},"sample_id":f"B-{i+1:03}","demo_group":"baseline"})
    for i,r in enumerate(unusual): records.append({**{k:r[k] for k in state["meta"]["feature_schema"]},"sample_id":f"U-{i+1:03}","demo_group":"unusual_demo"})
    return {"records":records}

def score(applications):
    # Keep the stable ID in the response but never pass it to the VAE/preprocessor.
    rows=[a.model_dump(include=set(FEATURES)) for a in applications]
    outputs=score_rows(state["model"],state["pre"],rows); threshold=state["meta"]["calibration"]["threshold"]
    return [ScoreResponse(application_id=application.application_id,model_version=state["meta"]["model_version"],anomaly_score=s,threshold=threshold,review_recommended=review_recommended(s,threshold),feature_deviations=d,top_deviations=t,disclaimer=DISCLAIMER) for application,(s,d,t) in zip(applications,outputs)]

@app.post("/api/v1/score",response_model=ScoreResponse)
def score_one(application: Application): return score([application])[0]

@app.post("/api/v1/score/batch",response_model=BatchResponse)
def score_batch(request: BatchRequest): return {"results":score(request.applications)}

@app.get("/{web_path:path}", include_in_schema=False)
def serve_frontend(web_path: str):
    if web_path.startswith("api/") or web_path == "api":
        return JSONResponse(status_code=404, content={"detail":"Not found"})
    requested = (WEB_DIST / web_path).resolve()
    if WEB_DIST.resolve() not in requested.parents and requested != WEB_DIST.resolve():
        return JSONResponse(status_code=404, content={"detail":"Not found"})
    if requested.is_file():
        return FileResponse(requested)
    index = WEB_DIST / "index.html"
    if index.is_file():
        return FileResponse(index)
    return JSONResponse(status_code=404, content={"detail":"Frontend build is missing"})
