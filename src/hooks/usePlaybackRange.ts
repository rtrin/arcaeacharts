import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";

export type PlaybackRange = [number, number];
type PlayerClock = Pick<HTMLVideoElement, "currentTime" | "duration" | "play">;

interface PlaybackRangeOptions {
  playerRef: RefObject<PlayerClock | null>;
  duration: number;
  videoId: string;
  isOpen: boolean;
  isPlaying: boolean;
  isReady: boolean;
  currentTime: number;
  onTimeChange: (time: number) => void;
}

interface PendingSeek {
  from: number;
  target: number;
  startedAt: number;
}

const SEEK_TIMEOUT_MS = 1500;
const CLOCK_MOVEMENT_THRESHOLD = 0.08;

export function usePlaybackRange({
  playerRef,
  duration,
  videoId,
  isOpen,
  isPlaying,
  isReady,
  currentTime,
  onTimeChange,
}: PlaybackRangeOptions) {
  const [range, setRange] = useState<PlaybackRange>([0, 0]);
  const [enabled, setEnabled] = useState(false);
  const edited = useRef(false);
  const session = useRef("");
  const pending = useRef<PendingSeek | null>(null);
  const loopArmed = useRef(true);
  const playingRef = useRef(isPlaying);
  const currentTimeRef = useRef(currentTime);
  playingRef.current = isPlaying;
  currentTimeRef.current = currentTime;

  const issueSeek = useCallback((target: number) => {
    const player = playerRef.current;
    const clock = player?.currentTime;
    const from = Number.isFinite(clock) ? clock! : currentTimeRef.current;
    pending.current = { from, target, startedAt: Date.now() };
    onTimeChange(target);
    if (player) player.currentTime = target;
  }, [playerRef, onTimeChange]);

  const seek = useCallback((time: number) => {
    if (!Number.isFinite(time)) return;
    const target = enabled
      ? Math.max(range[0], Math.min(range[1], time))
      : Math.max(0, time);
    issueSeek(target);
  }, [enabled, range, issueSeek]);

  const setEndpoint = useCallback((endpoint: 0 | 1, value: number) => {
    if (!enabled || !Number.isFinite(value)) return;
    const gap = Math.min(0.25, duration / 2);
    const [start, end] = range;
    const next: PlaybackRange = endpoint === 0
      ? [Math.max(0, Math.min(value, end - gap)), end]
      : [start, Math.min(duration, Math.max(value, start + gap))];
    edited.current = true;
    setRange(next);

    const pendingTarget = pending.current?.target;
    if (pendingTarget !== undefined && pendingTarget >= next[0] && pendingTarget <= next[1]) return;
    const actualTime = playerRef.current?.currentTime;
    if ((pendingTarget !== undefined && (pendingTarget < next[0] || pendingTarget > next[1])) ||
      (Number.isFinite(actualTime) && (actualTime! < next[0] || actualTime! > next[1]))) {
      issueSeek(next[0]);
    }
  }, [duration, enabled, range, playerRef, issueSeek]);

  const handleEnded = useCallback(() => {
    if (!isOpen || !isReady || !enabled || !playingRef.current || range[1] <= range[0]) return;
    issueSeek(range[0]);
    const player = playerRef.current;
    if (player) void player.play().catch(() => undefined);
  }, [isOpen, isReady, enabled, range, issueSeek, playerRef]);

  useEffect(() => {
    const key = `${isOpen ? "open" : "closed"}:${videoId}`;
    if (session.current !== key) {
      session.current = key;
      edited.current = false;
      pending.current = null;
      loopArmed.current = true;
      setRange([0, 0]);
      setEnabled(false);
    }
    if (!isOpen || !isReady || !Number.isFinite(duration) || duration <= 0) {
      setEnabled(false);
      return;
    }

    const gap = Math.min(0.25, duration / 2);
    setRange(([start, end]) => edited.current
      ? [Math.max(0, Math.min(start, duration - gap)), Math.min(duration, Math.max(start + gap, end))]
      : [0, duration]);
    setEnabled(true);
  }, [duration, videoId, isOpen, isReady]);

  useEffect(() => {
    if (!isOpen || !isReady) return;
    const interval = window.setInterval(() => {
      const player = playerRef.current;
      if (!player || !Number.isFinite(player.currentTime)) return;
      const clock = player.currentTime;
      const outstanding = pending.current;
      if (outstanding) {
        const distance = Math.abs(outstanding.target - outstanding.from);
        const threshold = Math.min(CLOCK_MOVEMENT_THRESHOLD, distance / 4);
        const tolerance = 0.25;
        const backward = outstanding.target < outstanding.from;
        const forward = outstanding.target > outstanding.from;
        const movedBackward = backward && clock <= outstanding.from - threshold;
        const movedForward = forward && clock >= outstanding.from + threshold;
        const nearTarget = Math.abs(clock - outstanding.target) <= tolerance;
        const crossedTarget = (backward && clock <= outstanding.target) ||
          (forward && clock >= outstanding.target);
        const targetReached = (movedBackward || movedForward) && (nearTarget || crossedTarget);
        const timedOut = Date.now() - outstanding.startedAt >= SEEK_TIMEOUT_MS;
        if (targetReached || timedOut) {
          pending.current = null;
          loopArmed.current = true;
          onTimeChange(targetReached ? clock : outstanding.target);
        } else {
          onTimeChange(outstanding.target);
        }
        return;
      }

      onTimeChange(clock);
      if (enabled && clock < range[1] - 0.2) loopArmed.current = true;
      if (!enabled || !isPlaying || range[1] <= range[0] || !loopArmed.current || clock < range[1] - 0.08) return;

      loopArmed.current = false;
      issueSeek(range[0]);
      void player.play().catch(() => undefined);
    }, 75);
    return () => window.clearInterval(interval);
  }, [isOpen, isReady, playerRef, onTimeChange, enabled, isPlaying, range, issueSeek]);

  return { range, enabled, setEndpoint, seek, handleEnded };
}
