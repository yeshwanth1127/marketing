-- Live progress for running jobs (stages and visible actions) shown in the assistant.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress jsonb;
