import { useState } from 'react';
import { searchChartViewVideos, type YouTubeVideo } from "@/lib/youtube";

export function useVideoSelection() {
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoCache, setVideoCache] = useState<Map<string, YouTubeVideo[]>>(
    new Map()
  );

  const handleChartView = async (songTitle: string, songDifficulty: string) => {
    let videos = videoCache.get(songTitle);

    if (!videos) {
      videos = await searchChartViewVideos(songTitle, songDifficulty);
      setVideoCache((prev) => new Map(prev).set(songTitle, videos || []));
    }

    if (videos && videos.length > 0) {
      // Use the first (most relevant) video
      setSelectedVideo(videos[0].id);
    }
  };

  return {
    selectedVideo,
    setSelectedVideo,
    handleChartView
  };
}
