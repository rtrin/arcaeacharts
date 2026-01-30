export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;

  videoUrl: string;
}

export async function searchChartViewVideos(
  songTitle: string,
  songDifficulty?: string
): Promise<YouTubeVideo[]> {
  try {
    // calls vercel function
    const params = new URLSearchParams({
      songTitle,
      ...(songDifficulty && { songDifficulty }),
    });

    const response = await fetch(`/api/youtube-search?${params}`);

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const videos: YouTubeVideo[] = await response.json();
    return videos;
  } catch (error) {
    console.error("Error searching YouTube videos:", error);

    // mock data on error
    return [
      {
        id: "mock1",
        title: `${songTitle} - Chart View`,
        channelTitle: "Chart Player",

        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
      {
        id: "mock2",
        title: `${songTitle} - Full Combo`,
        channelTitle: "Pro Player",

        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
      {
        id: "mock3",
        title: `${songTitle} - Perfect Play`,
        channelTitle: "Master Player",

        videoUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      },
    ];
  }
}
