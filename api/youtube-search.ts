import { processYouTubeItems, getSearchQuery } from './video-utils';
import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Initialize Supabase client
// Prefer Service Role Key for backend (allows INSERT), fallback to Anon Key (read-only usually)
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

  const difficultyStr = Array.isArray(songDifficulty) ? songDifficulty[0] : (songDifficulty || '');

  // 1. Try to get from Cache (Supabase)
  if (supabase) {
    try {
      let query = supabase
        .from('song_videos')
        .select('*')
        .eq('song_title', songTitle);
      
      if (difficultyStr) {
        query = query.eq('difficulty', difficultyStr);
      } else {
        query = query.is('difficulty', null);
      }

      const { data, error } = await query.single();
      
      if (data && !error) {
        // Return cached data formatted as YouTubeVideo
        return res.status(200).json([{
          id: data.video_id,
          title: data.video_title,
          channelTitle: data.channel_title,
          videoUrl: `https://www.youtube.com/watch?v=${data.video_id}`
        }]);
      }
    } catch (err) {
      // failed
    }
  }

  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  
  if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'your_youtube_api_key_here') {
    // Mock data removed as requested
    return res.status(200).json([]);
  }

  try {
    const searchQuery = getSearchQuery(songTitle, difficultyStr);

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?` +
      new URLSearchParams({
        part: 'snippet',
        q: searchQuery,
        type: 'video',
        maxResults: '25',
        key: YOUTUBE_API_KEY,
        order: 'relevance'
      }), {
        headers: {
          'Referer': process.env.APP_URL || 
                     (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '') || 
                     req.headers.referer || 
                     (req.headers.host ? `https://${req.headers.host}` : '')
        }
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      const isQuotaExceeded = errorData.error?.errors?.some((e: any) => e.reason === 'quotaExceeded');
      if (isQuotaExceeded) {
        // Mock data removed
        res.status(200).json([]);
        return;
      }

      throw new Error(`YouTube API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
    }

    const data: any = await response.json();

    let items = data.items || [];

    // Use shared utility for filtering and sorting
    items = processYouTubeItems(items, songTitle, difficultyStr);
    
    // Check if items exist (or were not filtered out)
    if (items.length === 0) {
       return res.status(200).json([]);
    }

    const videos = items.map((item: any) => ({
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
            difficulty: difficultyStr || null,
            video_id: topVideo.id,
            video_title: topVideo.title,
            channel_title: topVideo.channelTitle
          });
          
        if (error) {
          // failed to cache
        } else {
           // cached
        }
      } catch (err) {
        // ignore
      }
    }

    res.status(200).json(videos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to search YouTube videos' });
  }
} 
