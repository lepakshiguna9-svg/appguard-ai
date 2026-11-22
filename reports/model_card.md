# Model Card — AppGuard AI Synthetic Demo

## Intended use

Education and local software demonstration of unsupervised reconstruction-based anomaly scoring on generated synthetic insurance application-like records. Scores can illustrate when a record departs from this toy baseline and suggest that a qualified person could examine it.

## Out-of-scope use

This model is not validated or authorized for real applications, fraud determinations, applicant prioritization, eligibility, pricing, underwriting, policy cancellation, claims, or any automated adverse action. It must not label an applicant as fraudulent. It is not a replacement for qualified review.

## Data and inputs

Only deterministic synthetic data. Inputs are policy type, requested coverage, deductible, payment frequency, channel, synthetic submission velocity, and synthetic recent-change count. No identifiers, protected traits, or direct sensitive attributes are used. Some operational variables could still be inappropriate in a real context and require careful review.

## Measurement and limitations

The threshold is the 99th percentile of a separate synthetic baseline calibration set. It has no demonstrated relationship to real-world risk. Scores are reconstruction errors in a learned representation; per-feature residuals are statistical differences, not causal explanations. Synthetic examples do not support claims about accuracy, precision, recall, fairness, or effectiveness. The model may be sensitive to distribution, data-quality, and category changes.

## Human review and governance

Any follow-up must be reviewed by a qualified human using independent, appropriate evidence and documented procedures. Real-world use would require review by qualified legal, privacy, insurance compliance, and model-risk professionals. This card makes no categorical legal conclusion about the FCRA or state insurance rules.
