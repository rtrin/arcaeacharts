import { createClient } from "@supabase/supabase-js";

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
  constant: number;
  level: string;
  version: string;
}

// Summary for caching (includes imageUrl for instant display)
export interface SongSummary {
  id: number;

  title: string;
  artist: string;
  difficulty: string;
  constant: number;
  level: string;
  version: string;
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
    
    return data;
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
      .select("id, title, artist, difficulty, constant, level, version")
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
