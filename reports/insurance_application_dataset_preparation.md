# Insurance Application Dataset Preparation Report

## Purpose and source

This dataset exists only to demonstrate an unsupervised anomaly-scoring pipeline. A seeded Python generator creates all rows locally. It uses no public or licensed sources, no real applicant records, and no network access. Separate files hold 1,800 baseline training rows, 500 baseline calibration rows, and 60 deliberately unusual software-demo rows. Seed values are fixed in `scripts/generate_data.py` for reproducibility.

## Schema and feature rationale

The original VAE uses exactly seven fields: `policy_type`, `requested_coverage`, `deductible`, `payment_frequency`, `channel`, `submission_velocity_24h`, and `recent_change_count`. Six optional abstract consistency/count fields can be supplied as separate synthetic flag evidence. These contain no names, dates of birth, documents, addresses, contact values, beneficiary categories, device IDs, protected traits, or personal data; they are not VAE inputs and do not verify anyone's identity. The API rejects other unexpected fields. The generated `demo_label` is held in a separate sidecar and is excluded from model scoring and flag generation.

## Data quality and preprocessing

The original committed baseline and calibration files, preprocessing metadata, model weights, feature order, and threshold are preserved. Calibration is held out from training and supplies the 99th-percentile threshold. Unusual demo and labeled evaluation rows do not fit preprocessing, train weights, or tune the threshold. The labeled batch retains its original seven VAE inputs; separate optional flag evidence is generated from an independent random stream and is not derived from labels. The preprocessor learns category vocabularies and numeric means/standard deviations from baseline training rows only. Numeric values are standardized and categories use one-hot encoding. Feature order is stored in the versioned artifact metadata.

## Limitations

These distributions are handcrafted and do not represent an insurer's book, actual application workflow, or prevalence of any behavior. Synthetic unusual rows are engineered examples, not labels of fraud. Dataset counts and scores are software-demo details. No results establish accuracy, precision, recall, fairness, business effectiveness, or suitability for real insurance decisions.
