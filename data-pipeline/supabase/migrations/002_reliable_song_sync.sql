CREATE TABLE IF NOT EXISTS song_sync_runs (
  id uuid PRIMARY KEY,
  status text NOT NULL,
  source_revision text NOT NULL DEFAULT '',
  row_count integer NOT NULL DEFAULT 0,
  dataset_hash text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS song_sync_staging (
  run_id uuid NOT NULL REFERENCES song_sync_runs(id) ON DELETE CASCADE,
  title text NOT NULL,
  artist text NOT NULL,
  difficulty text NOT NULL,
  constant double precision,
  level integer,
  version text NOT NULL DEFAULT '',
  charter text,
  PRIMARY KEY (run_id, title, artist, difficulty)
);

CREATE OR REPLACE FUNCTION publish_song_sync(p_run_id uuid)
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

  UPDATE song_sync_runs
  SET status = 'success', completed_at = timezone('utc'::text, now())
  WHERE id = p_run_id;

  DELETE FROM song_sync_staging WHERE run_id = p_run_id;
END;
$$;
