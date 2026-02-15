
import { useState, useMemo, useEffect } from 'react';
import type { Song } from "@/lib/supabase";

export type SortField = "title" | "artist" | "constant";
export type SortOrder = "asc" | "desc";
export type SearchField = "title" | "artist" | "constant" | "version";

export const useSongFilter = (allSongs: Song[]) => {
  const [query, setQuery] = useState("");
  const [difficultyRange, setDifficultyRange] = useState<[number, number]>([1, 12]);
  const [debouncedDifficultyRange, setDebouncedDifficultyRange] = useState<[number, number]>([1, 12]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<string[]>([]);
  
  const [searchFields, setSearchFields] = useState<Array<SearchField>>([
    "title", "artist", "constant", "version",
  ]);

  const [sortBy, setSortBy] = useState<SortField>("constant");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Debounce difficulty range
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedDifficultyRange(difficultyRange);
    }, 150);
    return () => clearTimeout(timer);
  }, [difficultyRange]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [query, debouncedDifficultyRange, selectedDifficulties]);


  const processedSongs = useMemo(() => {
    return allSongs.map((song) => ({
      ...song,
      searchText: `${song.title} ${song.artist} ${song.constant} ${song.level}`.toLowerCase(),
    }));
  }, [allSongs]);

  const filteredSongs = useMemo(() => {
    const [min, max] = debouncedDifficultyRange;
    const q = query.toLowerCase().trim();

    return processedSongs.filter((s) => {
      const fieldMatch = !q || (() => {
        const checks: boolean[] = [];
        if (searchFields.includes("title")) checks.push(s.title.toLowerCase().includes(q));
        if (searchFields.includes("artist")) checks.push(s.artist.toLowerCase().includes(q));
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
      const difficultyMatch = selectedDifficulties.length === 0 || selectedDifficulties.includes(s.difficulty);
      
      return fieldMatch && inRange && difficultyMatch;
    });
  }, [query, debouncedDifficultyRange, selectedDifficulties, processedSongs, searchFields]);

  const sortedSongs = useMemo(() => {
    return [...filteredSongs].sort((a, b) => {
      let aValue: string | number | null;
      let bValue: string | number | null;

      switch (sortBy) {
        case "constant":
          aValue = a.constant;
          bValue = b.constant;
          break;
        case "title":
          aValue = a.title.toLowerCase();
          bValue = b.title.toLowerCase();
          break;
        case "artist":
          aValue = a.artist.toLowerCase();
          bValue = b.artist.toLowerCase();
          break;
        default:
          aValue = String(a[sortBy]).toLowerCase();
          bValue = String(b[sortBy]).toLowerCase();
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
  }, [filteredSongs, sortBy, sortOrder]);

  const paginatedSongs = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return sortedSongs.slice(startIndex, startIndex + pageSize);
  }, [sortedSongs, currentPage, pageSize]);

  const totalPages = Math.ceil(filteredSongs.length / pageSize);

  return {
    // State
    query, setQuery,
    difficultyRange, setDifficultyRange,
    selectedDifficulties, setSelectedDifficulties,
    searchFields, setSearchFields,
    sortBy, setSortBy,
    sortOrder, setSortOrder,
    currentPage, setCurrentPage,
    pageSize, setPageSize,

    // Derived
    filteredSongs,
    sortedSongs,
    paginatedSongs,
    totalPages,
  };
};
