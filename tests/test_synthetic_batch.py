import json
import importlib
import sys
from pathlib import Path

from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.config import FEATURES
main_module = importlib.import_module("app.main")
app = main_module.app

DATA = ROOT / "data" / "synthetic"
EXPECTED_FIELDS = {"application_id", *FEATURES}


def test_batch_is_100_records_with_separate_demo_labels():
    applications = json.loads((DATA / "test_batch_100.json").read_text())
    sidecar = json.loads((DATA / "test_batch_100_labels.json").read_text())
    assert len(applications) == 100
    assert all(set(record) == EXPECTED_FIELDS for record in applications)
    assert all("demo_label" not in record and "scenario" not in record for record in applications)
    ids = {record["application_id"] for record in applications}
    labels = sidecar["labels"]
    assert len(labels) == 100
    assert {item["application_id"] for item in labels} == ids
    assert sum(item["demo_label"] == "typical_synthetic" for item in labels) == 70
    assert sum(item["demo_label"] == "unusual_synthetic" for item in labels) == 30


def test_batch_values_match_model_feature_schema_and_api_bounds():
    applications = json.loads((DATA / "test_batch_100.json").read_text())
    for record in applications:
        assert record["policy_type"] in {"auto", "home", "renters"}
        assert record["payment_frequency"] in {"monthly", "quarterly", "annual"}
        assert record["channel"] in {"agent", "web", "phone"}
        assert 0 < record["requested_coverage"] <= 100_000_000
        assert 0 <= record["deductible"] <= 10_000_000
        assert 0 <= record["submission_velocity_24h"] <= 10_000
        assert 0 <= record["recent_change_count"] <= 10_000


def test_synthetic_batch_is_accepted_and_id_is_tracking_only(monkeypatch):
    applications = json.loads((DATA / "test_batch_100.json").read_text())
    labels = json.loads((DATA / "test_batch_100_labels.json").read_text())
    assert "labels" in labels  # Used locally; this object is not included in the request.
    model_inputs = []
    score_rows = main_module.score_rows

    def capture_model_inputs(model, preprocessor, rows):
        model_inputs.extend(rows)
        return score_rows(model, preprocessor, rows)

    monkeypatch.setattr(main_module, "score_rows", capture_model_inputs)

    with TestClient(app) as client:
        response = client.post("/api/v1/score/batch", json={"applications": applications})

    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert len(results) == len(applications)
    assert {result["application_id"] for result in results} == {
        record["application_id"] for record in applications
    }
    assert all("demo_label" not in result and "scenario" not in result for result in results)
    assert all("disclaimer" in result for result in results)
    assert len(model_inputs) == 100
    assert all(set(row) == set(FEATURES) for row in model_inputs)
