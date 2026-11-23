# AppGuard AI: Insurance Application Anomaly Demo

A complete local demo of a PyTorch Variational Autoencoder and FastAPI service with a React/TypeScript interface. It learns a baseline from deterministic **synthetic** data and flags statistical deviations for optional human review. A score is not a fraud finding. Use only synthetic JSON in the batch upload; uploaded records are scored in memory and not retained.

> **Human review required.** Never use this prototype to accuse an applicant, automatically approve or deny an application, set a price, cancel a policy, or take another adverse action. Synthetic results do not establish real-world accuracy, precision, recall, fairness, or effectiveness. Real-world use would require review by qualified legal, privacy, insurance compliance, and model-risk professionals.

No real applicant data, telemetry, or external data service is used. The interface relies on system fonts and local API calls.

## Requirements

macOS with zsh, Python **3.11 through 3.14**, Node.js **20+**, and npm. Check versions with `python3 --version` and `node --version`.

## Setup

From this project root:

```sh
./scripts/setup.sh
```

The setup script checks versions, creates a project-local `.venv`, installs pinned dependencies, installs frontend dependencies, deterministically generates synthetic data, and trains/calibrates the demo artifact. To regenerate only data/model:

```sh
.venv/bin/python scripts/generate_data.py
.venv/bin/python scripts/train_model.py
```

Regenerate the 100-record API upload batch independently with:

```sh
.venv/bin/python scripts/generate_test_batch.py
```

## Run locally

Open two terminal tabs at the project root.

Terminal 1 — API:

```sh
./scripts/run_backend.sh
```

Terminal 2 — frontend:

```sh
./scripts/run_frontend.sh
```

Open <http://127.0.0.1:5173>. The API is at <http://127.0.0.1:8000>; interactive OpenAPI docs are at <http://127.0.0.1:8000/docs>. The Vite proxy forwards `/api` to the local API. To stop both, press Ctrl+C in each terminal. `./scripts/run_demo.sh` starts both services in one terminal and attempts to stop both on Ctrl+C.

If a port is occupied, set `APPGUARD_API_PORT=8001` for the backend and set `APPGUARD_API_TARGET=http://127.0.0.1:8001` for the frontend, or set `APPGUARD_WEB_PORT=5174` if the UI port is occupied. Check what owns a port with `lsof -nP -iTCP:8000 -sTCP:LISTEN` before taking action; do not blindly kill processes.

## Deploy a public demo

The Docker image builds the React frontend and serves it from the FastAPI service, so the demo needs only one hosted web service. The service listens on Render's `PORT` environment variable and reports health at `/api/v1/health`.

1. In Render, choose **New → Web Service**, connect the GitHub repository `lepakshiguna9-svg/appguard-ai`, and select the `main` branch.
2. Select **Docker** as the runtime, keep the Dockerfile path as `./Dockerfile`, and create the service. No environment variables are required.
3. When deployment finishes, open the generated `https://…onrender.com` address. The UI and API are served from that same address.

Render can redeploy from `main` after each push. To publish later changes, commit and push them to GitHub; wait for the new deployment to finish, then refresh the same URL. This is an educational demo using synthetic data, not a production fraud decision system.

## Verify

```sh
.venv/bin/python -m pytest -q
(cd frontend && npm test)
(cd frontend && npm run build)
```

A trained artifact and generated CSVs are required. The tests exercise the model-backed API and frontend build. They do not evaluate real-world effectiveness.

## Reproduce the labeled synthetic evaluation

Start the API, then run this from the project root:

```sh
.venv/bin/python scripts/evaluate_synthetic_batch.py --api-url http://127.0.0.1:8000
```

It requires `data/synthetic/test_batch_100.json`, `data/synthetic/test_batch_100_labels.json`, and a healthy API with the model loaded. The original VAE uses exactly seven fields listed by `/api/v1/model-info`; optional abstract consistency/count values are separately validated flag evidence and never enter VAE preprocessing or scoring. `application_id` is tracking-only. The command submits application data to `/api/v1/score/batch`; the API builds flags from the model score and separate optional flag values. Labels are read locally and joined to results by `application_id`; they are never sent to the API, scoring, or flag-generation code. The interface also reads `data/synthetic/test_batch_100_display.json` for synthetic age and income shown in the table; those fields are client-only display context.

