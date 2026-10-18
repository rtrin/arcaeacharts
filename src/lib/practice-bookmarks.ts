export const PRACTICE_BOOKMARKS_STORAGE_KEY = "arcaea-practice-bookmarks:v1";
export const PRACTICE_BOOKMARKS_VERSION = 1;

export interface PracticeBookmark {
  id: string;
  scopeKey: string;
  videoId: string;
  startSeconds: number;
  endSeconds: number | null;
  label: string;
}

export interface BookmarkScope {
  scopeKey: string;
  videoId: string;
}

export interface PlayerIdentity {
  contextKey: string;
  generation: number;
}

export interface PlayerReadiness extends PlayerIdentity {
  duration: number;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type BookmarkReadResult =
  | { ok: true; bookmarks: PracticeBookmark[] }
  | { ok: false; message: string };

export function createChartScopeKey(
  songId: number,
  difficulty: string,
  version: string,
): string {
  return `${songId}:${encodeURIComponent(difficulty)}:${encodeURIComponent(version)}`;
}

export function matchesBookmarkScope(
  bookmark: PracticeBookmark,
  scope: BookmarkScope,
): boolean {
  return bookmark.scopeKey === scope.scopeKey && bookmark.videoId === scope.videoId;
}

export function isSamePersistedPracticeRange(
  activeRange: PracticeBookmark,
  storedBookmark: PracticeBookmark | undefined,
): boolean {
  return storedBookmark !== undefined &&
    storedBookmark.id === activeRange.id &&
    storedBookmark.endSeconds !== null &&
    storedBookmark.startSeconds === activeRange.startSeconds &&
    storedBookmark.endSeconds === activeRange.endSeconds;
}

export function resolveBookmarkFocusId(
  editedBookmarkId: string | null,
  availableBookmarkIds: string[],
): string | null {
  return editedBookmarkId && availableBookmarkIds.includes(editedBookmarkId)
    ? editedBookmarkId
    : null;
}

export function sortBookmarks(bookmarks: PracticeBookmark[]): PracticeBookmark[] {
  return [...bookmarks].sort(
    (a, b) => a.startSeconds - b.startSeconds || a.id.localeCompare(b.id),
  );
}

export function isOutsidePracticeRange(time: number, startSeconds: number, endSeconds: number): boolean {
  return !Number.isFinite(time) || time < startSeconds || time >= endSeconds;
}

export function hasReachedPracticeRangeEnd(time: number, endSeconds: number): boolean {
  return Number.isFinite(time) && Number.isFinite(endSeconds) && time >= endSeconds;
}

export function getFinitePlayerDuration(
  expectedContextKey: string,
  attachedContextKey: string | null,
  duration: number,
): number | null {
  return attachedContextKey === expectedContextKey && Number.isFinite(duration) && duration > 0
    ? duration
    : null;
}

export function getCurrentPlayerDuration(
  expectedContextKey: string,
  attachedPlayer: PlayerIdentity | null,
  readiness: PlayerReadiness | null,
): number {
  if (
    !attachedPlayer ||
    attachedPlayer.contextKey !== expectedContextKey ||
    !readiness ||
    readiness.contextKey !== expectedContextKey ||
    readiness.generation !== attachedPlayer.generation
  ) return 0;
  return getFinitePlayerDuration(expectedContextKey, attachedPlayer.contextKey, readiness.duration) ?? 0;
}

export function formatBookmarkTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const wholeSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}`;
}

export function parseBookmarkTime(value: string): number | null {
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : null;
  }
  const match = /^(\d+):([0-5]?\d(?:\.\d+)?)$/.exec(trimmed);
  if (!match) return null;
  const seconds = Number(match[1]) * 60 + Number(match[2]);
  return Number.isFinite(seconds) ? seconds : null;
}

export function validateBookmarkTimes(
  startInput: string,
  endInput: string,
  duration: number,
): { startSeconds?: number; endSeconds: number | null; errors: { start?: string; end?: string } } {
  const errors: { start?: string; end?: string } = {};
  const startSeconds = parseBookmarkTime(startInput);
  const endSeconds = endInput.trim() ? parseBookmarkTime(endInput) : null;

  if (!Number.isFinite(duration) || duration <= 0) {
    errors.start = "Wait for the video duration before saving.";
  } else if (startSeconds === null || startSeconds >= duration) {
    errors.start = `Enter a start time from 0 to ${formatBookmarkTime(duration)}.`;
  }

  if (endInput.trim() && endSeconds === null) {
    errors.end = "Enter a time in seconds or m:ss format.";
  } else if (endSeconds !== null && startSeconds !== null) {
    if (endSeconds <= startSeconds) errors.end = "End must be after start.";
    else if (Number.isFinite(duration) && endSeconds > duration) {
      errors.end = `End must be within ${formatBookmarkTime(duration)}.`;
    }
  }

  return {
    ...(startSeconds === null ? {} : { startSeconds }),
    endSeconds,
    errors,
  };
}

export function parseStoredBookmarks(raw: string | null): BookmarkReadResult {
  if (raw === null) return { ok: true, bookmarks: [] };

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as { version?: unknown }).version !== PRACTICE_BOOKMARKS_VERSION ||
      !Array.isArray((parsed as { bookmarks?: unknown }).bookmarks)
    ) {
      return { ok: false, message: "Saved bookmarks have an unsupported format; they were left untouched." };
    }

    const ids = new Set<string>();
    const bookmarks: PracticeBookmark[] = [];
    for (const value of (parsed as { bookmarks: unknown[] }).bookmarks) {
      if (!isPracticeBookmark(value) || ids.has(value.id)) {
        return { ok: false, message: "Saved bookmarks are damaged; they were left untouched." };
      }
      ids.add(value.id);
      bookmarks.push(value);
    }
    return { ok: true, bookmarks };
  } catch {
    return { ok: false, message: "Saved bookmarks could not be read; they were left untouched." };
  }
}

export function readStoredBookmarks(storage: StorageAdapter): BookmarkReadResult {
  try {
    return parseStoredBookmarks(storage.getItem(PRACTICE_BOOKMARKS_STORAGE_KEY));
  } catch {
    return { ok: false, message: "Browser storage is unavailable; bookmarks could not be loaded." };
  }
}

export function updateStoredBookmarks(
  storage: StorageAdapter,
  update: (current: PracticeBookmark[]) => PracticeBookmark[],
): PracticeBookmark[] {
  const current = readStoredBookmarks(storage);
  if (!current.ok) throw new Error(current.message);

  const next = update(current.bookmarks);
  const serialized = JSON.stringify({ version: PRACTICE_BOOKMARKS_VERSION, bookmarks: next });
  const checked = parseStoredBookmarks(serialized);
  if (!checked.ok) throw new Error(checked.message);
  storage.setItem(PRACTICE_BOOKMARKS_STORAGE_KEY, serialized);
  return checked.bookmarks;
}

export function createBookmarkId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `bookmark-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function isPracticeBookmark(value: unknown): value is PracticeBookmark {
  if (!value || typeof value !== "object") return false;
  const bookmark = value as Partial<PracticeBookmark>;
  return (
    typeof bookmark.id === "string" && bookmark.id.length > 0 &&
    typeof bookmark.scopeKey === "string" && bookmark.scopeKey.length > 0 &&
    typeof bookmark.videoId === "string" && bookmark.videoId.length > 0 &&
    typeof bookmark.startSeconds === "number" && Number.isFinite(bookmark.startSeconds) && bookmark.startSeconds >= 0 &&
    (bookmark.endSeconds === null || (
      typeof bookmark.endSeconds === "number" && Number.isFinite(bookmark.endSeconds) && bookmark.endSeconds > bookmark.startSeconds
    )) &&
    typeof bookmark.label === "string"
  );
}
