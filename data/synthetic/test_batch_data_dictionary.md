# 100-record synthetic API test batch

`test_batch_100.json` is a reproducible JSON array generated with seed `20261122`. It has 100 synthetic records: 70 typical-pattern and 30 intentionally unusual examples. Regenerate it with `python scripts/generate_test_batch.py`.

The committed VAE uses exactly seven fields. Six optional values are carried separately for synthetic demo flag rules; the API validates them, but they are excluded from VAE preprocessing, scoring, and calibration. The generator uses a separate random stream for these values and does not inspect labels when generating them.

`test_batch_100_labels.json` is a separate evaluation-only sidecar joined by `application_id`. It stores `demo_label` (`typical_synthetic` or `unusual_synthetic`) and a construction scenario. **Do not upload this sidecar.** Labels are never sent to the scoring API or used to create flags.

`test_batch_100_display.json` is presentation-only synthetic context keyed by application ID. Its age and income fields are not submitted to the API, model, or flag rules.

## VAE feature fields

| Field | Type | VAE input? | Purpose |
|---|---|---:|---|
| `application_id` | string | No | Stable key for joining returned results to local labels. |
| `policy_type` | category | Yes | Synthetic insurance product category. |
| `requested_coverage` | number | Yes | Synthetic requested amount. |
| `deductible` | number | Yes | Synthetic deductible value. |
| `payment_frequency` | category | Yes | Synthetic billing cadence. |
| `channel` | category | Yes | Synthetic submission channel. |
| `submission_velocity_24h` | number | Yes | Synthetic submission count used by both VAE and a separate count rule. |
| `recent_change_count` | number | Yes | Synthetic application-change count used by both VAE and a separate count rule. |

## Separate synthetic flag-evidence fields

| Field | Type | VAE input? | Demo flag rule |
|---|---|---:|---|
| `duplicate_identity_reference_count` | number, 0–100 | No | Repeated opaque reference count when greater than 1. No identity value is present. |
| `identity_document_consistency` | number, 0–1 | No | Synthetic consistency deviation when below 0.80. Not document validation. |
| `application_detail_consistency` | number, 0–1 | No | Synthetic consistency deviation when below 0.80. |
| `contact_reference_consistency` | number, 0–1 | No | Synthetic consistency deviation when below 0.80; contains no contact details. |
| `beneficiary_reference_consistency` | number, 0–1 | No | Synthetic consistency deviation when below 0.80; contains no relationship category. |
| `repeat_submission_count` | number, 0–10,000 | No | Unusual submission behaviour flag when greater than 3. |

These extra values are fictional numeric fixtures for software demonstration, not observations or verified evidence about people. They do not verify identity, prove fraud, or establish intent. Submission-count flags use explicit demo rules: more than 5 submissions per 24 hours, more than 6 recent changes, or more than 3 repeated submissions.

The original model artifact, preprocessing configuration, seven-feature order, and threshold are retained. The score remains unbounded reconstruction MSE, with review recommended only when the score is strictly greater than the original threshold. The labeled batch's original counts are 30 TP, 0 FN, 10 FP, and 60 TN; the synthetic metrics do not establish real-world performance.
