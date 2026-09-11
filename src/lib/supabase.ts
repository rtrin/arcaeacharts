import { createClient } from "@supabase/supabase-js";
import type { ClearStatus, ScoreHistoryRow, ScoreRecord } from "@/lib/score-records";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || "https://your-project.supabase.co";
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY || "your-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


export interface Song {
  id: number;

  title: string;
  artist: string;
  difficulty: string;
  constant: number | null;
  level: string;
  version: string;
  charter: string | null;
  is_active?: boolean;
}

// Summary for caching (includes imageUrl for instant display)
export interface SongSummary {
  id: number;

  title: string;
  artist: string;
  difficulty: string;
  constant: number | null;
  level: string;
  version: string;
  charter: string | null;
  is_active?: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

// Cache key and expiration (24 hours)
const CACHE_KEY = 'arcaea_songs_summary';
const CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in ms

// Get cached summaries
export const getCachedSummaries = (): SongSummary[] | null => {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const { data, timestamp } = JSON.parse(cached);
    const now = Date.now();
    
    // Check if cache is expired
    if (now - timestamp > CACHE_EXPIRY) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
     return (data as SongSummary[]).filter((song) => song.is_active !== false);
  } catch {
    return null;
  }
};

// Save summaries to cache
export const saveSummariesToCache = (summaries: SongSummary[]) => {
  try {
    const cacheData = {
      data: summaries,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
  } catch (error) {
    console.error('Failed to save cache:', error);
  }
};

// Fetch all summaries (for background cache update)
export const getAllSummaries = async (): Promise<SongSummary[]> => {
  let allSummaries: SongSummary[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("songs")
      .select("id, title, artist, difficulty, constant, level, version, charter, is_active")
      .eq("is_active", true)
      .range(from, from + pageSize - 1)
      .order("constant", { ascending: false });

    if (error) {
      console.error("Error fetching summaries:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allSummaries = [...allSummaries, ...data];

    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allSummaries;
};

// Paginated fetch - get first N songs ordered by constant DESC
export const getSongsPaginated = async (
  page: number = 1,
  pageSize: number = 25
): Promise<{ data: Song[]; count: number }> => {
  const offset = (page - 1) * pageSize;
  
  const { data, error, count } = await supabase
    .from("songs")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("constant", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (error) {
    console.error("Error fetching paginated songs:", error);
    throw error;
  }

  return {
    data: data || [],
    count: count || 0,
  };
};

export const getSongs = async (): Promise<Song[]> => {
  let allSongs: Song[] = [];
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("songs")
      .select("*")
      .eq("is_active", true)
      .range(from, from + pageSize - 1)
      .order("constant", { ascending: false });

    if (error) {
      console.error("Error fetching songs:", error);
      throw error;
    }

    if (!data || data.length === 0) {
      break;
    }

    allSongs = [...allSongs, ...data];

    // if there's less data than pageSize (1000), we've reached the end
    if (data.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allSongs;
};

export const getProfile = async (userId: string): Promise<Profile> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, created_at, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Your profile is still being created. Please retry.");
  return data as Profile;
};

export const updateProfile = async (
  userId: string,
  displayName: string | null,
): Promise<Profile> => {
  const normalizedName = displayName?.trim().slice(0, 80) || null;
  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: normalizedName })
    .eq("id", userId)
    .select("id, display_name, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as Profile;
};

export const getScoreHistory = async (userId: string): Promise<ScoreHistoryRow[]> => {
  const { data: snapshot, error: snapshotError } = await supabase
    .rpc("get_score_history_snapshot")
    .single();
  if (snapshotError) throw snapshotError;

  const snapshotCreatedAt = (snapshot as { snapshot_created_at: string }).snapshot_created_at;
  const rows: ScoreHistoryRow[] = [];
  let cursor: { dateTaken: string; createdAt: string; id: number } | null = null;
  const pageSize = 500;

  while (true) {
    let query = supabase
      .from("score_records")
      .select("id, user_id, song_id, difficulty, score, clear_status, date_taken, created_at, song:songs(id, title, artist, difficulty, constant, level, version)")
      .eq("user_id", userId)
      .lte("created_at", snapshotCreatedAt)
      .order("date_taken", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(pageSize);

    if (cursor) {
      query = query.or(
        `date_taken.lt.${cursor.dateTaken},and(date_taken.eq.${cursor.dateTaken},created_at.lt.${cursor.createdAt}),and(date_taken.eq.${cursor.dateTaken},created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as unknown as ScoreHistoryRow[];
    rows.push(...page);
    if (page.length < pageSize) break;
    const last = page[page.length - 1];
    if (!last) break;
    cursor = { dateTaken: last.date_taken, createdAt: last.created_at, id: last.id };
  }

  return rows;
};

export const insertScoreRecord = async (input: {
  userId: string;
  songId: number;
  difficulty: string;
  score: number;
  clearStatus: ClearStatus;
  dateTaken: string;
}): Promise<ScoreRecord> => {
  const { data, error } = await supabase
    .from("score_records")
    .insert({
      user_id: input.userId,
      song_id: input.songId,
      difficulty: input.difficulty,
      score: input.score,
      clear_status: input.clearStatus,
      date_taken: input.dateTaken,
    })
    .select("id, user_id, song_id, difficulty, score, clear_status, date_taken, created_at")
    .single();
  if (error) throw error;
  return data as ScoreRecord;
};
