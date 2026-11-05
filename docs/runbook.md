# EXORA local runbook

1. Start: `npm run local` (Postgres on 127.0.0.1:55439, Next on :3100, worker loop).
2. Stop: Ctrl-C in that terminal (kills the worker loop too).
3. Worker only: `npm run worker` if the app is already running.
4. Claude: Settings → Connect Claude, finish login in the browser, then refresh.
5. Backup / restore: `bash scripts/backup.sh`. Restore with the printed `pg_restore` + `tar` line.
