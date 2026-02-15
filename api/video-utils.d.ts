export interface YouTubeItem {
  id: { videoId: string };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: { medium: { url: string } };
  };
}

export function processYouTubeItems(items: any[], songTitle: string, difficulty: string): any[];
export function getSearchQuery(songTitle: string, difficulty: string): string;
export function normalizeSongTitle(songTitle: string): string;
export function normalizeCharacters(str: string): string;
export function fuzzyTitleMatch(videoTitle: string, songTitle: string): boolean;
