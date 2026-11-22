#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
exec .venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${APPGUARD_API_PORT:-8000}"
