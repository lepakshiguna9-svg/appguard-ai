from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "synthetic"
ARTIFACT_DIR = ROOT / "artifacts"
ARTIFACT_PATH = ARTIFACT_DIR / "appguard-demo-v1.pt"
METADATA_PATH = ARTIFACT_DIR / "appguard-demo-v1.json"
TRAIN_PATH = DATA_DIR / "baseline_train.csv"
CALIBRATION_PATH = DATA_DIR / "baseline_calibration.csv"
UNUSUAL_PATH = DATA_DIR / "unusual_demo.csv"
FEATURES = ["policy_type", "requested_coverage", "deductible", "payment_frequency", "channel", "submission_velocity_24h", "recent_change_count"]
CATEGORICAL = ["policy_type", "payment_frequency", "channel"]
NUMERIC = ["requested_coverage", "deductible", "submission_velocity_24h", "recent_change_count"]
MODEL_VERSION = "1.0.0-demo"
