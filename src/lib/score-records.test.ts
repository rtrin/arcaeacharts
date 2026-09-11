import assert from "node:assert/strict";
import test from "node:test";
import { addImprovements, calculateStatistics, normalizeScoreInput, orderHistory, validateScoreRecordInput, type ScoreHistoryRow } from "./score-records.ts";

const song = { id: 1, difficulty: "Future" };

function historyRow(id: number, score: number, createdAt: string, dateTaken = "2026-09-10"): ScoreHistoryRow {
  return {
    id,
    user_id: "user",
    song_id: 1,
    difficulty: "Future",
    score,
    clear_status: score === 0 ? "Track Lost" : "Clear",
    date_taken: dateTaken,
    created_at: createdAt,
    song: { id: 1, title: "Test", artist: "Artist", difficulty: "Future", constant: 9, level: "9", version: "1" },
  };
}

test("normalizes only whole ASCII scores and grouping separators", () => {
  assert.equal(normalizeScoreInput("10,000,000"), 10_000_000);
  assert.equal(normalizeScoreInput("1 000 000"), 1_000_000);
  assert.equal(normalizeScoreInput("1,00"), null);
  assert.equal(normalizeScoreInput("1.0"), null);
  assert.equal(normalizeScoreInput("１０"), null);
});

test("validates zero scores, chart pairing, status, and date", () => {
  const valid = validateScoreRecordInput({ songId: 1, difficulty: "Future", scoreInput: "0", clearStatus: "Track Lost", dateTaken: "2026-09-10" }, [song], "2026-09-10");
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.score, 0);
  assert.ok(validateScoreRecordInput({ songId: 1, difficulty: "Past", scoreInput: "1", clearStatus: "Clear", dateTaken: "2026-09-11" }, [song], "2026-09-10").errors.length > 0);
});

test("calculates same-day improvement in submission order", () => {
  const rows = addImprovements([
    historyRow(3, 9_500_000, "2026-09-10T12:00:00Z"),
    historyRow(2, 9_000_000, "2026-09-10T11:00:00Z"),
    historyRow(1, 8_000_000, "2026-09-10T10:00:00Z"),
  ]);
  assert.equal(rows.find((row) => row.id === 1)?.improvement, null);
  assert.equal(rows.find((row) => row.id === 2)?.improvement, 1_000_000);
  assert.equal(rows.find((row) => row.id === 3)?.improvement, 500_000);
});

test("statistics include duplicate and zero-score records", () => {
  const stats = calculateStatistics([historyRow(1, 0, "2026-09-10T10:00:00Z"), historyRow(2, 9_000_000, "2026-09-10T11:00:00Z"), historyRow(3, 9_000_000, "2026-09-11T11:00:00Z")]);
  assert.equal(stats.totalPlays, 3);
  assert.equal(stats.lowest, 0);
  assert.equal(stats.highest, 9_000_000);
  assert.equal(stats.clearStatusCounts["Track Lost"], 1);
  assert.equal(stats.bestScores["1:Future"], 9_000_000);
});

test("history ordering uses date, submission time, and id", () => {
  const rows = [
    historyRow(1, 1, "2026-09-10T10:00:00Z", "2026-09-10"),
    historyRow(3, 3, "2026-09-10T10:00:00Z", "2026-09-10"),
    historyRow(2, 2, "2026-09-11T10:00:00Z", "2026-09-11"),
  ];
  assert.deepEqual(orderHistory(rows).map((row) => row.id), [2, 3, 1]);
});

test("rejects malformed and localized score input", () => {
  for (const value of ["-1", "+1", "1.5", "1_000", "١٠٠", "10,00,000"]) {
    assert.equal(normalizeScoreInput(value), null, value);
  }
  assert.equal(normalizeScoreInput("00000000"), 0);
});
