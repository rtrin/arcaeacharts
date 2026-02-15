
import { useState, useEffect } from 'react';
import { getSongs, getSongsPaginated, getCachedSummaries, saveSummariesToCache, type Song } from "@/lib/supabase";

export const useSongs = () => {
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadSongs = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Try to load from cache first (instant display)
        const cachedSummaries = getCachedSummaries();
        if (cachedSummaries) {
          // Convert summaries to full Song objects (includes cached imageUrl)
          const cachedSongs: Song[] = cachedSummaries.map(s => ({
            ...s,
          }));
          setAllSongs(cachedSongs);
          setLoading(false); // Show cached data immediately
        }

        // 2. Fetch first page from server (with full data, ordered by constant DESC)
        // We only do this if we didn't have full data, or to refresh first page
        const { data: firstPage } = await getSongsPaginated(1, 25);

        // Update with real data (includes imageUrl)
        setAllSongs(firstPage);
        setLoading(false);

        // 3. Background: Fetch all songs and update cache
        // This runs in the background without blocking the UI
        getSongs()
          .then(songs => {
            // Convert to summaries (includes imageUrl for instant display)
            const summaries = songs.map((song) => ({
              id: song.id,
              title: song.title,
              artist: song.artist,
              difficulty: song.difficulty,
              constant: song.constant,
              level: song.level,
              version: song.version,
            }));
            saveSummariesToCache(summaries);
            // Update comprehensive list
            setAllSongs(songs);
          })
          .catch(err => {
            console.error('Background cache update failed:', err);
            // Non-critical
          });

      } catch (err) {
        console.error("Error loading songs:", err);
        setError("Failed to load songs. Please try again later.");
        setLoading(false);
      }
    };

    loadSongs();
  }, []);

  return { allSongs, loading, error };
};
