import assert from "node:assert/strict";
import test from "node:test";
import {
  createChartScopeKey,
  formatBookmarkTime,
  getCurrentPlayerDuration,
  getFinitePlayerDuration,
  hasReachedPracticeRangeEnd,
  isSamePersistedPracticeRange,
  isOutsidePracticeRange,
  matchesBookmarkScope,
  parseBookmarkTime,
  parseStoredBookmarks,
  readStoredBookmarks,
  resolveBookmarkFocusId,
  sortBookmarks,
  updateStoredBookmarks,
  validateBookmarkTimes,
} from "./practice-bookmarks.ts";

class MemoryStorage {
  values = new Map();
  writes = 0;

  getItem(key) {
    return this.values.get(key) ?? null;
  }

  setItem(key, value) {
    this.writes += 1;
    this.values.set(key, value);
  }
}

test("time parsing and display retain fractional seconds in stored values", () => {
  assert.equal(parseBookmarkTime("75.375"), 75.375);
  assert.equal(parseBookmarkTime("1:15.375"), 75.375);
  assert.equal(parseBookmarkTime("1:60"), null);
  assert.equal(parseBookmarkTime("Infinity"), null);
  assert.equal(formatBookmarkTime(75.375), "1:15");

  const validation = validateBookmarkTimes("75.375", "", 90);
  assert.equal(validation.startSeconds, 75.375);
  assert.equal(validation.endSeconds, null);
  assert.deepEqual(validation.errors, {});
});

test("time validation requires a finite duration and a strict in-duration range", () => {
  assert.match(validateBookmarkTimes("1", "", Number.NaN).errors.start, /duration/);
  assert.match(validateBookmarkTimes("10", "", 10).errors.start, /start time/);
  assert.match(validateBookmarkTimes("2", "2", 10).errors.end, /after start/);
  assert.match(validateBookmarkTimes("2", "11", 10).errors.end, /within/);
  assert.deepEqual(validateBookmarkTimes("2", "10", 10).errors, {});
});

test("range boundaries clear on outside manual seeks and repeat at the end", () => {
  assert.equal(isOutsidePracticeRange(5, 5, 10), false);
  assert.equal(isOutsidePracticeRange(10, 5, 10), true);
  assert.equal(isOutsidePracticeRange(4.99, 5, 10), true);
  assert.equal(hasReachedPracticeRangeEnd(9.99, 10), false);
  assert.equal(hasReachedPracticeRangeEnd(10, 10), true);
});

test("player readiness requires finite duration from the exact attached context", () => {
  const context = "chart-1:video-a";
  assert.equal(getFinitePlayerDuration(context, context, 127.5), 127.5);
  assert.equal(getFinitePlayerDuration(context, "chart-0:video-old", 127.5), null);
  assert.equal(getFinitePlayerDuration(context, context, 0), null);
  assert.equal(getFinitePlayerDuration(context, context, Number.NaN), null);
  assert.equal(getFinitePlayerDuration(context, context, Number.POSITIVE_INFINITY), null);
});

test("current player readiness ignores a stale player instance from the same context", () => {
  const attached = { contextKey: "chart:video", generation: 3 };
  assert.equal(getCurrentPlayerDuration(attached.contextKey, attached, { ...attached, duration: 120 }), 120);
  assert.equal(getCurrentPlayerDuration(attached.contextKey, attached, null), 0);
  assert.equal(getCurrentPlayerDuration(attached.contextKey, attached, { ...attached, generation: 2, duration: 120 }), 0);
  assert.equal(getCurrentPlayerDuration(attached.contextKey, { ...attached, generation: 4 }, { ...attached, duration: 120 }), 0);
  assert.equal(getCurrentPlayerDuration("new-context", attached, { ...attached, duration: 120 }), 0);
  assert.equal(getCurrentPlayerDuration(attached.contextKey, null, { ...attached, duration: 120 }), 0);
});

test("bookmark listing sorts by numeric start time", () => {
  const late = { id: "late", scopeKey: "chart", videoId: "video", startSeconds: 20, endSeconds: null, label: "" };
  const early = { ...late, id: "early", startSeconds: 2.5 };
  assert.deepEqual(sortBookmarks([late, early]).map((bookmark) => bookmark.id), ["early", "late"]);
});

