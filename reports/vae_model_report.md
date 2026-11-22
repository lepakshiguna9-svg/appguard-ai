# Variational Autoencoder Anomaly Detection Model

## Model and objective

AppGuard trains a compact fully connected PyTorch VAE on standardized numeric dimensions and one-hot categorical dimensions. The encoder maps input through configurable hidden layers to a latent Gaussian (mean and log variance); the decoder reconstructs the feature vector. Training minimizes mean per-row, per-coordinate squared reconstruction error plus 0.03 times mean KL divergence to a standard normal prior. Training is deterministic for a fixed software/runtime configuration and random seed; it uses CPU execution in the provided script.

## Score and residuals

The anomaly score is the mean squared difference between the input representation and the decoder's deterministic reconstruction at the posterior mean. It is an unbounded reconstruction error; numeric standardization does not bound values outside the training range. Some valid API inputs in the synthetic stress batch are far outside the training distribution and therefore yield very large raw errors. Higher scores indicate greater reconstruction difference from patterns learned in baseline training data. The service recommends human review when the score is strictly greater than the held-out baseline calibration threshold. Training calibration and runtime scoring use the same fitted preprocessor, encoded feature order, and scoring function. Each feature's residual is the mean absolute reconstruction difference over its one-hot columns for categorical features, or absolute standardized reconstruction difference for numeric features. Residuals are statistical deviations, not explanations or evidence of fraud.

## Training, calibration, and artifact

Default configuration: hidden sizes 48 and 24, latent size 8, 45 epochs, batch size 64, learning rate 0.001, seed 23. A separate 500-row synthetic baseline calibration set supplies the 99th percentile threshold using NumPy's `higher` order statistic. The artifact stores model weights separately from JSON metadata, including schema, preprocessor parameters, configuration, version `1.0.0-demo`, threshold method, and calibration sample count. Loading uses PyTorch's restricted `weights_only=True` mode.

## Synthetic evaluation and limits

The demo includes engineered unusual samples to exercise the scoring path; the project makes no performance claim based on them. Synthetic data cannot establish accuracy, precision, recall, fairness, effectiveness, calibration quality on real applications, or operational value. A score must not be used to accuse, approve, deny, price, cancel, or take another adverse action. Any real-world research would need representative authorized data, rigorous independent validation, subgroup and drift assessment, privacy controls, and qualified human, legal, insurance compliance, and model-risk review.
