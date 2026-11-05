-- Chat threads for the EXORA agent. One thread per person per company, brand, or product.
ALTER TABLE audit ADD COLUMN IF NOT EXISTS via text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS agent_threads(
 id uuid PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES users(id),
 client_id uuid NOT NULL REFERENCES clients(id),
 slot jsonb,
 pending jsonb,
 lock_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX IF NOT EXISTS agent_threads_user_client ON agent_threads(user_id, client_id);

CREATE TABLE IF NOT EXISTS agent_messages(
 id uuid PRIMARY KEY,
 thread_id uuid NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
 role text NOT NULL CHECK (role IN ('user','assistant')),
 body text NOT NULL DEFAULT '',
 data jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS agent_messages_thread ON agent_messages(thread_id, created_at);
