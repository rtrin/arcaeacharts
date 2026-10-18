import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PlaybackRangeTimeline } from "@/components/PlaybackRangeTimeline";
import { usePlaybackRange } from "@/hooks/usePlaybackRange";
import ReactPlayer from "react-player";

interface VideoOverlayProps {
  videoId: string;
  isOpen: boolean;
  onClose: () => void;
}

export const VideoOverlay = ({ videoId, isOpen, onClose }: VideoOverlayProps) => {
  const playerRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSlider, setShowSlider] = useState(true);
  const onTimeChange = useCallback((time: number) => setCurrentTime(time), []);
  const { range, enabled, setEndpoint, seek, handleEnded } = usePlaybackRange({
    playerRef,
    duration,
    videoId,
    isOpen,
    isPlaying,
    currentTime,
    onTimeChange,
  });

  useEffect(() => {
    const checkMobile = () => {
      const mobile = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(navigator.userAgent.toLowerCase());
      setIsMobile(mobile);
      if (!mobile) setIsPlaying(true);
    };
    checkMobile();
  }, []);

  useEffect(() => {
    setCurrentTime(0);
    setDuration(0);
  }, [videoId, isOpen]);

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

  useEffect(() => {
    if (!isOpen) return;
    const updateDuration = () => {
      const player = playerRef.current;
      if (!player) return;
      if (Number.isFinite(player.duration) && player.duration > 0) {
        setDuration(player.duration);
      }
    };

    updateDuration();
    const interval = window.setInterval(() => {
      updateDuration();
    }, 500);
    return () => window.clearInterval(interval);
  }, [isOpen, videoId]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.floor(seconds % 60);
    return `${minutes}:${remainder.toString().padStart(2, "0")}`;
  };

  const handlePlayPause = () => {
    if (!isPlaying && enabled && (currentTime < range[0] || currentTime >= range[1])) seek(range[0]);
    setIsPlaying(previous => !previous);
  };

  const handleRewind = () => seek(currentTime - 10 * playbackRate);
  const handleForward = () => seek(currentTime + 10 * playbackRate);
  const handleClose = () => {
    setCurrentTime(0);
    setDuration(0);
    setPlaybackRate(1);
    setIsPlaying(false);
    setShowSlider(true);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 z-50 bg-black ${isMobile ? "transform rotate-90 origin-center" : ""}`}
      style={isMobile ? {
        width: "100vh",
        height: "100vw",
        left: "calc((100vw - 100vh) / 2)",
        top: "calc((100vh - 100vw) / 2)",
      } : {}}
    >
      <div className="absolute inset-0 pointer-events-none">
        <ReactPlayer
          key={videoId}
          ref={playerRef}
          src={`https://www.youtube.com/watch?v=${videoId}`}
          width="100%"
          height="100%"
          playing={isPlaying}
          playbackRate={playbackRate}
          controls={false}
          onEnded={handleEnded}
          style={{ pointerEvents: "none" }}
        />
        <div
          className="absolute inset-0 z-10 bg-transparent"
          style={{ touchAction: "none", userSelect: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", pointerEvents: "auto" }}
          onTouchStart={event => event.preventDefault()}
          onTouchMove={event => event.preventDefault()}
          onTouchEnd={event => event.preventDefault()}
          onMouseDown={event => event.preventDefault()}
          onClick={event => event.preventDefault()}
        />
      </div>

      <div className="absolute top-4 right-4 z-50">
        <Button onClick={handleClose} variant="secondary" size="sm" className={`bg-red-600/70 hover:bg-red-700/90 text-white border border-red-400/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>
          ✕
        </Button>
      </div>

      <div className={`absolute top-4 left-4 flex z-50 ${isMobile ? "gap-1 items-center" : "gap-2"}`}>
        <Button onClick={handleRewind} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>
          -{(10 * playbackRate).toFixed(1)}s
        </Button>
        <Button variant="secondary" size="sm" className={`bg-black/70 text-white border border-white/20 pointer-events-none ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>
          {formatTime(currentTime)}
        </Button>
        <Button onClick={handleForward} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>
          +{(10 * playbackRate).toFixed(1)}s
        </Button>
        <Button onClick={handlePlayPause} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"}`}>
          {isPlaying ? "Pause" : "Play"}
        </Button>
        <Button onClick={() => setShowSlider(value => !value)} variant="secondary" size="sm" className={`bg-blue-600/70 hover:bg-blue-700/90 text-white border border-blue-400/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>
          {showSlider ? "Hide" : "Show"}
        </Button>
      </div>

      <div className={`absolute top-4 right-16 flex z-50 ${isMobile ? "gap-1 items-center" : "gap-2"}`}>
        <Button onClick={() => setPlaybackRate(value => Math.max(0.25, value - 0.25))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>-0.25</Button>
        <Button onClick={() => setPlaybackRate(value => Math.max(0.25, value - 0.05))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>-0.05</Button>
        <Button variant="secondary" size="sm" className={`bg-black/70 text-white border border-white/20 pointer-events-none ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : "px-4"}`}>{playbackRate.toFixed(2)}x</Button>
        <Button onClick={() => setPlaybackRate(value => Math.min(2, value + 0.05))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>+0.05</Button>
        <Button onClick={() => setPlaybackRate(value => Math.min(2, value + 0.25))} variant="secondary" size="sm" className={`bg-black/70 hover:bg-black/90 text-white border border-white/20 ${isMobile ? "text-xs px-2 py-1 min-h-0 h-6" : ""}`}>+0.25</Button>
      </div>

      {showSlider && (
        <div className="absolute bottom-6 left-8 right-8 z-50">
          <div className="flex items-center gap-4">
            <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">{formatTime(currentTime)}</span>
            <div className="flex-1 bg-black/30 p-2 rounded-lg backdrop-blur-sm">
              <PlaybackRangeTimeline duration={duration} range={range} current={currentTime} mobile={isMobile} enabled={enabled} setEndpoint={setEndpoint} seek={seek} />
            </div>
            <span className="text-white text-sm font-mono bg-black/50 px-2 py-1 rounded">{formatTime(duration)}</span>
          </div>
        </div>
      )}
    </div>
  );
};
