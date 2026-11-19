-- Allow uploads before a client exists, so onboarding can fill details from files.
ALTER TABLE files ALTER COLUMN client_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS files_staging_owner ON files(created_by, created_at DESC) WHERE client_id IS NULL;
