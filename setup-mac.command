#!/bin/zsh -l
# Double-click in Finder. Sets up the Python skill environment, runs tests and the build, then a Claude design smoke test.
# Everything is logged to .local/setup-log.txt (Claude reads it from there).
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
LOG=.local/setup-log.txt; mkdir -p .local; : > "$LOG"
step(){ echo "\n===== $1 =====" | tee -a "$LOG"; shift; ( "$@" ) 2>&1 | tee -a "$LOG"; local rc=${pipestatus[1]}; echo "===== exit $rc =====" | tee -a "$LOG"; return 0; }
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@16/bin}"
step "database" zsh -c "\"$PG_BIN/pg_isready\" -h 127.0.0.1 -p 55439 -q || \"$PG_BIN/pg_ctl\" -D \"$PWD/.local/postgres\" -l \"$PWD/.local/postgres.log\" -o '-h 127.0.0.1 -p 55439' start; sleep 2; npm run db:migrate"
step "python skills environment" npm run setup:python
step "tests" npm test
step "production build" npm run build
step "Claude design smoke test" npm run design:smoke
echo "\nDONE — you can close this window. Claude will read .local/setup-log.txt" | tee -a "$LOG"
