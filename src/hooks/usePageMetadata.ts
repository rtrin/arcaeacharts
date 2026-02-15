import { useEffect, useMemo } from 'react';
import type { Song } from "@/lib/supabase";

export function usePageMetadata(filteredSongs: Song[]) {
  useEffect(() => {
    // SEO metadata
    document.title = "Arcaea Charts";
    const desc =
      "Browse Arcaea songs by titles, artists, and difficulty levels.";
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute("content", desc);
    const canonical = document.querySelector('link[rel="canonical"]');
    if (!canonical) {
      const link = document.createElement("link");
      link.setAttribute("rel", "canonical");
      link.setAttribute("href", "/");
      document.head.appendChild(link);
    }
  }, []);

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Arcaea Song Chart Index",
      itemListElement: filteredSongs.slice(0, 20).map((s, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        item: {
          "@type": "MusicRecording",
          name: s.title,
          byArtist: { "@type": "MusicGroup", name: s.artist },

          genre: "Rhythm Game",
          keywords: `difficulty ${s.difficulty}, constant ${s.constant}, level ${s.level}, version ${s.version}`,
        },
      })),
    }),
    [filteredSongs]
  );

  return { jsonLd };
}
