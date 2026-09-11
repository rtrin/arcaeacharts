ALTER TABLE songs
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE songs
  ALTER COLUMN is_active SET DEFAULT true;
UPDATE songs SET is_active = true WHERE is_active IS NULL;
ALTER TABLE songs
  ALTER COLUMN is_active SET NOT NULL;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_display_name_check CHECK (
    display_name IS NULL
    OR (display_name = btrim(display_name) AND char_length(display_name) BETWEEN 1 AND 80)
  )
);

CREATE TABLE IF NOT EXISTS score_records (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  song_id bigint NOT NULL REFERENCES songs(id) ON DELETE RESTRICT,
  difficulty text NOT NULL,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 10000000),
  clear_status text NOT NULL CHECK (clear_status IN (
    'Track Lost', 'Clear', 'Full Recall', 'Easy Clear',
    'Hard Clear', 'EX', 'EX+', 'PM'
  )),
  date_taken date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS score_records_history_idx
  ON score_records (user_id, date_taken DESC, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS score_records_chart_idx
  ON score_records (user_id, song_id, difficulty, date_taken, created_at, id);

CREATE OR REPLACE FUNCTION public.set_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_profile_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  provider_name text;
BEGIN
  provider_name := nullif(
    btrim(left(coalesce(
      NEW.raw_user_meta_data ->> 'display_name',
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      ''
    ), 80)),
    ''
  );

  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, provider_name)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created_profile ON auth.users;
CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_profile();

INSERT INTO public.profiles (id, display_name)
SELECT
  id,
  nullif(
    btrim(left(coalesce(
      raw_user_meta_data ->> 'display_name',
      raw_user_meta_data ->> 'full_name',
      raw_user_meta_data ->> 'name',
      ''
    ), 80)),
    ''
  )
FROM auth.users
ON CONFLICT (id) DO NOTHING;

REVOKE ALL ON FUNCTION public.set_profile_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.validate_score_record_chart()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.songs
    WHERE id = NEW.song_id
      AND difficulty = NEW.difficulty
      AND is_active
  ) THEN
    RAISE EXCEPTION 'Song chart is not active or difficulty does not match';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_score_record_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.date_taken > (CURRENT_DATE + 1) THEN
    RAISE EXCEPTION 'Played date cannot be more than one day in the future';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS score_records_validate_chart ON public.score_records;
CREATE TRIGGER score_records_validate_chart
  BEFORE INSERT ON public.score_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_score_record_chart();

DROP TRIGGER IF EXISTS score_records_validate_date ON public.score_records;
CREATE TRIGGER score_records_validate_date
  BEFORE INSERT ON public.score_records
  FOR EACH ROW EXECUTE FUNCTION public.validate_score_record_date();

REVOKE ALL ON FUNCTION public.validate_score_record_chart() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_score_record_date() FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.publish_song_sync(uuid, boolean);
CREATE OR REPLACE FUNCTION public.publish_song_sync(
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
    SELECT 1 FROM public.song_sync_runs
    WHERE id = p_run_id AND status = 'staged'
  ) THEN
    RAISE EXCEPTION 'Sync run % is not staged', p_run_id;
  END IF;

  INSERT INTO public.songs (
    title, artist, difficulty, constant, level, version, charter, is_active
  )
  SELECT title, artist, difficulty, constant, level, version, charter, true
  FROM public.song_sync_staging
  WHERE run_id = p_run_id
  ON CONFLICT (title, artist, difficulty) DO UPDATE SET
    constant = EXCLUDED.constant,
    level = EXCLUDED.level,
    version = EXCLUDED.version,
    charter = EXCLUDED.charter,
    is_active = true;

  IF p_complete THEN
    UPDATE public.songs AS current_song
    SET is_active = false
    WHERE current_song.is_active
      AND NOT EXISTS (
        SELECT 1
        FROM public.song_sync_staging AS candidate
        WHERE candidate.run_id = p_run_id
          AND candidate.title = current_song.title
          AND candidate.artist = current_song.artist
          AND candidate.difficulty = current_song.difficulty
      );
  END IF;

  UPDATE public.song_sync_runs
  SET status = 'published', completed_at = NULL
  WHERE id = p_run_id;

  DELETE FROM public.song_sync_staging WHERE run_id = p_run_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_song_sync(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.publish_song_sync(uuid, boolean) TO service_role;

CREATE OR REPLACE FUNCTION public.get_score_history_snapshot()
RETURNS TABLE (snapshot_created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT current_timestamp;
$$;

REVOKE ALL ON FUNCTION public.get_score_history_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_score_history_snapshot() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.score_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own ON public.profiles;
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS score_records_select_own ON public.score_records;
CREATE POLICY score_records_select_own ON public.score_records
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS score_records_insert_own ON public.score_records;
CREATE POLICY score_records_insert_own ON public.score_records
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

REVOKE ALL ON public.profiles FROM anon, authenticated;
REVOKE ALL ON public.score_records FROM anon, authenticated;
GRANT SELECT, UPDATE (display_name) ON public.profiles TO authenticated;
GRANT SELECT, INSERT (user_id, song_id, difficulty, score, clear_status, date_taken)
  ON public.score_records TO authenticated;
