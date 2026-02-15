import { defineConfig, loadEnv } from 'vite'
import { createClient } from '@supabase/supabase-js'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from "path"
import tailwindcss from "@tailwindcss/vite"

interface YouTubeAPIResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      thumbnails: { medium: { url: string } };
    };
  }>;
}

// API plugin for development
function apiPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'api-plugin',
    configureServer(server) {
      server.middlewares.use('/api/youtube-search', async (req, res) => {
        // Initialize Supabase 
        const supabaseUrl = env.VITE_SUPABASE_URL;
        const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
        const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Method not allowed' }));
          return;
        }

        const url = new URL(req.url!, `http://${req.headers.host}`);
        const songTitle = url.searchParams.get('songTitle');
        const songDifficulty = url.searchParams.get('songDifficulty');

        // 1. Try Cache
        if (supabase && songTitle) {
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
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify([{
                id: data.video_id,
                title: data.video_title,
                channelTitle: data.channel_title,
                thumbnailUrl: `https://img.youtube.com/vi/${data.video_id}/mqdefault.jpg`,
                videoUrl: `https://www.youtube.com/watch?v=${data.video_id}`
              }]));
              return;
            }
          } catch {
            // ignore
          }
        }

        if (!songTitle) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'songTitle parameter is required' }));
          return;
        }

        const getMockData = (title: string) => [
          {
            id: 'mock1',
            title: `${title} - Chart View`,
            channelTitle: 'Chart Player',
            thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          },
          {
            id: 'mock2', 
            title: `${title} - Full Combo`,
            channelTitle: 'Pro Player',
            thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          },
          {
            id: 'mock3',
            title: `${title} - Perfect Play`,
            channelTitle: 'Master Player', 
            thumbnailUrl: 'https://img.youtube.com/vi/dQw4w9WgXcQ/mqdefault.jpg',
            videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
          }
        ];

        const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY;
        
        if (!YOUTUBE_API_KEY || YOUTUBE_API_KEY === 'your_youtube_api_key_here') {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(getMockData(songTitle)));
          return;
        }

        try {
          const difficulty = songDifficulty || '';
          
          // @ts-ignore
          const { getSearchQuery, processYouTubeItems } = await import('./api/video-utils.mjs');
          const searchQuery = getSearchQuery(songTitle, difficulty);

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
                // Use APP_URL env var if set, otherwise default to localhost
                'Referer': env.APP_URL || 'http://localhost:5173'
              }
            }
          );

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({})) as any;

            // Check for quota exceeded error
            const isQuotaExceeded = errorData.error?.errors?.some((e: any) => e.reason === 'quotaExceeded');
            if (isQuotaExceeded) {
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(getMockData(songTitle)));
              return;
            }

            throw new Error(`YouTube API request failed: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
          }


          const data = await response.json() as YouTubeAPIResponse;

          let items = data.items || [];
          
          if (items.length > 0) {
            items = processYouTubeItems(items, songTitle, difficulty);
          }

          if (items.length === 0) {
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify([]));
            return;
          }
          
          const videos = items.map((item) => ({
            id: item.id.videoId,
            title: item.snippet.title,
            channelTitle: item.snippet.channelTitle,
            thumbnailUrl: item.snippet.thumbnails.medium.url,
            videoUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`
          }));

          // 2. Save to Cache
          if (supabase && videos.length > 0) {
             const topVideo = videos[0];
             // Fire and forget insert
             supabase.from('song_videos').insert({
                song_title: songTitle,
                difficulty: songDifficulty || null,
                video_id: topVideo.id,
                video_title: topVideo.title,
                channel_title: topVideo.channelTitle
             }).then(() => {
                // ignore
             });
          }

          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(videos));
        } catch {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: 'Failed to search YouTube videos' }));
        }
      });
    }
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  
  return {
    plugins: [react(), tailwindcss(), apiPlugin(env)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: 5173,
    }
  }
})
