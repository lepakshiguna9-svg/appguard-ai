"""Score the deterministic synthetic batch and compare with its separate label sidecar."""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import httpx
from app.evaluation import evaluate_labeled_results

BATCH_PATH = ROOT / "data" / "synthetic" / "test_batch_100.json"
LABELS_PATH = ROOT / "data" / "synthetic" / "test_batch_100_labels.json"


def display_rate(value):
    return "N/A (zero denominator)" if value is None else f"{value:.1%}"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api-url", default="http://127.0.0.1:8000", help="Base URL for the AppGuard API")
    args = parser.parse_args()
    applications = json.loads(BATCH_PATH.read_text())
    label_sidecar = json.loads(LABELS_PATH.read_text())
    base = args.api_url.rstrip("/")

    with httpx.Client(timeout=60) as client:
        health = client.get(f"{base}/api/v1/health")
        health.raise_for_status()
        health_body = health.json()
        if health_body.get("status") != "healthy" or health_body.get("model_loaded") is not True:
            raise SystemExit("AppGuard API must report healthy with a loaded model.")
        response = client.post(f"{base}/api/v1/score/batch", json={"applications": applications})
        response.raise_for_status()
        score_body = response.json()

    results = score_body.get("results")
    if not isinstance(results, list) or len(results) != len(applications):
        raise SystemExit("Batch API response did not contain one result per input application.")
    evaluation = evaluate_labeled_results(applications, results, label_sidecar)
    counts = evaluation["counts"]
    print(f"Synthetic records evaluated: {len(evaluation['rows'])}")
    print(f"Intentionally unusual flagged (TP): {counts['true_positives']}")
    print(f"Intentionally unusual missed (FN): {counts['false_negatives']}")
    print(f"Typical flagged (FP): {counts['false_positives']}")
    print(f"Typical not flagged (TN): {counts['true_negatives']}")
    print(f"Accuracy (TP+TN)/N: {display_rate(evaluation['accuracy'])}")
    print(f"Precision TP/(TP+FP): {display_rate(evaluation['precision'])}")
    print(f"Recall TP/(TP+FN): {display_rate(evaluation['recall'])}")
    print(f"F1 2TP/(2TP+FP+FN): {display_rate(evaluation['f1'])}")
    print(f"False-positive rate FP/(FP+TN): {display_rate(evaluation['false_positive_rate'])}")
    print(f"ROC-AUC (raw score ranking): {display_rate(evaluation['roc_auc'])}")
    print("Synthetic software demonstration only; these metrics do not establish real-world performance.")


if __name__ == "__main__":
    main()
