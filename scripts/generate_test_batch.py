"""Generate original-schema synthetic records and separate flag-only demo evidence."""
import json
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "synthetic"
SEED = 20261122
TYPICAL_COUNT = 70
UNUSUAL_COUNT = 30
POLICY_TYPES = ["auto", "home", "renters"]
FREQUENCIES = ["monthly", "quarterly", "annual"]
CHANNELS = ["agent", "web", "phone"]
FEATURE_FIELDS = [
    "policy_type", "requested_coverage", "deductible", "payment_frequency",
    "channel", "submission_velocity_24h", "recent_change_count",
]
FLAG_EVIDENCE_FIELDS = [
    "duplicate_identity_reference_count", "identity_document_consistency",
    "application_detail_consistency", "contact_reference_consistency",
    "beneficiary_reference_consistency", "repeat_submission_count",
]


def flag_evidence(rng):
    """Generate independent synthetic flag values; never derive them from labels."""
    evidence = {
        "duplicate_identity_reference_count": float(rng.choices([0, 1], [97, 3])[0]),
        "identity_document_consistency": round(rng.uniform(.90, 1), 4),
        "application_detail_consistency": round(rng.uniform(.90, 1), 4),
        "contact_reference_consistency": round(rng.uniform(.90, 1), 4),
        "beneficiary_reference_consistency": round(rng.uniform(.90, 1), 4),
        "repeat_submission_count": float(rng.choices([0, 1, 2], [65, 27, 8])[0]),
    }
    # Fixed synthetic examples exercise the separate rules without using labels.
    case = rng.randrange(24)
    if case == 0:
        evidence["duplicate_identity_reference_count"] = 3.0
    elif case == 1:
        evidence["identity_document_consistency"] = .24
        evidence["application_detail_consistency"] = .36
    elif case == 2:
        evidence["repeat_submission_count"] = 8.0
    elif case == 3:
        evidence["beneficiary_reference_consistency"] = .18
    elif case == 4:
        evidence["contact_reference_consistency"] = .22
    return evidence


def typical_record(rng, app_id):
    policy = rng.choices(POLICY_TYPES, weights=[50, 30, 20], k=1)[0]
    ranges = {
        "auto": ((8000, 80000), (250, 2500)),
        "home": ((150000, 700000), (500, 5000)),
        "renters": ((10000, 60000), (0, 1000)),
    }
    coverage_range, deductible_range = ranges[policy]
    coverage = rng.randint(*coverage_range)
    deductible = rng.randint(*deductible_range)
    return {
        "application_id": app_id,
        "policy_type": policy,
        "requested_coverage": float(coverage),
        "deductible": float(deductible),
        "payment_frequency": rng.choices(FREQUENCIES, weights=[55, 20, 25], k=1)[0],
        "channel": rng.choices(CHANNELS, weights=[45, 40, 15], k=1)[0],
        "submission_velocity_24h": float(rng.choices([0, 1, 2, 3, 4], weights=[35, 34, 18, 9, 4], k=1)[0]),
        "recent_change_count": float(rng.choices([0, 1, 2, 3, 4], weights=[42, 30, 16, 8, 4], k=1)[0]),
    }


def unusual_record(rng, app_id, scenario):
    if scenario == "coverage_scale":
        return {
            "application_id": app_id, "policy_type": rng.choice(["auto", "renters"]),
            "requested_coverage": float(rng.randint(2_000_000, 50_000_000)),
            "deductible": float(rng.choice([0, 50, 100])), "payment_frequency": "monthly",
            "channel": rng.choice(CHANNELS), "submission_velocity_24h": float(rng.randint(0, 3)),
            "recent_change_count": float(rng.randint(0, 3)),
        }
    if scenario == "submission_velocity":
        return {
            "application_id": app_id, "policy_type": rng.choice(POLICY_TYPES),
            "requested_coverage": float(rng.randint(1000, 50000)), "deductible": float(rng.randint(0, 500)),
            "payment_frequency": "monthly", "channel": rng.choice(["web", "phone"]),
            "submission_velocity_24h": float(rng.randint(100, 1000)),
            "recent_change_count": float(rng.randint(50, 500)),
        }
    if scenario == "deductible_outlier":
        return {
            "application_id": app_id, "policy_type": "home",
            "requested_coverage": float(rng.randint(100_000, 800_000)),
            "deductible": float(rng.randint(500_000, 5_000_000)),
            "payment_frequency": "monthly", "channel": rng.choice(CHANNELS),
            "submission_velocity_24h": float(rng.randint(0, 4)),
            "recent_change_count": float(rng.randint(0, 4)),
        }
    # A valid but uncommon joint pattern using only categories present in training.
    return {
        "application_id": app_id, "policy_type": "renters",
        "requested_coverage": float(rng.randint(500_000, 3_000_000)),
        "deductible": float(rng.randint(0, 100)), "payment_frequency": "annual",
        "channel": "phone", "submission_velocity_24h": float(rng.randint(40, 150)),
        "recent_change_count": float(rng.randint(15, 80)),
    }


def generate():
    rng = random.Random(SEED)
    display_rng = random.Random(SEED + 1)
    flag_rng = random.Random(SEED + 2)
    applications = []
    labels = []
    display_rows = []
    for number in range(1, TYPICAL_COUNT + 1):
        app_id = f"SYNTH-APP-{number:03d}"
        applications.append(typical_record(rng, app_id))
        labels.append({"application_id": app_id, "demo_label": "typical_synthetic", "scenario": "baseline-like generated example"})
        display_rows.append({"application_id": app_id, "applicant_age": display_rng.randint(20, 78), "annual_income_estimate": display_rng.choice([28000, 36000, 48000, 62000, 78000, 95000, 125000, 165000, 220000])})

    scenarios = ["coverage_scale", "submission_velocity", "deductible_outlier", "uncommon_joint_pattern"]
    for offset in range(UNUSUAL_COUNT):
        number = TYPICAL_COUNT + offset + 1
        app_id = f"SYNTH-APP-{number:03d}"
        scenario = scenarios[offset % len(scenarios)]
        applications.append(unusual_record(rng, app_id, scenario))
        labels.append({"application_id": app_id, "demo_label": "unusual_synthetic", "scenario": scenario})
        display_rows.append({"application_id": app_id, "applicant_age": display_rng.randint(20, 78), "annual_income_estimate": display_rng.choice([28000, 36000, 48000, 62000, 78000, 95000, 125000, 165000, 220000])})

    # Flag evidence uses an independent RNG stream and is not derived from labels,
    # model inputs, or the application generation branch.
    for application in applications:
        application.update(flag_evidence(flag_rng))

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    (DATA_DIR / "test_batch_100.json").write_text(json.dumps(applications, indent=2) + "\n")
    (DATA_DIR / "test_batch_100_labels.json").write_text(json.dumps({"seed": SEED, "labels": labels}, indent=2) + "\n")
    (DATA_DIR / "test_batch_100_display.json").write_text(json.dumps({"synthetic_only": True, "records": display_rows}, indent=2) + "\n")
    print(f"Generated {len(applications)} synthetic records with {len(FEATURE_FIELDS)} VAE features and separate flag evidence in {DATA_DIR}")


if __name__ == "__main__":
    generate()
