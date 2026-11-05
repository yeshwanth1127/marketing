-- Per-client Meta tokens. token_enc is AES-256-GCM ciphertext; never store plaintext.
CREATE TABLE IF NOT EXISTS connector_accounts (
  id uuid PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('meta')),
  status text NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected','pending','connected','expired','error')),
  token_enc text,
  token_expires_at timestamptz,
  oauth_state text UNIQUE,
  oauth_expires_at timestamptz,
  meta jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, provider)
);
CREATE INDEX IF NOT EXISTS connector_accounts_expiry ON connector_accounts(token_expires_at) WHERE status='connected' AND token_enc IS NOT NULL;

CREATE TABLE IF NOT EXISTS connector_events (
  id bigserial PRIMARY KEY,
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  provider text NOT NULL,
  kind text NOT NULL DEFAULT 'webhook',
  payload jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS connector_events_client ON connector_events(client_id, created_at DESC);
