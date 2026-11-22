#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import sys
if sys.version_info < (3,11) or sys.version_info >= (3,15):
    raise SystemExit(f"Python 3.11 through 3.14 is required; found {sys.version.split()[0]}")
print(f"Python {sys.version.split()[0]} OK")
PY
command -v node >/dev/null || { echo 'Node.js 20+ is required (install from nodejs.org).'; exit 1; }
node -e 'const v=process.versions.node.split(".").map(Number); if(v[0]<20) process.exit(1); console.log(`Node.js ${process.versions.node} OK`)' || { echo 'Node.js 20+ is required.'; exit 1; }
[ -d .venv ] || python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check -r requirements.txt
(cd frontend && npm install)
if [ ! -f data/synthetic/baseline_train.csv ] || [ ! -f data/synthetic/baseline_calibration.csv ] || [ ! -f data/synthetic/unusual_demo.csv ]; then
  .venv/bin/python scripts/generate_data.py
fi
if [ ! -f artifacts/appguard-demo-v1.pt ] || [ ! -f artifacts/appguard-demo-v1.json ]; then
  .venv/bin/python scripts/train_model.py
fi
printf '\nSetup complete. Start API and UI in separate terminals; see README.md.\n'
