import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  hasReachedPracticeRangeEnd,
  isOutsidePracticeRange,
  isSamePersistedPracticeRange,
  type PracticeBookmark,
} from "@/lib/practice-bookmarks";

interface PracticeLoopOptions {
  playerRef: RefObject<HTMLVideoElement | null>;
  contextKey: string;
  isOpen: boolean;
  isReady: boolean;
  isPlaying: boolean;
  storedBookmarks: PracticeBookmark[];
  bookmarksLoaded: boolean;
  onTimeChange: (time: number) => void;
}

export function usePracticeLoop({
  playerRef,
  contextKey,
  isOpen,
  isReady,
  isPlaying,
  storedBookmarks,
  bookmarksLoaded,
  onTimeChange,
}: PracticeLoopOptions) {
  const [activeRange, setActiveRange] = useState<PracticeBookmark | null>(null);
  const [rangeContext, setRangeContext] = useState<string | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);
  const seekPending = useRef(false);
  const pendingTimeout = useRef<number | null>(null);
  const candidateRange = rangeContext === contextKey ? activeRange : null;
  const storedRange = candidateRange
    ? storedBookmarks.find((bookmark) => bookmark.id === candidateRange.id)
    : undefined;
  const currentRange = candidateRange && (
    !bookmarksLoaded || isSamePersistedPracticeRange(candidateRange, storedRange)
  ) ? candidateRange : null;

  const clearPendingSeek = useCallback(() => {
    seekPending.current = false;
    if (pendingTimeout.current !== null) window.clearTimeout(pendingTimeout.current);
    pendingTimeout.current = null;
  }, []);

  const clearRange = useCallback(() => {
    setActiveRange(null);
    setRangeContext(null);
    setLoopEnabled(false);
    clearPendingSeek();
  }, [clearPendingSeek]);

  useEffect(() => {
    clearRange();
  }, [clearRange, contextKey, isOpen]);

  useEffect(() => () => clearPendingSeek(), [clearPendingSeek]);

  useEffect(() => {
    if (bookmarksLoaded && candidateRange && !currentRange) clearRange();
  }, [bookmarksLoaded, candidateRange, clearRange, currentRange]);

  const seekToBookmark = useCallback((bookmark: PracticeBookmark) => {
    clearPendingSeek();
    if (bookmark.endSeconds === null) {
      clearRange();
    } else {
      setActiveRange(bookmark);
      setRangeContext(contextKey);
      setLoopEnabled(false);
    }
    if (playerRef.current) playerRef.current.currentTime = bookmark.startSeconds;
    onTimeChange(bookmark.startSeconds);
  }, [clearPendingSeek, clearRange, contextKey, onTimeChange, playerRef]);

  const manualSeek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;
    clearPendingSeek();
    if (playerRef.current) playerRef.current.currentTime = time;
    onTimeChange(time);
    if (currentRange && isOutsidePracticeRange(time, currentRange.startSeconds, currentRange.endSeconds!)) {
      clearRange();
    }
  }, [clearPendingSeek, clearRange, currentRange, onTimeChange, playerRef]);

  const toggleLoop = useCallback((enabled: boolean) => {
    setLoopEnabled(Boolean(enabled && currentRange));
    clearPendingSeek();
  }, [clearPendingSeek, currentRange]);

  const handleEnded = useCallback(() => {
    const player = playerRef.current;
    if (!isOpen || !isPlaying || !loopEnabled || !currentRange || !player) return;
    clearPendingSeek();
    seekPending.current = true;
    player.currentTime = currentRange.startSeconds;
    onTimeChange(currentRange.startSeconds);
    pendingTimeout.current = window.setTimeout(clearPendingSeek, 2000);
    void player.play().catch(() => undefined);
  }, [clearPendingSeek, currentRange, isOpen, isPlaying, loopEnabled, onTimeChange, playerRef]);

  useEffect(() => {
    if (!isOpen || !isReady || !isPlaying || !loopEnabled || !currentRange) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !Number.isFinite(player.currentTime)) return;
      const time = player.currentTime;
      onTimeChange(time);
      if (seekPending.current) {
        const returnThreshold = currentRange.endSeconds! - Math.min(0.25, (currentRange.endSeconds! - currentRange.startSeconds) / 2);
        if (time < returnThreshold) clearPendingSeek();
        return;
      }
      if (hasReachedPracticeRangeEnd(time, currentRange.endSeconds!)) {
        seekPending.current = true;
        player.currentTime = currentRange.startSeconds;
        onTimeChange(currentRange.startSeconds);
        pendingTimeout.current = window.setTimeout(clearPendingSeek, 2000);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, [clearPendingSeek, currentRange, isOpen, isPlaying, isReady, loopEnabled, onTimeChange, playerRef]);

  return {
    activeRange: currentRange,
    activeRangeId: currentRange?.id ?? null,
    loopEnabled: Boolean(currentRange && loopEnabled),
    seekToBookmark,
    manualSeek,
    toggleLoop,
    clearRange,
    handleEnded,
  };
}
