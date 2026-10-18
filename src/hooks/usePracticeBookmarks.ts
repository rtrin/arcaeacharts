import { useCallback, useEffect, useMemo, useState } from "react";
import {
  matchesBookmarkScope,
  PRACTICE_BOOKMARKS_STORAGE_KEY,
  readStoredBookmarks,
  sortBookmarks,
  updateStoredBookmarks,
  type BookmarkScope,
  type PracticeBookmark,
} from "@/lib/practice-bookmarks";

export function usePracticeBookmarks(scope: BookmarkScope) {
  const [allBookmarks, setAllBookmarks] = useState<PracticeBookmark[]>([]);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const refresh = useCallback(() => {
    try {
      const result = readStoredBookmarks(window.localStorage);
      if (result.ok) {
        setAllBookmarks(result.bookmarks);
        setStorageError(null);
      } else {
        setStorageError(result.message);
      }
      setHasLoaded(true);
    } catch {
      setStorageError("Browser storage is unavailable; bookmarks could not be loaded.");
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === PRACTICE_BOOKMARKS_STORAGE_KEY || event.key === null) refresh();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [refresh]);

  const mutate = useCallback((update: (current: PracticeBookmark[]) => PracticeBookmark[]) => {
    try {
      const updated = updateStoredBookmarks(window.localStorage, update);
      setAllBookmarks(updated);
      setStorageError(null);
      return true;
    } catch (error) {
      setStorageError(error instanceof Error ? error.message : "Bookmarks could not be saved.");
      return false;
    }
  }, []);

  const bookmarks = useMemo(
    () => sortBookmarks(allBookmarks.filter((bookmark) => matchesBookmarkScope(bookmark, scope))),
    [allBookmarks, scope],
  );

  return { bookmarks, storageError, hasLoaded, mutate };
}
