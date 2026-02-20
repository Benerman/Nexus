-- Ensure the unique constraint on dm_channels exists
-- (may have been missed if initial migration ran partially)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_dm'
  ) THEN
    ALTER TABLE dm_channels ADD CONSTRAINT unique_dm UNIQUE(participant_1, participant_2);
  END IF;
END
$$;
