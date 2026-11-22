#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
cd frontend
exec npm run dev -- --host 127.0.0.1 --port "${APPGUARD_WEB_PORT:-5173}"
