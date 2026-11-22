# 100-record synthetic API test batch

`test_batch_100.json` is a deterministic JSON array of 100 records accepted by the current AppGuard API and VAE feature schema: 70 typical-pattern examples and 30 intentionally unusual examples. Regenerate it with `python scripts/generate_test_batch.py`.

`test_batch_100_labels.json` is a separate evaluation-only sidecar keyed by `application_id`. It stores `demo_label` (`typical_synthetic` or `unusual_synthetic`) and a short construction scenario. **Do not upload this sidecar.** Labels are not present in the application JSON and are never passed to the model.

## API and model fields

| Field | Type | Model input? | Purpose |
|---|---|---:|---|
| `application_id` | string | No | Synthetic stable record key for matching API results to labels. |
| `policy_type` | category | Yes | Model-supported synthetic line (`auto`, `home`, `renters`). |
| `requested_coverage` | number | Yes | Requested coverage value. |
| `deductible` | number | Yes | Requested deductible value. |
| `payment_frequency` | category | Yes | Model-supported cadence (`monthly`, `quarterly`, `annual`). |
| `channel` | category | Yes | Model-supported channel (`agent`, `web`, `phone`). |
| `submission_velocity_24h` | number | Yes | Synthetic submission count/rate feature. |
| `recent_change_count` | number | Yes | Synthetic recent application-change count. |

The model uses only the seven fields marked as model inputs. The API echoes `application_id` for matching but excludes it from preprocessing and VAE scoring. Generation uses fixed seed `20261122`; all values remain within the current API bounds. These are fictional software test fixtures, not observations about applicants. “Unusual” is a planted synthetic label, not a fraud finding or real-world outcome. Evaluation metrics on this batch do not establish accuracy, fairness, or effectiveness outside this demonstration.
