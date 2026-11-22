# 100-record synthetic API test batch

`test_batch_100.json` is a JSON array of 100 generated application objects, directly usable by the AppGuard batch upload. It contains 70 typical-pattern examples and 30 intentionally unusual examples. IDs use the `SYNTH-APP-###` prefix. The file is deterministic; regenerate it with `python scripts/generate_test_batch.py`.

`test_batch_100_labels.json` is a separate evaluation-only sidecar keyed by `application_id`. It stores `demo_label` (`typical_synthetic` or `unusual_synthetic`) and a short synthetic scenario name. **Do not upload this sidecar.** Labels are not included in `test_batch_100.json`, API scoring requests, or model inputs.

## API fields

| Field | Type | Purpose |
|---|---|---|
| `application_id` | string | Synthetic record key for response matching; not a model feature. |
| `policy_type` | category | Synthetic policy line (`auto`, `homeowners`, `term_life`, `renters`, `commercial_property`). |
| `coverage_amount` | number, USD | Requested coverage limit. |
| `deductible_amount` | number, USD | Requested deductible. |
| `premium_frequency` | category | `monthly`, `quarterly`, `semi_annual`, or `annual`. |
| `application_channel` | category | Synthetic channel (`online_direct`, `independent_broker`, `captive_agent`, `aggregator_partner`, `mobile_app`). |
| `applicant_age` | number | Synthetic age value within API bounds; no real person is represented. |
| `annual_income_estimate` | number, USD | Synthetic estimate within API bounds; no real financial data is represented. |
| `prior_application_count` | number | Synthetic count within API bounds. |
| `recent_address_changes_count` | number | Synthetic count within API bounds. |
| `property_or_vehicle_age` | number | Synthetic age in years within API bounds. |
| `beneficiary_relation` | category | API enum value used in synthetic cases. |
| `declared_credit_tier` | category | API enum value used in synthetic cases. |

The generator uses fixed seed `20261122`; values stay within the current API's documented limits and categorical choices. All records are fictional test fixtures, not observations about real applicants. Unusual labels identify deliberately constructed software test scenarios only; they are not fraud labels and do not establish model accuracy, fairness, or effectiveness. Use the application JSON by itself for batch scoring; keep the label sidecar out of scoring requests and model training.
