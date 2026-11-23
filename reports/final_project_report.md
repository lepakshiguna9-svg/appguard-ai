# Final AppGuard AI Project Report

## Overview

AppGuard AI is a local educational prototype for unsupervised statistical anomaly scoring of insurance application-like records. A PyTorch VAE learns a seeded synthetic baseline; a held-out synthetic baseline set calibrates a 99th-percentile threshold. FastAPI exposes health, model metadata, demo records, single-score, and batch-score routes. A React/TypeScript interface retrieves synthetic records and scores through the live API, displays returned score and review state, exposes submitted fields and prominent feature residuals, and accepts bounded JSON batches.

## End-to-end design

The committed VAE pipeline is preserved: version `1.0.0-demo`, seven model features, original fitted preprocessor and weights, and threshold `0.06842832267284393`. API startup validates the bundle. Six optional abstract values are accepted separately for explicit synthetic flag rules; the scoring function selects only the seven original features. The UI uses a Vite `/api` proxy and no hard-coded record scores. Synthetic IDs and labels are separated; labels are joined by ID only for local evaluation and are never sent to scoring or flag generation.

## Evaluation

The project verification checks deterministic data generation, exact model-bundle compatibility, API health and metadata, demo retrieval, score invariance to optional flag evidence, invalid input handling, bounded batches, ID-based evaluation, zero-denominator metrics, frontend tests, and production compilation. The restored original labeled batch yields 30 TP, 0 FN, 10 FP, 60 TN (accuracy 90.0%, precision 75.0%, recall 100%, F1 85.7%, false-positive rate 14.3%, ROC-AUC 1.000). These values describe only the constructed synthetic cases and are not real-world performance claims.

## Limitations and recommendations

The hand-authored distributions do not reflect real applications. Engineered unusual cases are test fixtures, not fraud examples. Residuals are reconstruction differences, not explanations. Never use this prototype to find guilt, make approvals or denials, set prices, cancel policies, or take another adverse action. Keep use local and synthetic. Any proposed real-world study would need explicit data authorization, privacy controls, independent model-risk validation, suitability and subgroup review, monitoring, human governance, and qualified legal, privacy, insurance compliance, and model-risk review.
