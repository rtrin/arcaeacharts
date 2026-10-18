import test from "node:test";
import assert from "node:assert/strict";
import { normalizePlaybackRange, shouldRepeatPlayback } from "./playback-range.ts";

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
