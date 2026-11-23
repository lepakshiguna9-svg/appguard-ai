# Model Card — AppGuard AI Synthetic Demo

## Intended use

Education and local software demonstration of unsupervised reconstruction-based anomaly scoring on generated synthetic insurance application-like records. Scores can illustrate when a record departs from this toy baseline and suggest that a qualified person could examine it.

## Out-of-scope use

This model is not validated or authorized for real applications, fraud determinations, applicant prioritization, eligibility, pricing, underwriting, policy cancellation, claims, or any automated adverse action. It must not label an applicant as fraudulent. It is not a replacement for qualified review.

## Data and inputs

Only deterministic synthetic data. The preserved VAE model inputs are exactly seven fields: policy type, requested coverage, deductible, payment frequency, channel, submission velocity, and recent-change count. Optional opaque-reference, consistency, and repeated-submission values can be supplied separately to transparent synthetic demo flag rules; they are never encoded, scored, or used for calibration. They contain no identity values or personal data and do not verify identity. The API may carry an application ID for result matching, but it is excluded from both model features and flag rules. Age and income are synthetic display context only, not model inputs or evaluation labels.

## Measurement and limitations

The preserved version `1.0.0-demo` uses its original seven-feature weights, fitted preprocessing, and 99th-percentile threshold `0.06842832267284393`. The threshold has no demonstrated relationship to real-world risk. Scores are unbounded reconstruction errors; valid inputs far outside the training range can produce very large scores. Per-feature residuals are statistical differences, not causal explanations. The separate flag rules use explicit synthetic demo thresholds and are not model outputs. Synthetic examples do not support claims about real-world accuracy, fairness, or effectiveness.

## Human review and governance

Any follow-up must be reviewed by a qualified human using independent, appropriate evidence and documented procedures. Real-world use would require review by qualified legal, privacy, insurance compliance, and model-risk professionals. This card makes no categorical legal conclusion about the FCRA or state insurance rules.