test("storage reconciliation invalidates changed or removed ranges but ignores label-only edits", () => {
  const active = { id: "range", scopeKey: "chart", videoId: "video", startSeconds: 4.25, endSeconds: 8.75, label: "old" };
  assert.equal(isSamePersistedPracticeRange(active, { ...active, label: "renamed" }), true);
  assert.equal(isSamePersistedPracticeRange(active, { ...active, startSeconds: 5 }), false);
  assert.equal(isSamePersistedPracticeRange(active, { ...active, endSeconds: 9 }), false);
  assert.equal(isSamePersistedPracticeRange(active, { ...active, endSeconds: null }), false);
  assert.equal(isSamePersistedPracticeRange(active, undefined), false);
});

test("editor focus restoration resolves the stable row after list remount and falls back when removed", () => {
  assert.equal(resolveBookmarkFocusId("bookmark-1", ["bookmark-1", "bookmark-2"]), "bookmark-1");
  assert.equal(resolveBookmarkFocusId("bookmark-1", ["bookmark-2"]), null);
  assert.equal(resolveBookmarkFocusId(null, ["bookmark-2"]), null);
});

test("chart identity is stable and includes song, difficulty, and version", () => {
  const future = createChartScopeKey(17, "Future", "v1");
  assert.equal(future, createChartScopeKey(17, "Future", "v1"));
  assert.notEqual(future, createChartScopeKey(18, "Future", "v1"));
  assert.notEqual(future, createChartScopeKey(17, "Beyond", "v1"));
  assert.notEqual(future, createChartScopeKey(17, "Future", "v2"));
});

test("storage reads exact contexts and supports create, edit, and delete", () => {
  const storage = new MemoryStorage();
  const sameChart = { scopeKey: "song:Future:v1", videoId: "video-a" };
  const point = { id: "point", ...sameChart, startSeconds: 5.5, endSeconds: null, label: "" };
  const range = { id: "range", ...sameChart, startSeconds: 20, endSeconds: 25, label: "arc" };
  const otherVideo = { ...point, id: "other-video", videoId: "video-b" };
  const otherChart = { ...point, id: "other-chart", scopeKey: "song:Beyond:v1" };

  updateStoredBookmarks(storage, () => [point, range, otherVideo, otherChart]);
  let result = readStoredBookmarks(storage);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bookmarks.filter((item) => matchesBookmarkScope(item, sameChart)).length, 2);

  updateStoredBookmarks(storage, (current) => current.map((item) =>
    item.id === "point" ? { ...item, startSeconds: 7.25, label: "revised" } : item,
  ));
  result = readStoredBookmarks(storage);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.bookmarks.find((item) => item.id === "point")?.startSeconds, 7.25);
  assert.equal(result.bookmarks.find((item) => item.id === "point")?.label, "revised");

  updateStoredBookmarks(storage, (current) => current.filter((item) => item.id !== "range"));
  result = readStoredBookmarks(storage);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.bookmarks.some((item) => item.id === "range"), false);
});

test("unknown, corrupt, and failed storage is reported and never overwritten", () => {
  assert.equal(parseStoredBookmarks("{not json").ok, false);
  assert.equal(parseStoredBookmarks(JSON.stringify({ version: 2, bookmarks: [] })).ok, false);
  assert.equal(parseStoredBookmarks(JSON.stringify({ version: 1, bookmarks: [{ id: "same" }, { id: "same" }] })).ok, false);

  const corrupt = new MemoryStorage();
  corrupt.values.set("arcaea-practice-bookmarks:v1", "not-json");
  assert.throws(() => updateStoredBookmarks(corrupt, () => []), /could not be read/);
  assert.equal(corrupt.writes, 0);

  const failing = new MemoryStorage();
  failing.setItem = () => { throw new Error("quota exceeded"); };
  assert.throws(() => updateStoredBookmarks(failing, () => []), /quota exceeded/);
});
