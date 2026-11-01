-- Receipts: one row per execution of a skill's own script. Proves which vendor tool produced an output.
CREATE TABLE IF NOT EXISTS tool_runs(
 id uuid PRIMARY KEY,
 client_id uuid NOT NULL REFERENCES clients(id),
 run_id uuid REFERENCES runs(id),
 module text NOT NULL,
 skill text NOT NULL,
 source text,
 script text NOT NULL,
 skill_sha256 text NOT NULL,
 script_sha256 text NOT NULL,
 vendor_match boolean NOT NULL DEFAULT false,
 input_sha256 text NOT NULL,
 output_sha256 text,
 exit_code integer,
 duration_ms integer,
 error text,
 created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS tool_runs_client ON tool_runs(client_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tool_runs_skill ON tool_runs(skill,created_at DESC);
CREATE OR REPLACE FUNCTION reject_tool_run_changes() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'Tool receipts cannot be modified or deleted'; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS tool_runs_immutable ON tool_runs;
CREATE TRIGGER tool_runs_immutable BEFORE UPDATE OR DELETE ON tool_runs FOR EACH ROW EXECUTE FUNCTION reject_tool_run_changes();
