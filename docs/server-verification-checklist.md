# Server verification checklist — marketing.exora.solutions

Run on the host (`root@10.0.0.5` or equivalent). Path: **`/srv/apps/marketing`**.

---

## 1. DNS and TLS

| Check | How to verify | Pass criteria |
|-------|----------------|---------------|
| DNS resolves | `dig +short marketing.exora.solutions A` (from laptop or server) | Returns your server IP (or Cloudflare proxy if proxied) |
| HTTPS cert valid | `curl -sSI https://marketing.exora.solutions/api/health \| head -5` | `HTTP/2 200` (or `HTTP/1.1 200`), no cert errors |
| HTTP → HTTPS | `curl -sSI http://marketing.exora.solutions/ \| grep -i location` | Redirect to `https://` |
| Cert expiry | `openssl s_client -connect marketing.exora.solutions:443 -servername marketing.exora.solutions </dev/null 2>/dev/null \| openssl x509 -noout -dates` | `notAfter` comfortably in the future |
| Gateway nginx site | `docker exec gateway nginx -t` | `syntax is ok` / `test is successful` |
| Site file installed | `test -f /srv/gateway/nginx/sites/marketing.exora.solutions.conf && echo OK` | File exists, proxies to `127.0.0.1:8108` |

---

## 2. Docker stack

```bash
cd /srv/apps/marketing
docker compose ps
```

| Check | Pass criteria |
|-------|----------------|
| **postgres** | `Up`, healthy |
| **web** | `Up`, port `127.0.0.1:8108->3100/tcp` |
| **worker** | `Up` (same image as web) |
| Restarts | No rapid restart loop (`docker compose ps` / `docker compose logs --tail=30 web`) |

```bash
# Local bind (bypasses nginx)
curl -sS http://127.0.0.1:8108/api/health
# Public
curl -sS https://marketing.exora.solutions/api/health
```

Expected JSON: `{"ok":true,"service":"EXORA Marketing OS"}`.

---

## 3. Environment (`.env`)

```bash
cd /srv/apps/marketing
test -f .env && stat -c '%a %U' .env   # prefer mode 600, root or deploy user
grep -E '^[A-Z_]+=' .env | cut -d= -f1 | sort
```

| Variable | Must be set | Expected / notes |
|----------|-------------|------------------|
| `POSTGRES_PASSWORD` | Yes | Non-empty; must match what Postgres volume was created with |
| `MARKETING_HOST_PORT` | Optional | Default `8108` |
| `EXORA_PUBLIC_ORIGIN` | Yes | `https://marketing.exora.solutions` (no trailing slash) |
| `EXORA_INITIAL_PASSWORD` | First boot | Used by seed; change admin password after login |
| `META_APP_ID` | Yes | `1634505404780640` |
| `META_APP_SECRET` | Yes | From Meta App Dashboard (never commit) |
| `META_API_VERSION` | Yes | `v21.0` |
| `META_REDIRECT_URI` | Yes | `https://marketing.exora.solutions/api/auth/meta/callback` — **exact** match with Meta Login settings |
| `EXORA_TOKEN_KEY` | Yes | 64 hex chars (`openssl rand -hex 32`); **do not rotate** after clients connect tokens |
| `META_WEBHOOK_VERIFY_TOKEN` | If using webhooks | Same string as Meta → Webhooks → Verify token |

Quick sanity (does not print secret values):

```bash
grep -q '^META_APP_ID=1634505404780640$' .env && echo 'META_APP_ID OK'
grep -q '^META_REDIRECT_URI=https://marketing.exora.solutions/api/auth/meta/callback$' .env && echo 'REDIRECT OK'
grep -q '^EXORA_PUBLIC_ORIGIN=https://marketing.exora.solutions$' .env && echo 'ORIGIN OK'
test $(grep '^EXORA_TOKEN_KEY=' .env | cut -d= -f2 | wc -c) -eq 65 && echo 'TOKEN_KEY length OK'  # 64 hex + newline
```

After any `.env` change:

```bash
docker compose up -d
```

---

## 4. Database and migrations

```bash
docker compose exec postgres psql -U exora -d exora_marketing -c '\dt connector_accounts'
docker compose exec postgres psql -U exora -d exora_marketing -c "SELECT COUNT(*) FROM clients;"
```

| Check | Pass criteria |
|-------|----------------|
| Schema | Tables exist (e.g. `connector_accounts`, `clients`, `records`) |
| Connectors table | `connector_accounts` present (Meta OAuth storage) |

