# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Start Vite dev server on port 5173
- `npm run build` — TypeScript check + Vite production build
- `npm run lint` — ESLint (flat config, TS/TSX only)
- `npm run preview` — Preview production build locally

## Architecture

Single-page React app for browsing Arcaea rhythm game charts with YouTube video integration. Deployed on Vercel.

### Frontend (src/)

- **Single route app** — React Router with just `/` (Index page) and a 404 catch-all
- **Data flow**: `useSongs` fetches all songs from Supabase with a 3-tier strategy: localStorage cache → first page from server → background full fetch. `useSongFilter` handles client-side search, filtering, sorting, and pagination via `useMemo`.
- **Video overlay**: `useVideoSelection` manages YouTube chart view video selection. Clicking "Chart View" on a song card calls `/api/youtube-search`, caches results in-memory, and opens a `VideoOverlay` with `react-player`.
- **UI**: shadcn/ui (new-york style) with Radix primitives. Path alias `@/` maps to `src/`. Tailwind CSS v4 via `@tailwindcss/vite` plugin.

### API Layer (api/ + vite.config.ts)

Two parallel implementations of the YouTube search endpoint:
- **`api/youtube-search.mjs`** — Vercel serverless function (production)
- **`vite.config.ts` apiPlugin** — Dev middleware that mirrors the same logic

Both share **`api/video-utils.mjs`** which contains the core YouTube result processing: title normalization (unicode, smart quotes, subtitle stripping), fuzzy matching via Levenshtein distance, and relevance scoring (song title match +10, difficulty match +5, "chart view" +2). Results are cached in Supabase `song_videos` table.

### Key Data Types

- `Song` / `SongSummary` (defined in `src/lib/supabase.ts`) — Core data model from Supabase `songs` table
- `YouTubeVideo` (defined in `src/lib/youtube.ts`) — Video search result

### Supabase Tables

- `songs` — Song catalog (title, artist, difficulty, constant, level, version)
- `song_videos` — YouTube video cache keyed by (song_title, difficulty)

## Environment Variables

- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Required for song data
- `YOUTUBE_API_KEY` — Optional; without it, video search returns empty results
- `SUPABASE_SERVICE_ROLE_KEY` — Backend-only, allows writes to video cache

## Conventions

- `api/` files are plain `.mjs` (ES modules, no TypeScript) for Vercel serverless functions
- Play rating calculation lives in `src/lib/song-utils.ts` and follows Arcaea's formula: `max(constant + scoreModifier, 0)`
