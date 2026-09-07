-- Preserve source-fidelity metadata and plus levels in the staging transaction.
-- The frontend contract is text, and changing the catalog column is required
-- before the first atomic publish can store values such as ``10+``.
ALTER TABLE songs
  ALTER COLUMN level TYPE text USING level::text;

ALTER TABLE song_sync_runs
  ADD COLUMN IF NOT EXISTS post_publish_hash text,
  ADD COLUMN IF NOT EXISTS verification_status text,
  ADD COLUMN IF NOT EXISTS diff_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE song_sync_staging
  ALTER COLUMN level TYPE text USING level::text;

ALTER TABLE song_sync_staging
  ADD COLUMN IF NOT EXISTS source_page_title text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS source_revision text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS row_hash text NOT NULL DEFAULT '';

DROP FUNCTION IF EXISTS publish_song_sync(uuid);

CREATE OR REPLACE FUNCTION publish_song_sync(
  p_run_id uuid,
  p_complete boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM song_sync_runs
    WHERE id = p_run_id AND status = 'staged'
  ) THEN
    RAISE EXCEPTION 'Sync run % is not staged', p_run_id;
  END IF;

  INSERT INTO songs (title, artist, difficulty, constant, level, version, charter)
  SELECT title, artist, difficulty, constant, level, version, charter
  FROM song_sync_staging
  WHERE run_id = p_run_id
  ON CONFLICT (title, artist, difficulty) DO UPDATE SET
    constant = EXCLUDED.constant,
    level = EXCLUDED.level,
    version = EXCLUDED.version,
    charter = EXCLUDED.charter;

  IF p_complete THEN
    DELETE FROM songs AS current_song
    WHERE NOT EXISTS (
      SELECT 1
      FROM song_sync_staging AS candidate
      WHERE candidate.run_id = p_run_id
        AND candidate.title = current_song.title
        AND candidate.artist = current_song.artist
        AND candidate.difficulty = current_song.difficulty
    );
  END IF;

  UPDATE song_sync_runs
  SET status = 'published', completed_at = NULL
  WHERE id = p_run_id;

  DELETE FROM song_sync_staging WHERE run_id = p_run_id;
END;
$$;
