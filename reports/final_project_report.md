# Final AppGuard AI Project Report

## Overview

AppGuard AI is a local educational prototype for unsupervised statistical anomaly scoring of insurance application-like records. A PyTorch VAE learns a seeded synthetic baseline; a held-out synthetic baseline set calibrates a 99th-percentile threshold. FastAPI exposes health, model metadata, demo records, single-score, and batch-score routes. A React/TypeScript interface retrieves synthetic records and scores through the live API, displays returned score and review state, exposes submitted fields and prominent feature residuals, and accepts bounded JSON batches.

## End-to-end design

The generator writes separate training, calibration, and unusual demonstration CSVs. Training fits the preprocessing schema on baseline training rows, optimizes the VAE, scores calibration rows, and saves a versioned CPU model state plus JSON metadata. API startup safely loads this artifact; request validation bounds field values and batch size. The UI uses a Vite `/api` proxy and no hard-coded record scores. Synthetic IDs and labels are display-only and excluded from the model inputs.

## Evaluation

The project verification checks determinism in generated data, model/artifact load, API health and metadata, demo retrieval, finite batch scores, threshold-based review flag consistency, invalid input handling, bounded batches, and frontend production compilation. These checks establish software behavior only. No real-world model performance or fairness claim is made.

## Limitations and recommendations

The hand-authored distributions do not reflect real applications. Engineered unusual cases are test fixtures, not fraud examples. Residuals are reconstruction differences, not explanations. Never use this prototype to find guilt, make approvals or denials, set prices, cancel policies, or take another adverse action. Keep use local and synthetic. Any proposed real-world study would need explicit data authorization, privacy controls, independent model-risk validation, suitability and subgroup review, monitoring, human governance, and qualified legal, privacy, insurance compliance, and model-risk review.
