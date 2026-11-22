"""ID-based evaluation of synthetic labels against API review recommendations."""

import math

LABELS = {"typical_synthetic", "unusual_synthetic"}


def _id_map(rows, source_name):
    out = {}
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            raise ValueError(f"{source_name} record {index + 1} is not an object")
        app_id = row.get("application_id")
        if not isinstance(app_id, str) or not app_id.strip():
            raise ValueError(f"{source_name} record {index + 1} is missing application_id")
        if app_id in out:
            raise ValueError(f"{source_name} contains duplicate application_id {app_id!r}")
        out[app_id] = row
    return out


def evaluate_labeled_results(applications, results, label_sidecar):
    """Join API results and synthetic-only labels by application ID and compute screening metrics."""
    if not isinstance(applications, list) or not applications:
        raise ValueError("Expected application records")
    if not isinstance(results, list):
        raise ValueError("Expected API scoring results")
    if not isinstance(label_sidecar, dict) or not isinstance(label_sidecar.get("labels"), list):
        raise ValueError("Label sidecar must contain a labels array")

    app_by_id = _id_map(applications, "Application batch")
    result_by_id = _id_map(results, "API results")
    labels_by_id = _id_map(label_sidecar["labels"], "Label sidecar")
    for app_id in result_by_id:
        if app_id not in app_by_id:
            raise ValueError(f"Scoring result application_id {app_id!r} has no matching input")
    for app_id in app_by_id:
        if app_id not in result_by_id:
            raise ValueError(f"Missing scoring result for application_id {app_id!r}")
        if app_id not in labels_by_id:
            raise ValueError(f"Missing label for application_id {app_id!r}")
    for app_id in labels_by_id:
        if app_id not in app_by_id:
            raise ValueError(f"Label application_id {app_id!r} has no matching input")

    counts = {"true_positives": 0, "false_negatives": 0, "false_positives": 0, "true_negatives": 0}
    rows = []
    for app_id, application in app_by_id.items():
        result = result_by_id[app_id]
        label = labels_by_id[app_id].get("demo_label")
        if label not in LABELS:
            raise ValueError(f"Unsupported or missing synthetic label for application_id {app_id!r}")
        if result.get("status", "success") != "success":
            raise ValueError(f"API scoring failed for application_id {app_id!r}: {result.get('error_message') or 'unknown error'}")
        review = result.get("review_recommended")
        if not isinstance(review, bool):
            raise ValueError(f"API result for application_id {app_id!r} has no boolean review_recommended")
        score = result.get("anomaly_score")
        threshold = result.get("calibrated_threshold", result.get("threshold"))
        if not isinstance(score, (int, float)) or not math.isfinite(score):
            raise ValueError(f"API result for application_id {app_id!r} has no finite anomaly_score")
        if not isinstance(threshold, (int, float)) or not math.isfinite(threshold):
            raise ValueError(f"API result for application_id {app_id!r} has no finite threshold")

        unusual = label == "unusual_synthetic"
        if unusual and review:
            counts["true_positives"] += 1
            outcome = "flagged_true_positive"
        elif unusual:
            counts["false_negatives"] += 1
            outcome = "missed_false_negative"
        elif review:
            counts["false_positives"] += 1
            outcome = "flagged_false_positive"
        else:
            counts["true_negatives"] += 1
            outcome = "not_flagged_true_negative"
        rows.append({
            "application_id": app_id,
            "demo_label": label,
            "anomaly_score": score,
            "calibrated_threshold": threshold,
            "review_recommended": review,
            "outcome": outcome,
        })

    def ratio(numerator, denominator):
        return None if denominator == 0 else numerator / denominator

    return {
        "rows": rows,
        "counts": counts,
        "precision": ratio(counts["true_positives"], counts["true_positives"] + counts["false_positives"]),
        "recall": ratio(counts["true_positives"], counts["true_positives"] + counts["false_negatives"]),
        "false_positive_rate": ratio(counts["false_positives"], counts["false_positives"] + counts["true_negatives"]),
    }
