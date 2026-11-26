-- Editable video: every video asset is backed by a VideoDesign document. The MP4 is derived from it.
-- Each applied patch is a version; head points at the version being shown (undo/redo move it).
CREATE TABLE IF NOT EXISTS video_designs(
 asset_id uuid PRIMARY KEY REFERENCES records(id) ON DELETE CASCADE,
 client_id uuid NOT NULL,
 head integer NOT NULL DEFAULT 1,
 read_only text,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS video_design_versions(
 id uuid PRIMARY KEY,
 asset_id uuid NOT NULL REFERENCES records(id) ON DELETE CASCADE,
 version integer NOT NULL,
 parent integer,
 design jsonb NOT NULL,
 patch jsonb,
 note text,
 rendered_file_id uuid,
 created_by uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(asset_id,version)
);
-- Token and cost instrumentation for every Claude run (filled from the CLI's result event).
ALTER TABLE runs ADD COLUMN IF NOT EXISTS usage jsonb;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS duration_ms integer;
