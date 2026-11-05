# Deploy on Exora server (Docker + gateway nginx)

Matches other apps under `/srv/apps` (Sona, CRM): private port on `127.0.0.1`, TLS on the shared **gateway** container.

## 1. DNS

Point `marketing.exora.solutions` A/AAAA record to the server public IP.

## 2. Clone and configure

```bash
cd /srv/apps
git clone https://github.com/yeshwanth1127/marketing.git
cd marketing
cp .env.production.example .env
# Edit .env: POSTGRES_PASSWORD, META_APP_SECRET, EXORA_TOKEN_KEY (64 hex), META_WEBHOOK_VERIFY_TOKEN, EXORA_INITIAL_PASSWORD
mkdir -p data/local
docker compose up -d --build
```

## 3. TLS + nginx

```bash
certbot certonly --webroot -w /var/www/certbot -d marketing.exora.solutions
cp deploy/nginx/marketing.exora.solutions.conf /srv/gateway/nginx/sites/
docker exec gateway nginx -t && docker exec gateway nginx -s reload
```

## 4. Meta App Dashboard

- **OAuth redirect:** `https://marketing.exora.solutions/api/auth/meta/callback`
- **Webhook URL:** `https://marketing.exora.solutions/api/webhooks/meta`
- **Verify token:** same as `META_WEBHOOK_VERIFY_TOKEN` in `.env`

## 5. Smoke test

```bash
curl -sS http://127.0.0.1:8108/api/health
curl -sS https://marketing.exora.solutions/api/health
```

Sign in with `admin@exora.local` and the password from `EXORA_INITIAL_PASSWORD`, then change it in Settings.
