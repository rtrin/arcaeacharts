export type PlaybackRange = [number, number];

export interface ManualSeekResolution {
  target: number;
  clearSelectedBookmark: boolean;
}

export function resolveManualSeek(
  time: number,
  duration: number,
  range: PlaybackRange,
  rangeEnabled: boolean,
  hasSelectedBookmark: boolean,
): ManualSeekResolution | null {
  if (!Number.isFinite(time)) return null;
  const maximum = Number.isFinite(duration) && duration > 0 ? duration : Number.POSITIVE_INFINITY;
  if (hasSelectedBookmark && (time < range[0] || time >= range[1])) {
    return { target: Math.max(0, Math.min(maximum, time)), clearSelectedBookmark: true };
  }
  const target = rangeEnabled ? Math.max(range[0], Math.min(range[1], time)) : Math.max(0, time);
  return { target, clearSelectedBookmark: false };
}

export function normalizePlaybackRange(start: number, end: number, duration: number): PlaybackRange | null {
  if (![start, end, duration].every(Number.isFinite) || duration <= 0 || end <= start) return null;
  const gap = Math.min(0.25, duration / 2);
  const normalizedStart = Math.max(0, Math.min(start, duration - gap));
  return [normalizedStart, Math.min(duration, Math.max(end, normalizedStart + gap))];
}

export function shouldRepeatPlayback(
  loopEnabled: boolean,
  rangeSelected: boolean,
  isPlaying: boolean,
  currentTime: number,
  range: PlaybackRange,
): boolean {
  return loopEnabled && rangeSelected && isPlaying && Number.isFinite(currentTime) &&
    range[1] > range[0] && currentTime >= range[1] - 0.08;
}
