"""Create deterministic, wholly synthetic AppGuard demonstration records."""
import csv
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "synthetic"
FIELDS = ["policy_type", "requested_coverage", "deductible", "payment_frequency", "channel", "submission_velocity_24h", "recent_change_count", "demo_label"]


def make(rng, unusual=False):
    policy = rng.choices(["auto", "home", "renters"], [0.50, 0.30, 0.20])[0]
    typical = {"auto": (18000, 12000), "home": (350000, 100000), "renters": (30000, 15000)}[policy]
    coverage = max(5000, int(rng.gauss(*typical) / 500) * 500)
    deductible = rng.choice([500, 1000, 1500, 2000, 2500])
    frequency = rng.choices(["monthly", "quarterly", "annual"], [0.58, 0.18, 0.24])[0]
    channel = rng.choices(["agent", "web", "phone"], [0.44, 0.38, 0.18])[0]
    velocity = min(5, max(0, int(rng.expovariate(1 / 0.8))))
    changes = min(6, max(0, int(rng.expovariate(1 / 0.9))))
    if unusual:
        kind = rng.randrange(4)
        if kind == 0:
            coverage = int(coverage * rng.uniform(5, 12))
        elif kind == 1:
            deductible = rng.choice([50, 100, 10000, 15000])
        elif kind == 2:
            velocity, changes = rng.randint(12, 28), rng.randint(8, 18)
        else:
            frequency, channel = "weekly", "unknown"
    return [policy, coverage, deductible, frequency, channel, velocity, changes, "unusual_demo" if unusual else "baseline"]


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for filename, seed, count, unusual in [("baseline_train.csv", 417, 1800, False), ("baseline_calibration.csv", 418, 500, False), ("unusual_demo.csv", 419, 60, True)]:
        rng = random.Random(seed)
        with (OUT / filename).open("w", newline="") as f:
            w = csv.writer(f); w.writerow(FIELDS)
            w.writerows(make(rng, unusual) for _ in range(count))
    print(f"Generated deterministic synthetic data in {OUT}")

if __name__ == "__main__": main()
