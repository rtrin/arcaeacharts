import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaybackRange, resolveManualSeek, shouldRepeatPlayback } from "./playback-range.ts";

test("normalizes saved bookmark ranges against the current video duration", () => {
  assert.deepEqual(normalizePlaybackRange(20, 40, 30), [20, 30]);
  assert.equal(normalizePlaybackRange(20, 10, 30), null);
});

test("only repeats a selected range when looping is explicitly enabled", () => {
  const range = [10, 20];
  assert.equal(shouldRepeatPlayback(false, true, true, 20, range), false);
  assert.equal(shouldRepeatPlayback(true, true, false, 20, range), false);
  assert.equal(shouldRepeatPlayback(true, true, true, 19.95, range), true);
  assert.equal(shouldRepeatPlayback(true, true, true, 19, range), false);
});

test("manual seeks escape a bookmarked range and clear selection, but custom ranges stay clamped", () => {
  assert.deepEqual(resolveManualSeek(30, 100, [10, 20], true, true), {
    target: 30,
    clearSelectedBookmark: true,
  });
  assert.deepEqual(resolveManualSeek(30, 100, [10, 20], true, false), {
    target: 20,
    clearSelectedBookmark: false,
  });
  assert.deepEqual(resolveManualSeek(-5, 100, [10, 20], true, true), {
    target: 0,
    clearSelectedBookmark: true,
  });
});
