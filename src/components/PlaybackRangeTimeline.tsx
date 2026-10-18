import { useRef } from "react";
import type { PlaybackRange } from "@/hooks/usePlaybackRange";

type DragKind = "track" | "in" | "out" | "playhead";
interface Props {
  duration: number;
  range: PlaybackRange;
  current: number;
  mobile: boolean;
  enabled: boolean;
  setEndpoint: (endpoint: 0 | 1, value: number) => void;
  seek: (time: number) => void;
}
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;

export function PlaybackRangeTimeline({ duration, range, current, mobile, enabled, setEndpoint, seek }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<{ id: number; kind: DragKind } | null>(null);
  const percentage = (time: number) => `${Math.max(0, Math.min(100, duration > 0 ? time / duration * 100 : 0))}%`;

  const timeAtPointer = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const size = mobile ? rect.height : rect.width;
    if (size <= 0) return null;
    const position = mobile ? event.clientY - rect.top : event.clientX - rect.left;
    return Math.max(0, Math.min(duration, position / size * duration));
  };

  const update = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>, kind: DragKind) => {
    const value = timeAtPointer(event);
    if (value === null) return;
    if (kind === "in") {
      setEndpoint(0, value);
    } else if (kind === "out") {
      setEndpoint(1, value);
    } else if (kind === "playhead") {
      seek(value);
    } else {
      seek(Math.max(range[0], Math.min(range[1], value)));
    }
  };

  const startDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>, kind: DragKind) => {
    if (!enabled || !event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    if (kind !== "track" && event.currentTarget instanceof HTMLButtonElement) {
      event.currentTarget.focus({ preventScroll: true });
    }
    activePointer.current = { id: event.pointerId, kind };
    event.currentTarget.setPointerCapture(event.pointerId);
    update(event, kind);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const drag = activePointer.current;
    if (drag?.id !== event.pointerId) return;
    event.stopPropagation();
    update(event, drag.kind);
  };

  const endDrag = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    if (activePointer.current?.id === event.pointerId) activePointer.current = null;
  };

  const handleKey = (event: React.KeyboardEvent<HTMLButtonElement>, kind: Exclude<DragKind, "track">) => {
    const step = event.shiftKey ? 1 : 0.25;
    let value = kind === "in" ? range[0] : kind === "out" ? range[1] : current;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") value += step;
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") value -= step;
    else if (event.key === "Home") value = kind === "in" ? 0 : kind === "out" ? range[0] + Math.min(0.25, duration / 2) : range[0];
    else if (event.key === "End") value = kind === "in" ? range[1] - Math.min(0.25, duration / 2) : kind === "out" ? duration : range[1];
    else return;
    event.preventDefault();
    if (kind === "playhead") seek(value);
    else setEndpoint(kind === "in" ? 0 : 1, value);
  };

  const renderEndpoint = (kind: "in" | "out") => {
    const index = kind === "in" ? 0 : 1;
    const value = range[index];
    return <button
      key={kind}
      type="button"
      role="slider"
      aria-label={kind === "in" ? "In point" : "Out point"}
      aria-orientation="horizontal"
      aria-valuemin={kind === "in" ? 0 : range[0] + Math.min(0.25, duration / 2)}
      aria-valuemax={kind === "in" ? range[1] - Math.min(0.25, duration / 2) : duration}
      aria-valuenow={value}
      aria-valuetext={formatTime(value)}
      onPointerDown={event => startDrag(event, kind)}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={event => handleKey(event, kind)}
      className="absolute top-1/2 z-20 h-11 w-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white ring-2 ring-blue-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-yellow-300"
      style={{ left: percentage(value) }}
    />;
  };

  return <div
    ref={trackRef}
    data-allow-click="true"
    className="relative h-12 w-full touch-none select-none"
    onPointerDown={event => startDrag(event, "track")}
    onPointerMove={moveDrag}
    onPointerUp={endDrag}
    onPointerCancel={endDrag}
    onLostPointerCapture={endDrag}
  >
    <div className="absolute left-0 right-0 top-1/2 h-2 -translate-y-1/2 rounded bg-white/30" />
    <div className="absolute top-1/2 h-2 -translate-y-1/2 bg-blue-400" style={{ left: percentage(range[0]), width: percentage(range[1] - range[0]) }} />
    {renderEndpoint("in")}
    {renderEndpoint("out")}
    <button
      type="button"
      role="slider"
      aria-label="Playback position"
      aria-orientation="horizontal"
      aria-valuemin={range[0]}
      aria-valuemax={range[1]}
      aria-valuenow={Math.max(range[0], Math.min(range[1], current))}
      aria-valuetext={formatTime(current)}
      onPointerDown={event => startDrag(event, "playhead")}
      onPointerMove={moveDrag}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onLostPointerCapture={endDrag}
      onKeyDown={event => handleKey(event, "playhead")}
      className="absolute top-1/2 z-30 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full bg-yellow-300 ring-2 ring-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
      style={{ left: percentage(Math.max(range[0], Math.min(range[1], current))) }}
    />
  </div>;
}
