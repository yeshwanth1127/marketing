-- Existing unapproved strategies were generated before the marketer-validation gate.
-- Keep them provisional so none can bypass the new agency-quality control.
UPDATE records
SET data=jsonb_set(
      jsonb_set(data,'{validation_status}','"needs_marketer_confirmation"'::jsonb,true),
      '{validation}',
      '{"status":"needs_marketer_confirmation"}'::jsonb,
      true),
    updated_at=now()
WHERE kind='Strategy'
  AND status IN ('draft','changes_requested','rejected')
  AND NOT (data ? 'validation_status');
