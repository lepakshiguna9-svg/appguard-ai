# Variational Autoencoder Anomaly Detection Model

## Model and objective

AppGuard trains a compact fully connected PyTorch VAE on standardized numeric dimensions and one-hot categorical dimensions. The encoder maps input through configurable hidden layers to a latent Gaussian (mean and log variance); the decoder reconstructs the feature vector. Training minimizes mean per-row, per-coordinate squared reconstruction error plus 0.03 times mean KL divergence to a standard normal prior. Training is deterministic for a fixed software/runtime configuration and random seed; it uses CPU execution in the provided script.

## Score and residuals

The anomaly score is the mean squared difference between the original seven-feature input representation and the decoder's deterministic reconstruction at the posterior mean. It is an unbounded reconstruction error; valid API inputs far outside the baseline can still yield large raw errors. Optional synthetic consistency/count flag evidence is evaluated separately and cannot affect the VAE score. The service recommends human review when the score is strictly greater than the original held-out baseline threshold. Training calibration and runtime scoring use the same committed fitted preprocessor, encoded feature order, weights, and scoring function. Feature residuals are reconstruction differences, not explanations or evidence of fraud.

## Training, calibration, and artifact

The preserved artifact uses hidden sizes 48 and 24, latent size 8, 45 epochs, batch size 64, learning rate 0.001, seed 23, and the original separate 500-row calibration file. Its 99th-percentile `higher` threshold is `0.06842832267284393`. The checked-in model is version `1.0.0-demo`; no retraining or recalibration was performed. The API validates its seven-feature schema, fitted preprocessor and encoded order at startup.

## Synthetic evaluation and limits

The original 100-row test batch uses the original seven VAE inputs and is ID-joined against a separate label sidecar. Its counts are 30 TP, 0 FN, 10 FP, and 60 TN: 90.0% accuracy, 75.0% precision, 100% recall, 85.7% F1, 14.3% false-positive rate, and 1.000 ROC-AUC. Separate synthetic flag-evidence values are generated independently of labels and do not affect these results. Metrics describe only this fixed synthetic construction; they are not performance estimates. No score or flag proves fraud, identity, or intent, and neither may make an insurance decision.
