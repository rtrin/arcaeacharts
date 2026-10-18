import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import ReactPlayer from "react-player";
import { PracticeBookmarksPanel } from "@/components/PracticeBookmarksPanel";
import { usePracticeLoop } from "@/hooks/usePracticeLoop";
import { usePracticeBookmarks } from "@/hooks/usePracticeBookmarks";
import {
  getCurrentPlayerDuration,
  getFinitePlayerDuration,
  type BookmarkScope,
  type PlayerIdentity,
  type PlayerReadiness,
  type PracticeBookmark,
} from "@/lib/practice-bookmarks";

interface VideoOverlayProps {
  videoId: string;
  bookmarkScopeKey: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoOverlay = ({
  videoId,
  bookmarkScopeKey,
  isOpen,
  onClose,
}: VideoOverlayProps) => {
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
  const [videoWidth, setVideoWidth] = useState(640);
  const bookmarkContextKey = `${bookmarkScopeKey}\u0000${videoId}`;
  const currentPlayerDuration = getCurrentPlayerDuration(bookmarkContextKey, playerContextRef.current, playerReadiness);
  const isPlayerReady = currentPlayerDuration > 0;
  const attachPlayer = useCallback((player: HTMLVideoElement | null) => {
    if (playerRef.current === player) return;
    playerRef.current = player;
    if (player) {
      playerContextRef.current = { contextKey: bookmarkContextKey, generation: ++playerGenerationRef.current };
    } else {
      playerContextRef.current = null;
    }
  }, [bookmarkContextKey]);
  const bookmarkScope = useMemo<BookmarkScope>(() => ({ scopeKey: bookmarkScopeKey, videoId }), [bookmarkScopeKey, videoId]);
  const bookmarkStore = usePracticeBookmarks(bookmarkScope);
  const practiceLoop = usePracticeLoop({
    playerRef,
    contextKey: bookmarkContextKey,
    isOpen,
    isReady: isPlayerReady,
    isPlaying,
    storedBookmarks: bookmarkStore.bookmarks,
    bookmarksLoaded: bookmarkStore.hasLoaded,
    onTimeChange: setCurrentTime,
  });
  const stageRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ id: number; x: number; width: number } | null>(null);
  const clampVideoWidth = useCallback((width: number) => {
    const stage = stageRef.current;
    if (!stage) return width;
    const maxWidth = Math.max(1, Math.min(stage.clientWidth - 16, (stage.clientHeight - 104) * 16 / 9));
    const minWidth = Math.min(240, maxWidth);
    return Math.min(Math.max(minWidth, width), maxWidth);
  }, []);
  const finishResize = (pointerId: number) => {
    if (dragRef.current?.id === pointerId) dragRef.current = null;
  };
  const syncStageSize = useCallback(() => setVideoWidth((width) => clampVideoWidth(width)), [clampVideoWidth]);
  const resizeKey = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (!["ArrowRight", "ArrowUp", "ArrowLeft", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const direction = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : -1;
    setVideoWidth((width) => clampVideoWidth(width + direction * step));
  };

  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/.test(
          userAgent
        );
      setIsMobile(isMobileDevice);

      if (!isMobileDevice) {
        setIsPlaying(true);
      }
    };

