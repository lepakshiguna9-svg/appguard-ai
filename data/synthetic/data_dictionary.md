# Synthetic data dictionary

All records are randomly generated from fixed seeds; there is no applicant data. `baseline_train.csv` trains the VAE, `baseline_calibration.csv` sets the review threshold, and `unusual_demo.csv` provides synthetic software-demo edge cases. `demo_label` is generated solely for display/evaluation and never enters model input.

| Field | Type | Input? | Demonstration rationale |
|---|---|---:|---|
| policy_type | category | Yes | Distinguishes product-level coverage patterns. |
| requested_coverage | numeric | Yes | Requested amount is central application context. |
| deductible | numeric | Yes | Contract choice that relates to requested coverage. |
| payment_frequency | category | Yes | Describes requested billing cadence. |
| channel | category | Yes | Operational submission route; not applicant identity. |
| submission_velocity_24h | numeric | Yes | Synthetic count-like rate to demonstrate process anomalies. |
| recent_change_count | numeric | Yes | Synthetic number of application edits; process context only. |
| demo_label | category | No | Synthetic construction label, excluded from model features. |

Identifiers, names, addresses, demographics, credit, health, and other protected or sensitive applicant attributes are excluded. Channels and operational counts are included only to teach unsupervised scoring and require real-world suitability review.
