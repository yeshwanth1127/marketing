-- Health signals for local background services, so queued work never looks like active AI work.
CREATE TABLE IF NOT EXISTS service_heartbeats(
 service text PRIMARY KEY,
 status text NOT NULL,
 details jsonb NOT NULL DEFAULT '{}',
 updated_at timestamptz NOT NULL DEFAULT now()
);