    checkMobile();
  }, []);

  useEffect(() => {
    if (!isOpen) { dragRef.current = null; return; }
    const frame = requestAnimationFrame(() => setVideoWidth(clampVideoWidth(640)));
    const observer = stageRef.current && typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(syncStageSize)
      : null;
    if (stageRef.current) observer?.observe(stageRef.current);
    window.addEventListener("resize", syncStageSize);
    window.addEventListener("orientationchange", syncStageSize);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", syncStageSize);
      window.removeEventListener("orientationchange", syncStageSize);
      dragRef.current = null;
    };
  }, [isOpen, clampVideoWidth, syncStageSize]);

  useEffect(() => {
    if (isOpen) {
      // Prevent scrolling and mobile gestures
      document.body.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.height = "100%";

      // Prevent touch events and gestures only outside of buttons
      const preventTouch = (e: TouchEvent) => {
        const target = e.target as HTMLElement;
        // Allow touches on buttons and elements with data-allow-click
        if (target.closest("button") || target.closest("[data-allow-click]")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      };

      const preventGestures = (e: Event) => {
        const target = e.target as HTMLElement;
        // Allow gestures on buttons and elements with data-allow-click
        if (target.closest("button") || target.closest("[data-allow-click]")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      };

      const preventMouse = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        // Allow clicks on buttons and elements with data-allow-click
        if (target.closest("button") || target.closest("[data-allow-click]")) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
      };

      // Add event listeners
      document.addEventListener("touchstart", preventTouch, { passive: false });
      document.addEventListener("touchmove", preventTouch, { passive: false });
      document.addEventListener("touchend", preventTouch, { passive: false });
      document.addEventListener("touchcancel", preventTouch, {
        passive: false,
      });
      document.addEventListener("gesturestart", preventGestures, {
        passive: false,
      });
      document.addEventListener("gesturechange", preventGestures, {
        passive: false,
      });
      document.addEventListener("gestureend", preventGestures, {
        passive: false,
      });
      document.addEventListener("click", preventMouse, { passive: false });
      document.addEventListener("mousedown", preventMouse, { passive: false });
      document.addEventListener("mouseup", preventMouse, { passive: false });

      return () => {
        // Restore scroll and body styles
        document.body.style.overflow = "";
        document.body.style.position = "";
        document.body.style.width = "";
        document.body.style.height = "";

        // Remove event listeners
        document.removeEventListener("touchstart", preventTouch);
        document.removeEventListener("touchmove", preventTouch);
        document.removeEventListener("touchend", preventTouch);
        document.removeEventListener("touchcancel", preventTouch);
        document.removeEventListener("gesturestart", preventGestures);
        document.removeEventListener("gesturechange", preventGestures);
        document.removeEventListener("gestureend", preventGestures);
        document.removeEventListener("click", preventMouse);
        document.removeEventListener("mousedown", preventMouse);
        document.removeEventListener("mouseup", preventMouse);
      };
    }
  }, [isOpen]);

  const sampleCurrentPlayer = useCallback((event?: React.SyntheticEvent<HTMLVideoElement>) => {
    const player = playerRef.current;
    const attachedPlayer = playerContextRef.current;
    if (
      !isOpen || !player || !attachedPlayer || attachedPlayer.contextKey !== bookmarkContextKey ||
      (event && event.currentTarget !== player)
    ) return;

    if (Number.isFinite(player.currentTime)) setCurrentTime(player.currentTime);
    const duration = getFinitePlayerDuration(bookmarkContextKey, attachedPlayer.contextKey, player.duration);
    if (duration === null) {
      setPlayerReadiness((current) =>
        current?.contextKey === attachedPlayer.contextKey && current.generation === attachedPlayer.generation
          ? null
          : current,
      );
      return;
    }
    setPlayerReadiness((current) =>
      current?.contextKey === attachedPlayer.contextKey &&
      current.generation === attachedPlayer.generation && current.duration === duration
        ? current
        : { ...attachedPlayer, duration },
    );
  }, [bookmarkContextKey, isOpen]);

  // Metadata events speed up readiness; polling handles deferred YouTube callbacks and mobile startup.
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

  if (!isOpen) return null;

  const handlePlayPause = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleRewind = () => {
    const seekTime = 10 * playbackRate;
    const newTime = Math.max(0, currentTime - seekTime);
    practiceLoop.manualSeek(newTime);
  };

  const handleForward = () => {
    const seekTime = 10 * playbackRate;
    const newTime = currentTime + seekTime;
    practiceLoop.manualSeek(newTime);
  };

  const handleSpeedDecrease25 = () => {
    const newRate = Math.max(0.25, playbackRate - 0.25);
    setPlaybackRate(newRate);
  };

  const handleSpeedDecrease05 = () => {
    const newRate = Math.max(0.25, playbackRate - 0.05);
    setPlaybackRate(newRate);
  };

  const handleSpeedIncrease05 = () => {
    const newRate = Math.min(2, playbackRate + 0.05);
    setPlaybackRate(newRate);
  };

  const handleSpeedIncrease25 = () => {
    const newRate = Math.min(2, playbackRate + 0.25);
    setPlaybackRate(newRate);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleClose = () => {
    setCurrentTime(0);
    setPlayerReadiness(null);
    setShowPracticeBookmarks(true);
    setPlaybackRate(1);
    setIsPlaying(false);
    setShowSlider(true);
    onClose();
  };

  const handleSliderChange = (value: number[]) => {
    const newTime = value[0];
    practiceLoop.manualSeek(newTime);
  };

  const getPlayerTime = () => {
    if (!isPlayerReady || playerContextRef.current?.contextKey !== bookmarkContextKey) return null;
    const time = playerRef.current?.currentTime;
    return typeof time === "number" && Number.isFinite(time) ? time : null;
  };

  const getPlayerDuration = () => {
    if (!isPlayerReady || playerContextRef.current?.contextKey !== bookmarkContextKey) return null;
    const currentDuration = playerRef.current?.duration;
    return typeof currentDuration === "number" && Number.isFinite(currentDuration) && currentDuration > 0
      ? currentDuration
      : null;
  };

  const selectPracticeBookmark = (bookmark: PracticeBookmark) => {
    practiceLoop.seekToBookmark(bookmark);
  };

  const dismissPracticeBookmarks = () => {
    setShowPracticeBookmarks(false);
    window.requestAnimationFrame(() => bookmarkButtonRef.current?.focus());
  };

  const togglePracticeBookmarks = () => {
    if (showPracticeBookmarks) {
      dismissPracticeBookmarks();
      return;
    }
    setShowPracticeBookmarks(true);
    window.requestAnimationFrame(() => document.getElementById("practice-bookmarks-panel")?.querySelector("button")?.focus());
  };

  const toggleSlider = () => {
    setShowSlider((prev) => !prev);
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black ${
        isMobile ? "transform rotate-90 origin-center" : ""
      }`}
      style={
        isMobile
          ? {
              width: "100vh",
              height: "100vw",
              left: "calc((100vw - 100vh) / 2)",
              top: "calc((100vh - 100vw) / 2)",
            }
          : {}
      }
    >
      {/* Video player */}
      <div ref={stageRef} className="absolute inset-0 pointer-events-none">
      <div className="relative pointer-events-auto overflow-visible" style={{ width: videoWidth, maxWidth: "100%", aspectRatio: "16 / 9" }}>
        <ReactPlayer
          key={bookmarkContextKey}
          ref={attachPlayer}
          src={`https://www.youtube.com/watch?v=${videoId}`}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={playbackRate}
          controls={false}
          onLoadedMetadata={sampleCurrentPlayer}
          onDurationChange={sampleCurrentPlayer}
          onEnded={practiceLoop.handleEnded}
          style={{ pointerEvents: "none" }}
        />

        {/* Transparent overlay to block all interactions with video only */}
        <div
          className="absolute inset-0 bg-transparent z-10"
          style={{
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
            WebkitTouchCallout: "none",
            pointerEvents: "auto",
          }}
          onTouchStart={(e) => e.preventDefault()}
          onTouchMove={(e) => e.preventDefault()}
          onTouchEnd={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => e.preventDefault()}
        />
      <button type="button" aria-label={`Resize video, ${videoWidth} pixels wide`} title="Drag or use arrow keys to resize" onKeyDown={resizeKey}
        onPointerDown={(e) => {
          if (!e.isPrimary || (e.pointerType === "mouse" && e.button !== 0)) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          dragRef.current = { id: e.pointerId, x: isMobile ? e.clientY : e.clientX, width: videoWidth };
        }}
        onPointerMove={(e) => {
          const drag = dragRef.current;
          if (!drag || drag.id !== e.pointerId) return;
          const coordinate = isMobile ? e.clientY : e.clientX;
          setVideoWidth(clampVideoWidth(drag.width + coordinate - drag.x));
        }}
        onPointerUp={(e) => finishResize(e.pointerId)} onPointerCancel={(e) => finishResize(e.pointerId)} onLostPointerCapture={(e) => finishResize(e.pointerId)}
        className="pointer-events-auto absolute -bottom-12 right-0 z-[60] h-11 w-11 cursor-nwse-resize touch-none rounded bg-white/20 text-white ring-1 ring-white/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">↘</button>
      </div>


            </div>

      {showPracticeBookmarks && (
        <PracticeBookmarksPanel
          key={bookmarkContextKey}
          scope={{ scopeKey: bookmarkScopeKey, videoId }}
          isPlayerReady={isPlayerReady}
          onGetCurrentTime={getPlayerTime}
          onGetDuration={getPlayerDuration}
          activeRangeId={practiceLoop.activeRangeId}
          loopEnabled={practiceLoop.loopEnabled}
          onSelect={selectPracticeBookmark}
          onToggleLoop={practiceLoop.toggleLoop}
          onClearRange={practiceLoop.clearRange}
          onDismiss={dismissPracticeBookmarks}
          bookmarks={bookmarkStore.bookmarks}
          storageError={bookmarkStore.storageError}
          mutate={bookmarkStore.mutate}
        />
      )}

      {/* Close button */}
      <div className="absolute top-4 right-4 z-50">
        <Button
          onClick={handleClose}
          variant="secondary"
          size="sm"
          className={`bg-red-600/70 hover:bg-red-700/90 text-white border border-red-400/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          ✕
        </Button>
      </div>

      {/* Playback controls - top left */}
      <div
        className={`absolute top-4 left-4 flex z-50 ${
          isMobile ? "gap-1 items-center" : "gap-2"
        }`}
      >
        <Button
          onClick={handleRewind}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          -{(10 * playbackRate).toFixed(1)}s
        </Button>

        {/* Time display - read-only */}
        <Button
          variant="secondary"
          size="sm"
          className={`bg-black/70 text-white border border-white/20 pointer-events-none ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          {formatTime(currentTime)}
        </Button>

        <Button
          onClick={handleForward}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          +{(10 * playbackRate).toFixed(1)}s
        </Button>

        <Button
          ref={bookmarkButtonRef}
          aria-expanded={showPracticeBookmarks}
          aria-controls="practice-bookmarks-panel"
          onClick={togglePracticeBookmarks}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          Bookmarks
        </Button>

        <Button
          onClick={handlePlayPause}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"
          }`}
        >
          {isPlaying ? "Pause" : "Play"}
        </Button>

        <Button
          onClick={toggleSlider}
          variant="secondary"
          size="sm"
          className={`bg-blue-600/70 hover:bg-blue-700/90 text-white border border-blue-400/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          {showSlider ? "Hide" : "Show"}
        </Button>
      </div>

      {/* Speed controls - top right */}
      <div
        className={`absolute top-4 right-16 flex z-50 ${
          isMobile ? "gap-1 items-center" : "gap-2"
        }`}
      >
        <Button
          onClick={handleSpeedDecrease25}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          -0.25
        </Button>

        <Button
          onClick={handleSpeedDecrease05}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          -0.05
        </Button>

        {/* Speed display - non-interactive */}
        <Button
          variant="secondary"
          size="sm"
          className={`bg-black/70 text-white border border-white/20 pointer-events-none ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"
          }`}
        >
          {playbackRate.toFixed(2)}x
        </Button>

        <Button
          onClick={handleSpeedIncrease05}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          +0.05
        </Button>

        <Button
          onClick={handleSpeedIncrease25}
          variant="secondary"
          size="sm"
          className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${
            isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""
          }`}
        >
          +0.25
        </Button>
      </div>

      {/* Time slider - bottom center */}
      {showSlider && (
        <div className="absolute bottom-6 left-8 right-8 z-50">
          <div className="flex items-center gap-4">
            <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">
              {formatTime(currentTime)}
            </span>
            <div className="flex-1 bg-black/30 p-2 rounded-lg backdrop-blur-sm">
              <Slider
                value={[currentTime]}
                onValueChange={handleSliderChange}
                min={0}
                max={currentPlayerDuration || 100}
                step={1}
                aria-label="Video timeline"
                className="w-full"
              />
            </div>
            <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">
              {formatTime(currentPlayerDuration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
