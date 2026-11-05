#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export EXORA_ROOT="$PWD"
mkdir -p .local
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
if ! "$PG_BIN/pg_isready" -h 127.0.0.1 -p 55439 -q; then
 if [ ! -f .local/postgres/PG_VERSION ]; then "$PG_BIN/initdb" -D "$PWD/.local/postgres" -A trust -U exora --encoding=UTF8 --locale=C; fi
 "$PG_BIN/pg_ctl" -D "$PWD/.local/postgres" -l "$PWD/.local/postgres.log" -o '-h 127.0.0.1 -p 55439' start
fi
"$PG_BIN/psql" -h 127.0.0.1 -p 55439 -U exora -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='exora_marketing'" | grep -q 1 || "$PG_BIN/createdb" -h 127.0.0.1 -p 55439 -U exora exora_marketing
npm run db:migrate
npm run db:seed
worker_loop(){
 while true; do
  code=0
  npm run worker >> .local/worker.log 2>&1 || code=$?
  printf '\n[%s] Worker exited with code %s; restarting in 3 seconds.\n' "$(date -Iseconds)" "$code" >> .local/worker.log
  sleep 3
 done
}
worker_loop &
WORKER_PID=$!
trap 'kill "$WORKER_PID" 2>/dev/null || true' EXIT INT TERM
npm run dev
