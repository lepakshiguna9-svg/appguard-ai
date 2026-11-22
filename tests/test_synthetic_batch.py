import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "synthetic"
EXPECTED_FIELDS = {
    "application_id", "policy_type", "coverage_amount", "deductible_amount",
    "premium_frequency", "application_channel", "applicant_age",
    "annual_income_estimate", "prior_application_count",
    "recent_address_changes_count", "property_or_vehicle_age",
    "beneficiary_relation", "declared_credit_tier",
}


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


def test_batch_values_match_live_api_schema_bounds_and_enums():
    applications = json.loads((DATA / "test_batch_100.json").read_text())
    for record in applications:
        assert record["policy_type"] in {"auto", "homeowners", "term_life", "renters", "commercial_property"}
        assert record["premium_frequency"] in {"monthly", "quarterly", "semi_annual", "annual"}
        assert record["application_channel"] in {"online_direct", "independent_broker", "captive_agent", "aggregator_partner", "mobile_app"}
        assert record["beneficiary_relation"] in {"self", "spouse", "child", "parent", "business_partner", "other"}
        assert record["declared_credit_tier"] in {"excellent", "good", "fair", "limited_history"}
        assert 0 < record["coverage_amount"] <= 10_000_000
        assert 0 <= record["deductible_amount"] <= 100_000
        assert 18 <= record["applicant_age"] <= 105
        assert 0 <= record["annual_income_estimate"] <= 5_000_000
        assert 0 <= record["prior_application_count"] <= 50
        assert 0 <= record["recent_address_changes_count"] <= 20
        assert 0 <= record["property_or_vehicle_age"] <= 100
