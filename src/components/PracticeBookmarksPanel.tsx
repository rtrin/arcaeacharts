import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createBookmarkId,
  formatBookmarkTime,
  resolveBookmarkFocusId,
  validateBookmarkTimes,
  type BookmarkScope,
  type PracticeBookmark,
} from "@/lib/practice-bookmarks";

interface PracticeBookmarksPanelProps {
  scope: BookmarkScope;
  isPlayerReady: boolean;
  onGetCurrentTime: () => number | null;
  onGetDuration: () => number | null;
  activeRangeId: string | null;
  hasSelectedRange: boolean;
  loopEnabled: boolean;
  onSelect: (bookmark: PracticeBookmark) => void;
  onToggleLoop: (enabled: boolean) => void;
  onClearRange: () => void;
  onDismiss: () => void;
  bookmarks: PracticeBookmark[];
  storageError: string | null;
  mutate: (update: (current: PracticeBookmark[]) => PracticeBookmark[]) => boolean;
}

interface BookmarkDraft {
  id: string | null;
  startInput: string;
  endInput: string;
  label: string;
}

export function PracticeBookmarksPanel({
  scope,
  isPlayerReady,
  onGetCurrentTime,
  onGetDuration,
  activeRangeId,
  hasSelectedRange,
  loopEnabled,
  onSelect,
  onToggleLoop,
  onClearRange,
  onDismiss,
  bookmarks,
  storageError,
  mutate,
}: PracticeBookmarksPanelProps) {
  const [draft, setDraft] = useState<BookmarkDraft | null>(null);
  const [errors, setErrors] = useState<{ start?: string; end?: string }>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const addButtonRef = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<HTMLElement | null>(null);
  const lastBookmarkId = useRef<string | null>(null);
  const startInputRef = useRef<HTMLInputElement>(null);

  const openNewDraft = () => {
    const sampledTime = onGetCurrentTime();
    if (sampledTime === null) {
      setActionError("Playback time is not available yet.");
      return;
    }
    lastTrigger.current = document.activeElement as HTMLElement;
    lastBookmarkId.current = null;
    setActionError(null);
    setErrors({});
    setDraft({ id: null, startInput: String(sampledTime), endInput: "", label: "" });
    window.requestAnimationFrame(() => startInputRef.current?.focus());
  };

  const editBookmark = (bookmark: PracticeBookmark, trigger: HTMLElement) => {
    lastTrigger.current = trigger;
    lastBookmarkId.current = bookmark.id;
    if (bookmark.id === activeRangeId) onClearRange();
    setActionError(null);
    setErrors({});
    setDraft({
      id: bookmark.id,
      startInput: String(bookmark.startSeconds),
      endInput: bookmark.endSeconds === null ? "" : String(bookmark.endSeconds),
      label: bookmark.label,
    });
    window.requestAnimationFrame(() => startInputRef.current?.focus());
  };

  const closeDraft = () => {
    setDraft(null);
    setErrors({});
    window.requestAnimationFrame(() => {
      const editButtons = Array.from(panelRef.current?.querySelectorAll<HTMLButtonElement>("[data-bookmark-edit-id]") ?? []);
      const availableIds = editButtons.map((button) => button.dataset.bookmarkEditId ?? "");
      const focusId = resolveBookmarkFocusId(lastBookmarkId.current, availableIds);
      const editButton = focusId && editButtons.find((button) => button.dataset.bookmarkEditId === focusId);
      if (editButton) editButton.focus();
      else if (lastTrigger.current?.isConnected) lastTrigger.current.focus();
      else addButtonRef.current?.focus();
    });
  };

  const saveDraft = () => {
    if (!draft || !isPlayerReady) {
      setActionError("Wait for this video to finish loading before saving.");
      return;
    }
    const duration = onGetDuration();
    const validation = validateBookmarkTimes(draft.startInput, draft.endInput, duration ?? NaN);
    setErrors(validation.errors);
    if (Object.keys(validation.errors).length > 0 || validation.startSeconds === undefined) return;

    const bookmark: PracticeBookmark = {
      id: draft.id ?? createBookmarkId(),
      scopeKey: scope.scopeKey,
      videoId: scope.videoId,
      startSeconds: validation.startSeconds,
      endSeconds: validation.endSeconds,
      label: draft.label.trim(),
    };
    const saved = mutate((current) => [...current.filter((item) => item.id !== bookmark.id), bookmark]);
    if (saved) closeDraft();
  };

  const removeBookmark = (bookmark: PracticeBookmark) => {
    if (bookmark.id === activeRangeId) onClearRange();
    setActionError(null);
    mutate((current) => current.filter((item) => item.id !== bookmark.id));
  };

  const captureCurrentTime = (field: "startInput" | "endInput") => {
    const sampledTime = onGetCurrentTime();
    if (sampledTime === null) {
      setActionError("Playback time is not available yet.");
      return;
    }
    setDraft((current) => current ? { ...current, [field]: String(sampledTime) } : current);
    setErrors((current) => ({ ...current, [field === "startInput" ? "start" : "end"]: undefined }));
    setActionError(null);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    if (draft) closeDraft();
    else onDismiss();
  };

  useEffect(() => {
    const handleOutsideEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || (event.target instanceof Node && panelRef.current?.contains(event.target))) return;
      event.preventDefault();
      if (draft) closeDraft();
      else onDismiss();
    };
    document.addEventListener("keydown", handleOutsideEscape);
    return () => document.removeEventListener("keydown", handleOutsideEscape);
  }, [draft, onDismiss]);

  return (
    <section
      id="practice-bookmarks-panel"
      ref={panelRef}
      aria-label="Practice bookmarks"
      onKeyDown={handleKeyDown}
      data-allow-click
      className="absolute left-4 top-16 z-[70] flex max-h-[min(68vh,calc(100vw-5rem),34rem)] w-[min(21rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-lg border border-white/15 bg-zinc-950/95 text-white shadow-xl backdrop-blur-md max-sm:top-4 max-sm:max-h-[min(17.5rem,calc(100vw-5rem))]"
    >
      <header className="flex items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Practice bookmarks</h2>
          <p className="text-[11px] text-white/60">This video · {bookmarks.length}</p>
        </div>
        <Button ref={addButtonRef} type="button" size="sm" onClick={openNewDraft} disabled={!isPlayerReady} className="h-7 px-2 text-xs">
          Add
        </Button>
      </header>

      <div className="overflow-y-auto p-3 text-xs" data-allow-click>
        <p className="mb-3 text-[11px] leading-relaxed text-white/55">
          Saved in this browser only. These bookmarks are tied to this exact video; clearing site data removes them.
        </p>
        {storageError && <p role="alert" className="mb-2 rounded bg-red-950/70 p-2 text-red-200">{storageError}</p>}
        {actionError && <p role="alert" className="mb-2 text-amber-200">{actionError}</p>}

      {hasSelectedRange && (
          <div className="mb-3 flex items-center gap-2 rounded border border-violet-300/25 bg-violet-950/50 p-2">
            <span className="mr-auto text-white/80">Range selected · loop {loopEnabled ? "on" : "off"}</span>
            <Button type="button" size="sm" variant={loopEnabled ? "default" : "secondary"} aria-pressed={loopEnabled} onClick={() => onToggleLoop(!loopEnabled)} className="h-7 px-2 text-xs">
              {loopEnabled ? "Loop on" : "Loop off"}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClearRange} className="h-7 px-2 text-xs">Clear</Button>
          </div>
        )}

        {draft ? (
          <form onSubmit={(event) => { event.preventDefault(); saveDraft(); }} className="space-y-2 rounded border border-white/15 bg-white/5 p-2">
            <p className="font-medium">{draft.id ? "Edit bookmark" : "Add bookmark"}</p>
            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="min-w-0 space-y-1">
                <span className="block text-white/70">Start (seconds or m:ss) <span aria-hidden="true">*</span></span>
                <Input ref={startInputRef} value={draft.startInput} onChange={(event) => { setDraft({ ...draft, startInput: event.target.value }); setErrors((current) => ({ ...current, start: undefined })); }} aria-invalid={Boolean(errors.start)} aria-describedby={errors.start ? "bookmark-start-error" : undefined} inputMode="decimal" className="h-8 border-white/20 bg-black/40 text-xs text-white" />
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => captureCurrentTime("startInput")} className="h-8 px-2 text-[11px]">Use current</Button>
            </div>
            {errors.start && <p id="bookmark-start-error" role="alert" className="text-red-300">{errors.start}</p>}

            <div className="grid grid-cols-[1fr_auto] items-end gap-2">
              <label className="min-w-0 space-y-1">
                <span className="block text-white/70">End (optional)</span>
                <Input value={draft.endInput} onChange={(event) => { setDraft({ ...draft, endInput: event.target.value }); setErrors((current) => ({ ...current, end: undefined })); }} aria-invalid={Boolean(errors.end)} aria-describedby={errors.end ? "bookmark-end-error" : undefined} inputMode="decimal" placeholder="Point bookmark" className="h-8 border-white/20 bg-black/40 text-xs text-white" />
              </label>
              <Button type="button" size="sm" variant="secondary" onClick={() => captureCurrentTime("endInput")} className="h-8 px-2 text-[11px]">Use current</Button>
            </div>
            {errors.end && <p id="bookmark-end-error" role="alert" className="text-red-300">{errors.end}</p>}

            <label className="block space-y-1">
              <span className="block text-white/70">Label (optional)</span>
              <Input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} maxLength={100} placeholder="e.g. difficult pattern" className="h-8 border-white/20 bg-black/40 text-xs text-white" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" size="sm" variant="ghost" onClick={closeDraft} className="h-7 px-2 text-xs">Cancel</Button>
              <Button type="submit" size="sm" className="h-7 px-3 text-xs">Save</Button>
            </div>
          </form>
        ) : bookmarks.length === 0 ? (
          <p className="rounded border border-dashed border-white/15 p-3 text-center text-white/65">No bookmarks yet. Add a point or set an optional end to mark a practice range.</p>
        ) : (
          <ul className="space-y-1.5">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id} className={`flex items-center gap-1 rounded border p-1.5 ${activeRangeId === bookmark.id ? "border-violet-300/50 bg-violet-950/45" : "border-white/10 bg-white/5"}`}>
                <Button type="button" variant="ghost" onClick={() => onSelect(bookmark)} aria-current={activeRangeId === bookmark.id ? "true" : undefined} aria-label={`Seek to ${formatBookmarkTime(bookmark.startSeconds)}${bookmark.label ? `, ${bookmark.label}` : ""}`} className="min-w-0 flex-1 justify-start gap-1 px-1.5 text-left text-xs">
                  <span className="shrink-0 font-mono text-violet-200">{formatBookmarkTime(bookmark.startSeconds)}{bookmark.endSeconds !== null && `–${formatBookmarkTime(bookmark.endSeconds)}`}</span>
                  <span className="truncate text-white/70">{bookmark.label || (bookmark.endSeconds === null ? "Point" : "Range")}</span>
                </Button>
                <Button type="button" variant="ghost" size="sm" data-bookmark-edit-id={bookmark.id} aria-label={`Edit ${bookmark.label || "bookmark"}`} onClick={(event) => editBookmark(bookmark, event.currentTarget)} className="h-7 px-1.5 text-[11px]">Edit</Button>
                <Button type="button" variant="ghost" size="sm" aria-label={`Delete ${bookmark.label || "bookmark"}`} onClick={() => removeBookmark(bookmark)} className="h-7 px-1.5 text-[11px] text-red-200 hover:text-red-100">Delete</Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