App applies migrations on startup; if health is OK, DB connectivity is OK.

---

## 5. App login and CSRF

| Check | Steps | Pass |
|-------|--------|------|
| Login page | Open `https://marketing.exora.solutions` | Loads UI |
| Admin login | `admin@exora.local` + password from `EXORA_INITIAL_PASSWORD` | Session works |
| POST actions | Create/edit something in UI (e.g. client note) | No “origin” / CSRF errors in network tab |
| Change password | Settings → change password | Works once |

If POST fails with origin errors, fix `EXORA_PUBLIC_ORIGIN` and reload containers.

---

## 6. Meta OAuth (production)

**Meta Dashboard (already done on your side)** must match server env:

- Valid OAuth Redirect URI: `https://marketing.exora.solutions/api/auth/meta/callback`
- App roles: tester/admin on the Meta app for anyone connecting in Development mode

**On server / in browser:**

| Step | Pass |
|------|------|
| Log in to EXORA, open a client → **Accounts** | “Connect Meta” visible |
| Click Connect Meta | Redirect to `facebook.com/.../dialog/oauth` with `client_id=1634505404780640` |
| Approve on Facebook | Redirect to `/ads?meta=connected` (not `invalid`, `denied`, `config`, `token`) |
| Accounts panel | Ad account dropdown populated |
| Select ad account | Saves without error |

Query param meanings:

| `?meta=` | Likely cause |
|----------|----------------|
| `connected` | OK |
| `denied` | User cancelled on Facebook |
| `invalid` | Bad/expired `state` — retry Connect |
| `config` | Missing `META_APP_ID` / `META_APP_SECRET` in container env |
| `token` | Code exchange failed — check secret, redirect URI mismatch, app mode/roles |

Optional — OAuth start without browser (must send session cookie):

```bash
# Expect 302 Location: facebook.com/.../dialog/oauth
curl -sSI -b 'exora_session=...' 'https://marketing.exora.solutions/api/auth/meta/start?client=<CLIENT_UUID>'
```

---

## 7. Meta webhooks (optional)

Only if you subscribed webhooks in Meta:

```bash
# Substitute VERIFY from .env META_WEBHOOK_VERIFY_TOKEN
curl -sS "https://marketing.exora.solutions/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=VERIFY&hub.challenge=test123"
```

Expected: body `test123`, status 200.

---

## 8. Worker and background jobs

```bash
docker compose logs worker --tail=50
```

| Check | Pass |
|-------|------|
| Worker running | No crash loop; connects to DB |
| Publish path | After Review approve, job runs (check worker logs + record status in UI) |
| Meta token refresh | Worker idle loop; no repeated `meta:oauth-failed` in audit |

---

## 9. Data and backups

| Check | Command / action |
|-------|------------------|
| Postgres volume | `docker volume inspect exora-marketing_marketing_pg` (name may vary: `docker compose config --volumes`) |
| App local data | `ls -la /srv/apps/marketing/data/local` |
| Backup | Include Postgres volume + `data/local` + **`.env`** in secure backup (`.env` not in git) |

---

## 10. Security hygiene

- [ ] `.env` mode `600`, not world-readable
- [ ] `META_APP_SECRET` and `POSTGRES_PASSWORD` not in git or screenshots
- [ ] Admin password changed from `EXORA_INITIAL_PASSWORD`
- [ ] Meta App Secret rotated if it was ever pasted in chat/email
- [ ] Firewall: app port **8108** bound to `127.0.0.1` only (not public)
- [ ] Cloudflare (if proxied): SSL mode compatible with origin cert (Full or Full Strict with valid origin cert)

---

## 11. Deploy / update smoke (after `git pull`)

```bash
cd /srv/apps/marketing
git pull
docker compose up -d --build
curl -sS http://127.0.0.1:8108/api/health
curl -sS https://marketing.exora.solutions/api/health
docker compose ps
```

---

## Quick one-liner script (non-secret checks)

```bash
cd /srv/apps/marketing && \
  docker compose ps && \
  curl -sf http://127.0.0.1:8108/api/health && echo && \
  curl -sf https://marketing.exora.solutions/api/health && echo && \
  grep -q '^META_REDIRECT_URI=https://marketing.exora.solutions/api/auth/meta/callback$' .env && \
  echo 'All automated checks passed.'
```

Manual: login, Connect Meta, pick ad account, one Review flow if you use publish.
