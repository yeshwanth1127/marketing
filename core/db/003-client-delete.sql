-- Deleting a client removes all of its data, including its audit entries and tool receipts.
-- Those two tables stay append-only for everything else: a delete is allowed only for rows of the one
-- client named in the transaction-local setting exora.purge_client (set by core/clients/delete.mjs).
CREATE OR REPLACE FUNCTION reject_audit_changes() RETURNS trigger AS $$ BEGIN
 IF TG_OP='DELETE' AND OLD.client_id IS NOT NULL AND current_setting('exora.purge_client',true)=OLD.client_id::text THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Audit entries cannot be modified or deleted'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION reject_tool_run_changes() RETURNS trigger AS $$ BEGIN
 IF TG_OP='DELETE' AND current_setting('exora.purge_client',true)=OLD.client_id::text THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Tool receipts cannot be modified or deleted'; END; $$ LANGUAGE plpgsql;
