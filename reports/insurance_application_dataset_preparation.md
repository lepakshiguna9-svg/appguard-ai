# Insurance Application Dataset Preparation Report

## Purpose and source

This dataset exists only to demonstrate an unsupervised anomaly-scoring pipeline. A seeded Python generator creates all rows locally. It uses no public or licensed sources, no real applicant records, and no network access. Separate files hold 1,800 baseline training rows, 500 baseline calibration rows, and 60 deliberately unusual software-demo rows. Seed values are fixed in `scripts/generate_data.py` for reproducibility.

## Schema and feature rationale

The seven model inputs are `policy_type`, `requested_coverage`, `deductible`, `payment_frequency`, `channel`, `submission_velocity_24h`, and `recent_change_count`. Product type distinguishes lines of business; requested amount and deductible are application contract choices; payment frequency is a billing choice; channel is an operational route; submission velocity and edit count are synthetic process counts. These are educational examples only. Their inclusion does not establish that they are suitable or fair in any real insurance workflow. No identity, protected trait, demographic, health, credit, address, or applicant identifier is modeled. The generated `demo_label` is for synthetic construction only and is excluded from all model inputs.

## Data quality and preprocessing

The generator uses plausible but intentionally simple distributions and fixed value ranges. The baseline includes categories used by the demo; unusual rows include category and numeric deviations. The preprocessor learns category vocabularies and numeric means/standard deviations from training rows only. Missing numeric values use the training mean; absent categories map to a reserved missing category; unseen categories map to a reserved unknown category. Numeric values are standardized. Categories use one-hot encoding. Feature order is stored in the versioned artifact metadata.

## Limitations

These distributions are handcrafted and do not represent an insurer's book, actual application workflow, or prevalence of any behavior. Synthetic unusual rows are engineered examples, not labels of fraud. Dataset counts and scores are software-demo details. No results establish accuracy, precision, recall, fairness, business effectiveness, or suitability for real insurance decisions.
