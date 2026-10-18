import { useRef, useState } from 'react';
import { searchChartViewVideos, type YouTubeVideo } from "@/lib/youtube";
import { createChartScopeKey } from "@/lib/practice-bookmarks";
import type { Song } from "@/lib/supabase";

export function useVideoSelection() {
  const [selectedVideo, setSelectedVideo] = useState<{
    videoId: string;
    chartKey: string;
  } | null>(null);
  const videoCache = useRef(new Map<string, YouTubeVideo[]>());
  const requestId = useRef(0);

  const handleChartView = async (song: Pick<Song, "id" | "title" | "difficulty" | "version">) => {
    const request = ++requestId.current;
    const chartKey = createChartScopeKey(song.id, song.difficulty, song.version);
    let videos = videoCache.current.get(chartKey);

    if (!videos) {
      videos = await searchChartViewVideos(song.title, song.difficulty);
      videoCache.current.set(chartKey, videos || []);
    }

    if (request !== requestId.current) return;
    if (videos?.[0]) {
      setSelectedVideo({ videoId: videos[0].id, chartKey });
    }
  };

  const closeVideo = () => {
    requestId.current += 1;
    setSelectedVideo(null);
  };

  return {
    selectedVideo,
    closeVideo,
    handleChartView,
  };
}
