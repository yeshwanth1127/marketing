#!/bin/zsh -l
# Double-click to run EXORA Marketing OS on http://localhost:3100 (database, worker and app).
# Keep this window open while you use the app; close it (or press Ctrl+C) to stop.
cd "$(dirname "$0")"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:$PATH"
(sleep 12; open "http://localhost:3100") &
npm run local 2>&1 | tee .local/app-log.txt
