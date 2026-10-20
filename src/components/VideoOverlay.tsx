import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { PlaybackRangeTimeline } from "@/components/PlaybackRangeTimeline";
import { PracticeBookmarksPanel } from "@/components/PracticeBookmarksPanel";
import { usePlaybackRange } from "@/hooks/usePlaybackRange";
import { usePracticeBookmarks } from "@/hooks/usePracticeBookmarks";
import ReactPlayer from "react-player";
import {
  getCurrentPlayerDuration,
  getFinitePlayerDuration,
  isSamePersistedPracticeRange,
  type BookmarkScope,
  type PlayerIdentity,
  type PlayerReadiness,
} from "@/lib/practice-bookmarks";

interface VideoOverlayProps {
  videoId: string;
  bookmarkScopeKey: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoOverlay = ({ videoId, bookmarkScopeKey, isOpen, onClose }: VideoOverlayProps) => {
  const playerRef = useRef<HTMLVideoElement>(null);
  const playerGenerationRef = useRef(0);
  const playerContextRef = useRef<PlayerIdentity | null>(null);
  const bookmarkButtonRef = useRef<HTMLButtonElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playerReadiness, setPlayerReadiness] = useState<PlayerReadiness | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSlider, setShowSlider] = useState(true);
  const [showPracticeBookmarks, setShowPracticeBookmarks] = useState(true);
  const bookmarkContextKey = `${bookmarkScopeKey}\u0000${videoId}`;
  const currentDuration = getCurrentPlayerDuration(bookmarkContextKey, playerContextRef.current, playerReadiness);
  const isPlayerReady = currentDuration > 0;
  const attachPlayer = useCallback((player: HTMLVideoElement | null) => {
    if (playerRef.current === player) return;
    playerRef.current = player;
    playerContextRef.current = player
      ? { contextKey: bookmarkContextKey, generation: ++playerGenerationRef.current }
      : null;
  }, [bookmarkContextKey]);
  const bookmarkScope = useMemo<BookmarkScope>(() => ({ scopeKey: bookmarkScopeKey, videoId }), [bookmarkScopeKey, videoId]);
  const bookmarkStore = usePracticeBookmarks(bookmarkScope);
  const onTimeChange = useCallback((time: number) => setCurrentTime(time), []);
  const practiceRange = usePlaybackRange({
    playerRef,
    duration: currentDuration,
    videoId: bookmarkContextKey,
    isOpen,
    isPlaying,
    isReady: isPlayerReady,
    currentTime,
    onTimeChange,
  });
  const { activeRangeBookmark, clearRange } = practiceRange;

  useEffect(() => {
    const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
    setIsMobile(mobile);
    if (!mobile) setIsPlaying(true);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.width = "100%";
    document.body.style.height = "100%";
    const preventOutsideInteraction = (event: Event) => {
      const target = event.target as HTMLElement;
      if (target.closest("button") || target.closest("[data-allow-click]")) return;
      event.preventDefault();
      event.stopPropagation();
    };
    const eventNames = ["touchstart", "touchmove", "touchend", "touchcancel", "gesturestart", "gesturechange", "gestureend", "click", "mousedown", "mouseup"];
    eventNames.forEach(name => document.addEventListener(name, preventOutsideInteraction, { passive: false }));
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.width = "";
      document.body.style.height = "";
      eventNames.forEach(name => document.removeEventListener(name, preventOutsideInteraction));
    };
  }, [isOpen]);

  const sampleCurrentPlayer = useCallback((event?: SyntheticEvent<HTMLVideoElement>) => {
    const player = playerRef.current;
    const attachedPlayer = playerContextRef.current;
    if (!isOpen || !player || !attachedPlayer || attachedPlayer.contextKey !== bookmarkContextKey || (event && event.currentTarget !== player)) return;
    if (Number.isFinite(player.currentTime)) setCurrentTime(player.currentTime);
    const duration = getFinitePlayerDuration(bookmarkContextKey, attachedPlayer.contextKey, player.duration);
    if (duration === null) {
      setPlayerReadiness(current => current?.contextKey === attachedPlayer.contextKey && current.generation === attachedPlayer.generation ? null : current);
      return;
    }
    setPlayerReadiness(current => current?.contextKey === attachedPlayer.contextKey && current.generation === attachedPlayer.generation && current.duration === duration
      ? current : { ...attachedPlayer, duration });
  }, [bookmarkContextKey, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    sampleCurrentPlayer();
    const interval = window.setInterval(sampleCurrentPlayer, 250);
    return () => window.clearInterval(interval);
  }, [isOpen, sampleCurrentPlayer]);

  useEffect(() => {
    setCurrentTime(0);
    setShowPracticeBookmarks(true);
  }, [bookmarkContextKey]);

  useEffect(() => {
    const selected = activeRangeBookmark;
    if (!selected || !bookmarkStore.hasLoaded) return;
    const stored = bookmarkStore.bookmarks.find(bookmark => bookmark.id === selected.id);
    if (!isSamePersistedPracticeRange(selected, stored)) clearRange();
  }, [bookmarkStore.bookmarks, bookmarkStore.hasLoaded, activeRangeBookmark, clearRange]);

  if (!isOpen) return null;

  const handlePlayPause = () => {
    if (!isPlaying && practiceRange.enabled && (currentTime < practiceRange.range[0] || currentTime >= practiceRange.range[1])) practiceRange.seek(practiceRange.range[0]);
    setIsPlaying(playing => !playing);
  };
  const handleRewind = () => practiceRange.seek(currentTime - 10 * playbackRate);
  const handleForward = () => practiceRange.seek(currentTime + 10 * playbackRate);
  const handleClose = () => {
    setCurrentTime(0);
    setPlayerReadiness(null);
    setShowPracticeBookmarks(true);
    setPlaybackRate(1);
    setIsPlaying(false);
    setShowSlider(true);
    onClose();
  };
  const dismissPracticeBookmarks = () => {
    setShowPracticeBookmarks(false);
    window.requestAnimationFrame(() => bookmarkButtonRef.current?.focus());
  };
  const togglePracticeBookmarks = () => {
    if (showPracticeBookmarks) dismissPracticeBookmarks();
    else {
      setShowPracticeBookmarks(true);
      window.requestAnimationFrame(() => document.getElementById("practice-bookmarks-panel")?.querySelector("button")?.focus());
    }
  };
  const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
  const getPlayerTime = () => isPlayerReady && playerContextRef.current?.contextKey === bookmarkContextKey && Number.isFinite(playerRef.current?.currentTime)
    ? playerRef.current!.currentTime : null;
  const getPlayerDuration = () => isPlayerReady && playerContextRef.current?.contextKey === bookmarkContextKey ? currentDuration : null;

  return <div className={`fixed inset-0 z-50 bg-black ${isMobile ? "transform rotate-90 origin-center" : ""}`} style={isMobile ? { width: "100vh", height: "100vw", left: "calc((100vw - 100vh) / 2)", top: "calc((100vh - 100vw) / 2)" } : {}}>
    <div className="relative w-full h-full">
        <ReactPlayer
          key={bookmarkContextKey}
          ref={attachPlayer}
          src={`https://www.youtube.com/watch?v=${videoId}`}
          width="100%" height="100%" playing={isPlaying} playbackRate={playbackRate} controls={false}
          onReady={sampleCurrentPlayer} onLoadedMetadata={sampleCurrentPlayer} onDurationChange={sampleCurrentPlayer}
          onEnded={practiceRange.handleEnded} style={{ pointerEvents: "none" }}
        />
        <div className="absolute inset-0 z-10 bg-transparent" style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", pointerEvents: "auto" }}
          onTouchStart={event => event.preventDefault()} onTouchMove={event => event.preventDefault()} onTouchEnd={event => event.preventDefault()}
          onMouseDown={event => event.preventDefault()} onClick={event => event.preventDefault()} />
    </div>

    {showPracticeBookmarks && <PracticeBookmarksPanel
      key={bookmarkContextKey} scope={bookmarkScope} isPlayerReady={isPlayerReady}
      onGetCurrentTime={getPlayerTime} onGetDuration={getPlayerDuration}
      activeRangeId={practiceRange.activeRangeId} hasSelectedRange={practiceRange.rangeSelected}
      loopEnabled={practiceRange.loopEnabled} onSelect={practiceRange.selectBookmark}
      onToggleLoop={practiceRange.toggleLoop} onClearRange={practiceRange.clearRange} onDismiss={dismissPracticeBookmarks}
      bookmarks={bookmarkStore.bookmarks} storageError={bookmarkStore.storageError} mutate={bookmarkStore.mutate}
    />}

    <div className="absolute top-4 right-4 z-50"><Button onClick={handleClose} variant="secondary" size="sm" className={`bg-red-600/70 hover:bg-red-700/90 text-white border border-red-400/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>✕</Button></div>
    <div className={`absolute top-4 left-4 flex z-50 ${isMobile ? "gap-1 items-center" : "gap-2"}`}>
      <Button onClick={handleRewind} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>-{(10 * playbackRate).toFixed(1)}s</Button>
      <Button variant="secondary" size="sm" className={`bg-black/70 text-white border border-white/20 pointer-events-none ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>{formatTime(currentTime)}</Button>
      <Button onClick={handleForward} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>+{(10 * playbackRate).toFixed(1)}s</Button>
      <Button ref={bookmarkButtonRef} aria-expanded={showPracticeBookmarks} aria-controls="practice-bookmarks-panel" onClick={togglePracticeBookmarks} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>Bookmarks</Button>
      <Button onClick={handlePlayPause} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"}`}>{isPlaying ? "Pause" : "Play"}</Button>
      <Button onClick={() => setShowSlider(value => !value)} variant="secondary" size="sm" className={`bg-blue-600/70 hover:bg-blue-700/90 text-white border border-blue-400/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>{showSlider ? "Hide" : "Show"}</Button>
    </div>
    <div className={`absolute top-4 right-16 flex z-50 ${isMobile ? "gap-1 items-center" : "gap-2"}`}>
      <Button onClick={() => setPlaybackRate(value => Math.max(0.25, value - 0.25))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>-0.25</Button>
      <Button onClick={() => setPlaybackRate(value => Math.max(0.25, value - 0.05))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>-0.05</Button>
      <Button variant="secondary" size="sm" className={`bg-black/70 text-white border border-white/20 pointer-events-none ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"}`}>{playbackRate.toFixed(2)}x</Button>
      <Button onClick={() => setPlaybackRate(value => Math.min(2, value + 0.05))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>+0.05</Button>
      <Button onClick={() => setPlaybackRate(value => Math.min(2, value + 0.25))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>+0.25</Button>
    </div>
    {showSlider && <div className="absolute bottom-6 left-8 right-8 z-50">
      <div className="flex items-center gap-4">
        <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">{formatTime(currentTime)}</span>
        <div className="flex-1 bg-black/30 p-2 rounded-lg backdrop-blur-sm">
          <PlaybackRangeTimeline duration={currentDuration} range={practiceRange.range} current={currentTime} mobile={isMobile} enabled={practiceRange.enabled} setEndpoint={practiceRange.setEndpoint} seek={practiceRange.seek} />
        </div>
        <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">{formatTime(currentDuration)}</span>
      </div>
    </div>}
  </div>;
};
