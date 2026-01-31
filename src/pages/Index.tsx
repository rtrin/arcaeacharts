import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSongs, getSongsPaginated, getCachedSummaries, saveSummariesToCache, type Song } from "@/lib/supabase";
import { searchChartViewVideos, type YouTubeVideo } from "@/lib/youtube";
import { VideoOverlay } from "@/components/VideoOverlay";

const Index = () => {
  const [query, setQuery] = useState("");
  const [difficultyRange, setDifficultyRange] = useState<[number, number]>([
    1, 12,
  ]);
  const [debouncedDifficultyRange, setDebouncedDifficultyRange] = useState<
    [number, number]
  >([1, 12]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>(
    []
  );
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortBy, setSortBy] = useState<"title" | "artist" | "constant">(
    "constant"
  );
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [selectedVideo, setSelectedVideo] = useState<string | null>(null);
  const [videoCache, setVideoCache] = useState<Map<string, YouTubeVideo[]>>(
    new Map()
  );

  // Which fields the text search applies to
  const [searchFields, setSearchFields] = useState<Array<"title" | "artist" | "constant" | "version">>([
    "title",
    "artist",
    "constant",
    "version",
  ]);
  const difficultyTypes = ["Past", "Present", "Future", "Eternal", "Beyond"];





  // Score modifier: ≥10M -> 2.0; 9.8M–9.999M -> 1 + (score-9800000)/200000; ≤9.8M -> (score-9500000)/300000
  const calculateScoreModifier = (score: number): number => {
    if (score >= 10000000) return 2.0;
    if (score >= 9800000) return 1.0 + (score - 9800000) / 200000;
    return (score - 9500000) / 300000;
  };

  // Play rating = max(constant + score modifier, 0)
  const calculatePlayRating = (constant: number, score: number): number => {
    const modifier = calculateScoreModifier(score);
    return Math.max(constant + modifier, 0);
  };







  const getDifficultyColor = (difficulty: string): string => {
    switch (difficulty) {
      case "Past":
        return "#4caed1";
      case "Present":
        return "#8fad4c";
      case "Future":
        return "#822c68";
      case "Eternal":
        return "#8571a3";
      case "Beyond":
        return "#b5112e";
      default:
        return "#64748b";
    }
  };

  const toggleDifficulty = (difficulty: string) => {
    setSelectedDifficulties(
      (
        prev // current selected difficulties
      ) =>
        prev.includes(difficulty)
          ? prev.filter((d) => d !== difficulty) // remove if already selected
          : [...prev, difficulty] // add if not selected
    );
  };

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

    const loadSongs = async () => {
      try {
        setLoading(true);
        setError(null);

        // 1. Try to load from cache first (instant display)
        const cachedSummaries = getCachedSummaries();
        if (cachedSummaries) {
          // Convert summaries to full Song objects (includes cached imageUrl)
          const cachedSongs: Song[] = cachedSummaries.map(s => ({
            ...s,
          }));
          setAllSongs(cachedSongs);
          setLoading(false); // Show cached data immediately
        }

        // 2. Fetch first page from server (with full data, ordered by constant DESC)
        const { data: firstPage } = await getSongsPaginated(1, 25);
        
        // Update with real data (includes imageUrl)
        setAllSongs(firstPage);
        setLoading(false);

        // 3. Background: Fetch all songs and update cache
        // This runs in the background without blocking the UI
        getSongs()
          .then(allSongs => {
            // Convert to summaries (includes imageUrl for instant display)
            const summaries = allSongs.map((song) => ({
              id: song.id,

              title: song.title,
              artist: song.artist,
              difficulty: song.difficulty,
              constant: song.constant,
              level: song.level,
              version: song.version,
            }));
            saveSummariesToCache(summaries);
            // Optionally update allSongs with full dataset for filtering/searching
            setAllSongs(allSongs);
          })
          .catch(err => {
            console.error('Background cache update failed:', err);
            // Non-critical, don't show error to user
          });

      } catch (err) {
        console.error("Error loading songs:", err);
        setError("Failed to load songs. Please try again later.");
        setLoading(false);
      }
    };

    loadSongs();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDifficultyRange(difficultyRange);
    }, 150);

    return () => clearTimeout(timer);
  }, [difficultyRange]);

  const processedSongs = useMemo(() => {
    return allSongs.map((song) => ({
      ...song,
      searchText:
        `${song.title} ${song.artist} ${song.constant} ${song.level}`.toLowerCase(),
    }));
  }, [allSongs]);

  const filtered: Song[] = useMemo(() => {
    const [min, max] = debouncedDifficultyRange;
    const q = query.toLowerCase().trim();

    return processedSongs.filter((s) => {
      // Field-scoped text matching
      const fieldMatch = !q || (() => {
        const checks: boolean[] = [];
        if (searchFields.includes("title")) {
          checks.push(s.title.toLowerCase().includes(q));
        }
        if (searchFields.includes("artist")) {
          checks.push(s.artist.toLowerCase().includes(q));
        }
        if (searchFields.includes("version")) {
          const v = (s.version || "").toLowerCase();
          checks.push(v.startsWith(q) || v.includes(q));
        }
        if (searchFields.includes("constant")) {
          const cStr = String(s.constant).toLowerCase();
          checks.push(cStr.startsWith(q) || cStr.includes(q));
        }
        return checks.some(Boolean);
      })();
      const inRange = s.constant === null || (s.constant >= min && s.constant <= max);
      const difficultyMatch =
        selectedDifficulties.length === 0 ||
        selectedDifficulties.includes(s.difficulty);
      return fieldMatch && inRange && difficultyMatch;
    });
  }, [query, debouncedDifficultyRange, selectedDifficulties, processedSongs, searchFields]);

  useEffect(() => {
    setCurrentPage(1);
  }, [query, debouncedDifficultyRange, selectedDifficulties]);

  // Sort filtered songs
  const sortedSongs = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      let aValue: string | number | null;
      let bValue: string | number | null;

      switch (sortBy) {
        case "constant":
          aValue = a.constant;
          bValue = b.constant;
          break;
        case "title":
          aValue = a[sortBy].toLowerCase();
          bValue = b[sortBy].toLowerCase();
          break;
        case "artist":
        default:
          aValue = a[sortBy].toLowerCase();
          bValue = b[sortBy].toLowerCase();
          break;
      }

      if (sortOrder === "asc") {
        if (aValue === null) return 1;
        if (bValue === null) return -1;
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        if (aValue === null) return 1;
        if (bValue === null) return -1;
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });
    return sorted;
  }, [filtered, sortBy, sortOrder]);

  const paginatedSongs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return sortedSongs.slice(startIndex, endIndex);
  }, [sortedSongs, currentPage, pageSize]);

  const totalPages = Math.ceil(filtered.length / pageSize);
  const pageSizeOptions = [10, 25, 50, 100];

  const jsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: "Arcaea Song Chart Index",
      itemListElement: filtered.slice(0, 20).map((s, idx) => ({
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
    [filtered]
  );

  return (
    <div className="flex flex-col min-h-screen items-center">
      <header className="py-10">
        <div className="flex flex-row items-center justify-center gap-x-4">
          <div className="flex items-center gap-4">
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-[#4e356f]">
              Arcaea Charts
            </h1>
            <img
              src="/logo.jpg"
              alt="Game Logo"
              className="h-16 md:h-20 w-auto object-contain"
            />
          </div>
        </div>
      </header>
      <main className="container px-4 md:px-24 lg:px-48">
        <section aria-labelledby="filters" className="mb-6">
          <h2 id="filters" className="sr-only">
            Filters
          </h2>
          <div className="space-y-4">
            {/* Search Bar - Full Width */}
            <div>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by title, artist, or constant"
                aria-label="Search songs"
              />
            </div>

            {/* Search-in Field Toggles */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Search filters:</span>
              {(
                [
                  { key: "title", label: "Title" },
                  { key: "artist", label: "Artist" },
                  { key: "constant", label: "Constant" },
                  { key: "version", label: "Version" },
                ] as Array<{ key: "title" | "artist" | "constant" | "version"; label: string }>
              ).map(({ key, label }) => {
                const active = searchFields.includes(key);
                return (
                  <Button
                    key={key}
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSearchFields((prev) =>
                        prev.includes(key)
                          ? prev.filter((k) => k !== key)
                          : [...prev, key]
                      );
                    }}
                    aria-pressed={active}
                    aria-label={`Toggle search in ${label}`}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>

            {/* Sort and Filter Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              {/* Sort Controls */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground mr-1 sm:mr-0">
                  Sort:
                </span>
                <select
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as "title" | "artist" | "constant")
                  }
                  className="text-xs px-2 py-1 border border-input bg-background rounded-md text-foreground"
                >
                  <option value="title">Title</option>
                  <option value="artist">Artist</option>
                  <option value="constant">Constant</option>
                </select>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setSortOrder(sortOrder === "asc" ? "desc" : "asc")
                  }
                  className="text-xs px-2 py-1 h-auto min-w-[32px]"
                  title={
                    sortOrder === "asc" ? "Sort Ascending" : "Sort Descending"
                  }
                >
                  {sortOrder === "asc" ? "↑" : "↓"}
                </Button>
              </div>

              {/* Filter Controls */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-sm text-muted-foreground">Difficulty:</span>
                {difficultyTypes.map((difficulty) => (
                  <Button
                    key={difficulty}
                    variant={
                      selectedDifficulties.includes(difficulty)
                        ? "default"
                        : "outline"
                    }
                    size="sm"
                    onClick={() => toggleDifficulty(difficulty)}
                    className="text-xs border-2"
                    style={{
                      backgroundColor: selectedDifficulties.includes(difficulty)
                        ? getDifficultyColor(difficulty)
                        : "transparent",
                      borderColor: getDifficultyColor(difficulty),
                      color: selectedDifficulties.includes(difficulty)
                        ? "white"
                        : getDifficultyColor(difficulty),
                    }}
                  >
                    {difficulty === "Eternal"
                      ? "ETR"
                      : difficulty === "Beyond"
                      ? "BYD"
                      : difficulty === "Past"
                      ? "PST"
                      : difficulty === "Present"
                      ? "PRS"
                      : difficulty === "Future"
                      ? "FTR"
                      : difficulty.slice(0, 3).toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Constant Range - Own row */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Constant range</span>
                <span>
                  <Badge
                    variant="secondary"
                    aria-label="Current min difficulty"
                  >
                    {difficultyRange[0]}
                  </Badge>
                  <span className="mx-1">–</span>
                  <Badge
                    variant="secondary"
                    aria-label="Current max difficulty"
                  >
                    {difficultyRange[1]}
                  </Badge>
                </span>
              </div>
              <Slider
                value={difficultyRange}
                onValueChange={(val) =>
                  setDifficultyRange([val[0], val[1]] as [number, number])
                }
                min={1}
                max={12}
                step={0.1}
                aria-label="Difficulty range"
              />
            </div>
          </div>
        </section>

        <section aria-labelledby="results">
          <h2 id="results" className="sr-only">
            Results
          </h2>
          {loading && (
            <div className="text-center py-16 text-muted-foreground">
              Loading songs...
            </div>
          )}
          {error && (
            <div className="text-center py-16 text-red-500">{error}</div>
          )}
          {!loading && !error && (
            <>
              <ul className="space-y-3" role="list">
                {paginatedSongs.map((song, index) => (
                  <li
                    key={`${song.title}-${song.difficulty}-${song.version}-${index}`}
                    className="group p-3 sm:p-4 rounded-lg border bg-card transition-all duration-200"
                  >
                    <article className="flex items-center gap-2 sm:gap-4">
                      {/* Left Section: Image + Info */}
                      <div className="flex items-center gap-2 sm:gap-4 flex-1 min-w-0">

                        <div className="flex-1 min-w-0">
                          <h3 className="text-base sm:text-sm md:text-lg font-semibold truncate">
                            {song.title}
                          </h3>
                          <p className="text-xs sm:text-xs md:text-sm text-muted-foreground truncate">
                            {song.artist}
                          </p>
                          <div className="text-[10px] sm:text-xs md:text-sm text-muted-foreground">
                            {song.version} •{" "}
                            <span
                              style={{
                                color: getDifficultyColor(song.difficulty),
                                fontWeight: "600",
                              }}
                            >
                              {song.difficulty}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Rating column: rating at 9.8M, 9.9M, 10M */}
                      {song.constant != null && (
                        <div
                          className="flex flex-col gap-1 sm:gap-1.5 min-w-[72px] sm:min-w-[90px] md:min-w-[120px] px-2 sm:px-3 py-1.5 sm:py-2 font-mono text-xs sm:text-sm"
                          aria-label="Play rating at 9.8M, 9.9M, 10M score"
                        >
                          <div
                            className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide"
                            style={{ color: "#4e356f" }}
                          >
                            Rating
                          </div>
                          <div className="flex justify-between gap-2 sm:gap-3 font-medium text-muted-foreground">
                            <span style={{ color: "#4e356f" }}>980</span>
                            <span className="text-foreground">{calculatePlayRating(song.constant, 9800000).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-2 sm:gap-3 font-medium text-muted-foreground">
                            <span style={{ color: "#4e356f" }}>990</span>
                            <span className="text-foreground">{calculatePlayRating(song.constant, 9900000).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between gap-2 sm:gap-3 font-medium text-muted-foreground">
                            <span style={{ color: "#4e356f" }}>PM</span>
                            <span className="text-foreground">{calculatePlayRating(song.constant, 10000000).toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      {/* Right Section: Level, Constant, Chart View */}
                      <div className="flex flex-col items-end gap-1.5 sm:gap-2 min-w-[100px] sm:min-w-[120px] md:min-w-[160px]">
                        <Badge
                          className="select-none h-5 sm:h-6 md:h-8 w-full justify-center text-[10px] sm:text-xs md:text-sm font-medium font-mono border-2"
                          style={{
                            backgroundColor: "#4e356f",
                            borderColor: "#4e356f",
                            color: "#ffffff",
                          }}
                          aria-label={`Level ${song.level}`}
                        >
                          {"Level:    " + song.level}
                        </Badge>
                        <Badge
                          className="select-none h-5 sm:h-6 md:h-8 w-full justify-center text-[10px] sm:text-xs md:text-sm font-medium font-mono border-2"
                          style={{
                            backgroundColor: "#f9fafb",
                            borderColor: "#4e356f",
                            color: "#111827",
                          }}
                          aria-label={`Constant ${song.constant ?? "—"}`}
                        >
                          {"Constant: " +
                            (song.constant != null ? song.constant : "TBA")}
                        </Badge>

                        <Button
                          onClick={() =>
                            handleChartView(
                              song.title ?? "",
                              song.difficulty ?? ""
                            )
                          }
                          variant="outline"
                          size="sm"
                          className="text-[10px] sm:text-xs font-medium bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 text-red-700 w-full justify-center h-7 sm:h-8"
                        >
                          Chart View
                        </Button>
                      </div>
                    </article>
                  </li>
                ))}

                {filtered.length === 0 && (
                  <div className="text-center py-16 text-muted-foreground">
                    No songs match your search.
                  </div>
                )}
              </ul>

              {/* Pagination Controls */}
              {filtered.length > 0 && (
                <div className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                  {/* Results info */}
                  <div className="text-sm text-muted-foreground">
                    {Math.min(
                      (currentPage - 1) * pageSize + 1,
                      filtered.length
                    )}
                    -{Math.min(currentPage * pageSize, filtered.length)} of{" "}
                    {filtered.length} songs
                  </div>

                  {/* Page size selector */}
                  <div className="flex items-center gap-2">
                    {pageSizeOptions.map((size) => (
                      <Button
                        key={size}
                        variant={pageSize === size ? "default" : "outline"}
                        size="sm"
                        onClick={() => {
                          setPageSize(size);
                          setCurrentPage(1);
                        }}
                        className="text-xs"
                      >
                        {size}
                      </Button>
                    ))}
                  </div>

                  {/* Page navigation */}
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.max(1, prev - 1))
                      }
                      disabled={currentPage === 1}
                    >
                      Previous
                    </Button>

                    <span className="text-sm text-muted-foreground">
                      {currentPage} of {totalPages}
                    </span>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                      }
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <footer className="w-full py-8 mt-auto text-center text-md text-muted-foreground">
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-row items-center gap-2">
            <span className="font-medium text-foreground">Arcaea Charts</span>
            <a
              href="https://ko-fi.com/S6S41JCXEZ"
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-80 hover:opacity-100 transition-opacity"
              aria-label="Support on Ko-fi"
            >
              <img
                src="https://storage.ko-fi.com/cdn/kofi5.png?v=6"
                alt="Buy Me a Coffee at ko-fi.com"
                className="border-0 h-8"
              />
            </a>
          </div>
          <p className="text-sm max-w-xs">
            Made for the Arcaea community
          </p>
          <p className="text-xs opacity-75">
            Song data from Arcaea © lowiro · {new Date().getFullYear()}
          </p>
        </div>
      </footer>

      {/* Video Overlay */}
      <VideoOverlay
        videoId={selectedVideo || ""}
        isOpen={!!selectedVideo}
        onClose={() => setSelectedVideo(null)}
      />
    </div>
  );
};

export default Index;
