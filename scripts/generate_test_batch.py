"""Generate a reproducible 100-record synthetic batch for AppGuard's current API."""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "synthetic"
SEED = 20261122
TYPICAL_COUNT = 70
UNUSUAL_COUNT = 30

POLICY_TYPES = ["auto", "homeowners", "term_life", "renters", "commercial_property"]
FREQUENCIES = ["monthly", "quarterly", "semi_annual", "annual"]
CHANNELS = ["online_direct", "independent_broker", "captive_agent", "aggregator_partner", "mobile_app"]
BENEFICIARIES = ["self", "spouse", "child", "parent", "business_partner", "other"]
CREDIT_TIERS = ["excellent", "good", "fair", "limited_history"]

# The API accepts application_id for tracking; it is an identifier, never a model feature.
SCORING_FIELDS = [
    "application_id", "policy_type", "coverage_amount", "deductible_amount",
    "premium_frequency", "application_channel", "applicant_age",
    "annual_income_estimate", "prior_application_count",
    "recent_address_changes_count", "property_or_vehicle_age",
    "beneficiary_relation", "declared_credit_tier",
]


def rounded_amount(rng, low, high, step=500):
    raw = rng.randint(low // step, high // step) * step
    return float(raw)


def typical_record(rng, app_id):
    policy = rng.choices(POLICY_TYPES, weights=[42, 24, 12, 14, 8], k=1)[0]
    ranges = {
        "auto": ((15000, 150000), (250, 2500)),
        "homeowners": ((100000, 900000), (500, 5000)),
        "term_life": ((100000, 1000000), (0, 0)),
        "renters": ((15000, 70000), (0, 1000)),
        "commercial_property": ((250000, 2500000), (1000, 25000)),
    }
    coverage_range, deductible_range = ranges[policy]
    coverage = rounded_amount(rng, *coverage_range, step=1000 if policy in {"homeowners", "commercial_property"} else 500)
    if deductible_range[0] == deductible_range[1]:
        deductible = 0.0
    else:
        deductible = rounded_amount(rng, *deductible_range, step=250)
    age = rng.randint(21, 78)
    return {
        "application_id": app_id,
        "policy_type": policy,
        "coverage_amount": coverage,
        "deductible_amount": deductible,
        "premium_frequency": rng.choices(FREQUENCIES, weights=[48, 18, 8, 26], k=1)[0],
        "application_channel": rng.choices(CHANNELS, weights=[32, 24, 20, 14, 10], k=1)[0],
        "applicant_age": float(age),
        "annual_income_estimate": float(rng.choice([28000, 36000, 48000, 62000, 78000, 95000, 125000, 165000, 220000, 310000])),
        "prior_application_count": float(rng.randint(0, 3)),
        "recent_address_changes_count": float(rng.choices([0, 1, 2], weights=[72, 23, 5], k=1)[0]),
        "property_or_vehicle_age": float(rng.randint(0, 35)),
        "beneficiary_relation": rng.choices(BENEFICIARIES, weights=[40, 35, 10, 5, 2, 8], k=1)[0],
        "declared_credit_tier": rng.choices(CREDIT_TIERS, weights=[20, 45, 25, 10], k=1)[0],
    }


def unusual_record(rng, app_id, scenario):
    if scenario == "coverage_income_gap":
        return {
            "application_id": app_id, "policy_type": "term_life",
            "coverage_amount": rounded_amount(rng, 2500000, 8000000, 50000), "deductible_amount": 0.0,
            "premium_frequency": "monthly", "application_channel": "online_direct",
            "applicant_age": float(rng.randint(18, 26)), "annual_income_estimate": float(rng.randint(0, 30000)),
            "prior_application_count": float(rng.randint(0, 1)), "recent_address_changes_count": float(rng.randint(0, 2)),
            "property_or_vehicle_age": 0.0, "beneficiary_relation": "other", "declared_credit_tier": "limited_history",
        }
    if scenario == "application_velocity":
        return {
            "application_id": app_id, "policy_type": "auto",
            "coverage_amount": rounded_amount(rng, 30000, 200000), "deductible_amount": float(rng.choice([0, 250, 500])),
            "premium_frequency": "monthly", "application_channel": rng.choice(["aggregator_partner", "mobile_app"]),
            "applicant_age": float(rng.randint(22, 40)), "annual_income_estimate": float(rng.randint(20000, 100000)),
            "prior_application_count": float(rng.randint(12, 50)), "recent_address_changes_count": float(rng.randint(4, 20)),
            "property_or_vehicle_age": float(rng.randint(0, 12)), "beneficiary_relation": "self",
            "declared_credit_tier": rng.choice(["fair", "limited_history"]),
        }
    if scenario == "channel_scale_mismatch":
        return {
            "application_id": app_id, "policy_type": "commercial_property",
            "coverage_amount": rounded_amount(rng, 2500000, 10000000, 50000), "deductible_amount": float(rng.choice([0, 250, 500, 1000])),
            "premium_frequency": "monthly", "application_channel": "mobile_app",
            "applicant_age": float(rng.randint(18, 25)), "annual_income_estimate": float(rng.randint(0, 40000)),
            "prior_application_count": float(rng.randint(5, 50)), "recent_address_changes_count": float(rng.randint(3, 15)),
            "property_or_vehicle_age": float(rng.randint(0, 5)), "beneficiary_relation": rng.choice(["other", "business_partner"]),
            "declared_credit_tier": rng.choice(["fair", "limited_history"]),
        }
    # A boundary-valid, unusual deductible and older insured property combination.
    return {
        "application_id": app_id, "policy_type": "homeowners",
        "coverage_amount": rounded_amount(rng, 150000, 1500000, 5000), "deductible_amount": float(rng.randint(80000, 100000)),
        "premium_frequency": "monthly", "application_channel": rng.choice(["online_direct", "aggregator_partner"]),
        "applicant_age": float(rng.randint(25, 65)), "annual_income_estimate": float(rng.randint(25000, 120000)),
        "prior_application_count": float(rng.randint(0, 2)), "recent_address_changes_count": float(rng.randint(0, 3)),
        "property_or_vehicle_age": float(rng.randint(60, 100)), "beneficiary_relation": rng.choice(["spouse", "other"]),
        "declared_credit_tier": rng.choice(["fair", "limited_history"]),
    }


def generate():
    rng = random.Random(SEED)
    applications = []
    labels = []
    for number in range(1, TYPICAL_COUNT + 1):
        app_id = f"SYNTH-APP-{number:03d}"
        applications.append(typical_record(rng, app_id))
        labels.append({"application_id": app_id, "demo_label": "typical_synthetic", "scenario": "baseline-like generated example"})

    scenarios = ["coverage_income_gap", "application_velocity", "channel_scale_mismatch", "deductible_property_age"]
    for offset in range(UNUSUAL_COUNT):
        number = TYPICAL_COUNT + offset + 1
        app_id = f"SYNTH-APP-{number:03d}"
        scenario = scenarios[offset % len(scenarios)]
        applications.append(unusual_record(rng, app_id, scenario))
        labels.append({"application_id": app_id, "demo_label": "unusual_synthetic", "scenario": scenario})

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "test_batch_100.json").write_text(json.dumps(applications, indent=2, ensure_ascii=False) + "\n")
    (DATA_DIR / "test_batch_100_labels.json").write_text(json.dumps({"seed": SEED, "labels": labels}, indent=2, ensure_ascii=False) + "\n")
    print(f"Generated {len(applications)} synthetic API records ({TYPICAL_COUNT} typical, {UNUSUAL_COUNT} unusual) in {DATA_DIR}")


if __name__ == "__main__":
    generate()
