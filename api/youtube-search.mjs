export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { songTitle, songDifficulty } = req.query;

  if (!songTitle || typeof songTitle !== 'string') {
    res.status(400).json({ error: 'songTitle parameter is required' });
    return;
  }

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'your_youtube_api_key_here') {
    console.warn('YouTube API key not configured');
    // Return mock data for development
    const mockVideos = [
      {
        id: 'mock1',
        title: `${songTitle} - Chart View`,
        channelTitle: 'Chart Player',

        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      },
      {
        id: 'mock2', 
        title: `${songTitle} - Full Combo`,
        channelTitle: 'Pro Player',

        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      },
      {
        id: 'mock3',
        title: `${songTitle} - Perfect Play`,
        channelTitle: 'Master Player', 

        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      }
    ];
    res.status(200).json(mockVideos);
    return;
  }

  try {
    const searchQuery = `Stalight Arcaea ${songTitle} ${songDifficulty || ''} chart view`.trim();
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: '3',
        key: YOUTUBE_API_KEY,
        order: 'relevance'
      })
    );

    if (!response.ok) {
      throw new Error(`YouTube API request failed: ${response.status}`);
    }

    const data = await response.json();
    
    const videos = data.items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,

      videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    res.status(200).json(videos);
  } catch (error) {
    console.error('Error searching YouTube videos:', error);
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
} 