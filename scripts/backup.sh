#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
stamp=$(date +%Y%m%d-%H%M%S)
dest=".local/backups/$stamp"
mkdir -p "$dest"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
"$PG_BIN/pg_dump" -h 127.0.0.1 -p 55439 -U exora -d exora_marketing -Fc -f "$dest/exora_marketing.dump"
tar -C .local -czf "$dest/files.tgz" uploads renders packs 2>/dev/null || true
echo "Backup written to $dest"
echo "Restore: pg_restore -h 127.0.0.1 -p 55439 -U exora -d exora_marketing --clean --if-exists $dest/exora_marketing.dump && tar -C .local -xzf $dest/files.tgz"