The report counts true positives (intentionally unusual and flagged), false negatives (intentionally unusual and not flagged), false positives (typical and flagged), and true negatives (typical and not flagged). It also reports accuracy `(TP+TN)/N`, precision `TP/(TP+FP)`, recall `TP/(TP+FN)`, F1 `2TP/(2TP+FP+FN)`, false-positive rate `FP/(FP+TN)`, and ROC-AUC from raw score ranks with half-credit ties. A zero denominator or a missing class is shown as `N/A`.

These labels describe constructed synthetic examples, not real incidents or verified fraud. The resulting metrics demonstrate software behavior on this generated batch only; they do not estimate real-world accuracy, precision, recall, fairness, or effectiveness and must not guide adverse decisions.

## Score scale and workbench controls

The original committed model is `1.0.0-demo` with seven VAE features and calibrated threshold `0.06842832267284393`. Its score is mean squared reconstruction error across one-hot categorical values and standardized numeric values; it is non-negative and mathematically unbounded. Calibration and runtime scoring use the same committed model, feature order, fitted preprocessor, transformations, and score function. Optional flag-evidence fields do not enter this pipeline. The workbench shows the raw score, threshold, and score-to-threshold multiple in expandable Model Details without capping or changing the underlying values.

The workbench includes curated API scenarios, a deterministic client-generated synthetic batch, JSON upload, and a single-record synthetic scoring form. Uploaded age and income values are optional display context and are removed before scoring. The VAE uses the original seven model features. Optional consistency/count values are separate synthetic flag evidence: transparent demo rules evaluate them outside the VAE, and they do not verify identity. Workflow choices and notes are a local session preview only; they do not contact anyone, persist a real review state, or take an insurance action. The table also shows simulated age and income from `test_batch_100_display.json`, joined by stable application ID and never used as model features or labels.

## Explainable flag signals

Scoring responses include an additive `flags` array. The VAE score, original threshold comparison, and feature residuals use only the original seven-feature pipeline. Other flags are computed separately from the score or optional synthetic flag evidence using explicit demo thresholds. Consistency/count indicators are fictional numeric inputs, not identity checks or verified application evidence. Invalid or incomplete uploaded rows remain visible with a client-side data-quality warning and are withheld from scoring. Queue filters support category and severity. The selected panel separates VAE recommendation, separate flags, synthetic ground-truth label, and session-only human workflow preview. Labels are excluded from both model scoring and flag generation.

## API summary

- `GET /api/v1/health`
- `GET /api/v1/model-info`
- `GET /api/v1/demo/samples`
- `POST /api/v1/score`
- `POST /api/v1/score/batch` — accepts 1–100 records

For a batch-upload test, use [`data/synthetic/test_batch_100.json`](data/synthetic/test_batch_100.json), a 100-record JSON array matching the current API application schema (70 typical-pattern and 30 intentionally unusual examples). The separate [`test_batch_100_labels.json`](data/synthetic/test_batch_100_labels.json) is for test interpretation only; do not upload it. [`test_batch_100_display.json`](data/synthetic/test_batch_100_display.json) supplies synthetic-only table context and is also not sent for scoring. See [`test_batch_data_dictionary.md`](data/synthetic/test_batch_data_dictionary.md) for fields, limits, score-scale context, and the synthetic-only caveat. API request details are also available at `/docs` and in the [API report](reports/api_report.md).

## Project contents

- `app/` API, schemas, preprocessing, model and configuration
- `scripts/` deterministic generation, training/calibration, labeled evaluation and local launch
- `data/synthetic/` local synthetic CSVs, the 100-record batch upload JSON, separate evaluation labels and display-only synthetic context, and data dictionaries
- `artifacts/` versioned trained weights and preprocessing/calibration metadata
- `frontend/` responsive, API-backed review interface
- `tests/` automated software checks
- `reports/` dataset, model, API, final project reports and model card

## Course deliverables

The four narrative deliverables are in `reports/`: the dataset preparation report, VAE model report, API report, and final project report. The model card is an additional summary. This repository does not submit or publish anything.
