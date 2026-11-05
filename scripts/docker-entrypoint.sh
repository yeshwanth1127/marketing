#!/usr/bin/env bash
set -euo pipefail
cd "${EXORA_ROOT:-/app}"
mkdir -p .local/uploads .local/renders
node scripts/migrate.mjs
node scripts/seed.mjs || true
exec "$@"
