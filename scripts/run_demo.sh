#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
trap 'kill ${API_PID:-} ${WEB_PID:-} 2>/dev/null || true; wait 2>/dev/null || true' INT TERM EXIT
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port "${APPGUARD_API_PORT:-8000}" & API_PID=$!
(cd frontend && exec node ./node_modules/vite/bin/vite.js --host 127.0.0.1 --port "${APPGUARD_WEB_PORT:-5173}") & WEB_PID=$!
printf 'API: http://127.0.0.1:%s/api/v1/health\nUI:  http://127.0.0.1:%s\nStop both with Ctrl+C.\n' "${APPGUARD_API_PORT:-8000}" "${APPGUARD_WEB_PORT:-5173}"
wait
