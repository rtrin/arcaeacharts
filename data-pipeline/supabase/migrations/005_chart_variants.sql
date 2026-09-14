-- A song can have more than one chart at the same difficulty (for example,
-- Last's 9 and 9+ Beyond charts). The chart constant distinguishes variants.
ALTER TABLE songs
  DROP CONSTRAINT unique_title_artist_difficulty,
  ADD CONSTRAINT unique_title_artist_difficulty_constant
    UNIQUE (title, artist, difficulty, constant);

ALTER TABLE song_sync_staging
  ALTER COLUMN constant SET NOT NULL,
  DROP CONSTRAINT song_sync_staging_pkey,
  ADD PRIMARY KEY (run_id, title, artist, difficulty, constant);

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
  ON CONFLICT (title, artist, difficulty, constant) DO UPDATE SET
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
        AND candidate.constant = current_song.constant
    );
  END IF;

  UPDATE song_sync_runs
  SET status = 'published', completed_at = NULL
  WHERE id = p_run_id;

  DELETE FROM song_sync_staging WHERE run_id = p_run_id;
END;
$$;
