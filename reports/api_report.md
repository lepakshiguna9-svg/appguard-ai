# AppGuard AI Fraud Detection API

The local FastAPI service exposes OpenAPI at `/docs` and versioned JSON routes below. Application bodies contain exactly seven modeled fields; extra fields are rejected. Scores are deterministic for the loaded artifact and return the model version, finite anomaly score, calibration threshold, boolean review recommendation, per-feature deviations, and human-review disclaimer. Batch bodies accept 1–100 applications. Pydantic rejects missing, non-finite, out-of-range, or unexpected inputs. Unseen categorical values are accepted and mapped to the reserved unknown category.

| Method and route | Response |
|---|---|
| `GET /api/v1/health` | Service status and loaded model status/version. |
| `GET /api/v1/model-info` | Input schema, calibration method/sample size/threshold, intended-use limit. |
| `GET /api/v1/demo/samples` | Synthetic baseline and unusual examples with display IDs and demo group. |
| `POST /api/v1/score` | One score response. |
| `POST /api/v1/score/batch` | `{ "applications": [...] }` maps to `{ "results": [...] }`. |

Example:

```sh
curl -s http://127.0.0.1:8000/api/v1/score \
  -H 'Content-Type: application/json' \
  -d '{"policy_type":"auto","requested_coverage":18000,"deductible":1000,"payment_frequency":"monthly","channel":"web","submission_velocity_24h":1,"recent_change_count":0}'
```

Errors follow FastAPI/Pydantic JSON error responses (typically 422 for invalid requests); unexpected server errors return a generic 500 message. Logging records service/model startup and request path for unexpected errors, never application body contents. API and Vite communicate locally through a development proxy; no telemetry or external data transmission is included.

Run using `./scripts/run_backend.sh`. The demo UI is served separately by `./scripts/run_frontend.sh` and calls these actual routes.
