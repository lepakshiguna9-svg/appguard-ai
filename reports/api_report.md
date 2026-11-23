# AppGuard AI Fraud Detection API

The local FastAPI service exposes OpenAPI at `/docs` and versioned JSON routes below. The original VAE schema contains exactly seven modeled fields; `application_id` is optional and used only for request/result matching. Six optional abstract consistency/count fields are validated separately as synthetic flag evidence. They are never passed to the VAE preprocessor, reconstruction function, or threshold comparison. Older seven-field clients remain accepted. Other unexpected fields, including synthetic labels, are rejected. Score responses return the original model version, anomaly score, threshold, recommendation, feature residuals, an additive `flags` array, and human-review disclaimer. Batch bodies accept 1–100 applications. Pydantic rejects missing, non-finite, out-of-range, or unexpected inputs. Unseen categories map to the fitted preprocessor's reserved unknown category.

The anomaly score is unbounded mean squared reconstruction error across the original seven-feature encoded vector. Calibration and runtime scoring use the committed version `1.0.0-demo` weights, fitted preprocessor, encoded feature order, score function, and threshold `0.06842832267284393`. API startup verifies that schema and preprocessing metadata. Optional flag evidence is handled by separate explicit demo rules and cannot alter a VAE score. Flags and model recommendations are statistical/software signals, not fraud or identity findings; human review is required.

| Method and route | Response |
|---|---|
| `GET /api/v1/health` | Service status and loaded model status/version. |
| `GET /api/v1/model-info` | Seven VAE features, separate optional flag-evidence schema, calibration method/sample size/threshold, intended-use limit. |
| `GET /api/v1/demo/samples` | Synthetic baseline and unusual examples with display IDs and demo group. |
| `POST /api/v1/score` | One score response. |
| `POST /api/v1/score/batch` | `{ "applications": [...] }` maps to `{ "results": [...] }`. |

Example:

```sh
curl -s http://127.0.0.1:8000/api/v1/score \
  -H 'Content-Type: application/json' \
  -d '{"policy_type":"auto","requested_coverage":18000,"deductible":1000,"payment_frequency":"monthly","channel":"web","submission_velocity_24h":1,"recent_change_count":0,"identity_document_consistency":0.98,"application_detail_consistency":0.98,"contact_reference_consistency":0.98,"beneficiary_reference_consistency":0.98,"duplicate_identity_reference_count":0,"repeat_submission_count":0}'
```

Errors follow FastAPI/Pydantic JSON error responses (typically 422 for invalid requests); unexpected server errors return a generic 500 message. Logging records service/model startup and request path for unexpected errors, never application body contents. API and Vite communicate locally through a development proxy; no telemetry or external data transmission is included.

Run using `./scripts/run_backend.sh`. The demo UI is served separately by `./scripts/run_frontend.sh` and calls these actual routes.
