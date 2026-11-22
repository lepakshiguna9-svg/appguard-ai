import pytest
from app.evaluation import evaluate_labeled_results


def result(app_id, review):
    return {"application_id": app_id, "status": "success", "review_recommended": review}


def labels(*pairs):
    return {"labels": [{"application_id": app_id, "demo_label": demo_label} for app_id, demo_label in pairs]}


def test_evaluation_joins_by_id_not_result_or_label_order():
    applications = [{"application_id": "T1"}, {"application_id": "U1"}, {"application_id": "T2"}, {"application_id": "U2"}]
    evaluation = evaluate_labeled_results(
        applications,
        [result("U2", True), result("T2", False), result("U1", False), result("T1", True)],
        labels(("U1", "unusual_synthetic"), ("T2", "typical_synthetic"), ("U2", "unusual_synthetic"), ("T1", "typical_synthetic")),
    )
    assert evaluation["counts"] == {"true_positives": 1, "false_negatives": 1, "false_positives": 1, "true_negatives": 1}
    assert evaluation["precision"] == 0.5
    assert evaluation["recall"] == 0.5
    assert evaluation["false_positive_rate"] == 0.5


def test_mismatched_ids_and_missing_labels_fail_clearly():
    apps = [{"application_id": "APP-1"}]
    with pytest.raises(ValueError, match="Missing label for application_id 'APP-1'"):
        evaluate_labeled_results(apps, [result("APP-1", True)], labels(("OTHER", "unusual_synthetic")))
    with pytest.raises(ValueError, match="no matching input"):
        evaluate_labeled_results(apps, [result("OTHER", True)], labels(("APP-1", "unusual_synthetic")))
    with pytest.raises(ValueError, match="Missing label"):
        evaluate_labeled_results(apps, [result("APP-1", False)], {"labels": []})


def test_zero_denominator_metrics_are_null():
    no_flags = evaluate_labeled_results(
        [{"application_id": "T1"}, {"application_id": "U1"}],
        [result("U1", False), result("T1", False)],
        labels(("T1", "typical_synthetic"), ("U1", "unusual_synthetic")),
    )
    assert no_flags["precision"] is None
    assert no_flags["recall"] == 0
    assert no_flags["false_positive_rate"] == 0

    no_negatives = evaluate_labeled_results(
        [{"application_id": "U1"}], [result("U1", True)], labels(("U1", "unusual_synthetic")),
    )
    assert no_negatives["false_positive_rate"] is None


def test_duplicate_ids_and_invalid_labels_are_rejected():
    with pytest.raises(ValueError, match="duplicate application_id"):
        evaluate_labeled_results(
            [{"application_id": "APP-1"}], [result("APP-1", True)],
            labels(("APP-1", "unusual_synthetic"), ("APP-1", "typical_synthetic")),
        )
    with pytest.raises(ValueError, match="Unsupported or missing synthetic label"):
        evaluate_labeled_results(
            [{"application_id": "APP-1"}], [result("APP-1", True)], labels(("APP-1", "fraud")),
        )
