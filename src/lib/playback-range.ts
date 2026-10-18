export type PlaybackRange = [number, number];

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
