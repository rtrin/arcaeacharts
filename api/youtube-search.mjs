import { createClient } from '@supabase/supabase-js';

const getMockData = (songTitle) => [
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

// Initialize Supabase client
// Prefer Service Role Key for backend (allows INSERT), fallback to Anon Key (read-only usually)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

  // 1. Try to get from Cache (Supabase)
  if (supabase) {
    try {
      let query = supabase
        .from('song_videos')
        .select('*')
        .eq('song_title', songTitle);
      
      if (songDifficulty) {
        query = query.eq('difficulty', songDifficulty);
      } else {
        query = query.is('difficulty', null);
      }

      const { data, error } = await query.single();
      
      if (data && !error) {
        console.log(`Cache hit for "${songTitle}"`);
        // Return cached data formatted as YouTubeVideo
        return res.status(200).json([{
          id: data.video_id,
          title: data.video_title,
          channelTitle: data.channel_title,
          videoUrl: `https://www.youtube.com/watch?v=${data.video_id}`
        }]);
      }
    } catch (err) {
      console.warn('Cache lookup failed:', err);
    }
  }

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'your_youtube_api_key_here') {
    console.warn('YouTube API key not configured');
    // Return mock data for development
    // Return mock data for development
    res.status(200).json(getMockData(songTitle));
    return;
  }


  try {

    const difficulty = songDifficulty || '';
    const includeStaLight = ['Future', 'Beyond', 'Eternal'].includes(difficulty);
    const searchQuery = `${includeStaLight ? 'StaLight ' : ''}Arcaea ${songTitle} ${difficulty} chart view`.trim();
    
    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: '3',
        key: YOUTUBE_API_KEY,
        order: 'relevance'
      }), {
        headers: {
          // 1. Explicit APP_URL (if set)
          // 2. Vercel automatically sets VERCEL_URL (add https://)
          // 3. Fallback to request host
          'Referer': process.env.APP_URL || 
                     (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) || 
                     req.headers.referer || 
                     `https://${req.headers.host}`
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('YouTube API Error Details:', JSON.stringify(errorData, null, 2));
      
      // Check for quota exceeded error
      const isQuotaExceeded = errorData.error?.errors?.some(e => e.reason === 'quotaExceeded');
      if (isQuotaExceeded) {
        console.warn('YouTube API quota exceeded, falling back to mock data');
        res.status(200).json(getMockData(songTitle));
        return;
      }

      throw new Error(`YouTube API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = await response.json();
    
    // Check if items exist in the response
    if (!data.items) {
       console.warn('No items found in YouTube response', data);
       return res.status(200).json([]);
    }

    const videos = data.items.map((item) => ({
      id: item.id.videoId,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,

      videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
    }));

    // 2. Save to Cache (Supabase)
    if (supabase && videos.length > 0) {
      const topVideo = videos[0];
      try {
        const { error } = await supabase
          .from('song_videos')
          .insert({
            song_title: songTitle,
            difficulty: songDifficulty || null,
            video_id: topVideo.id,
            video_title: topVideo.title,
            channel_title: topVideo.channelTitle
          });
          
        if (error) {
          console.error('Failed to cache video:', error);
        } else {
           console.log(`Cached video for "${songTitle}"`);
        }
      } catch (err) {
        console.error('Cache insert error:', err);
      }
    }

    res.status(200).json(videos);
  } catch (error) {
    console.error('Error searching YouTube videos:', error);
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
} 