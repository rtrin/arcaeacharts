import type { Song } from "@/lib/supabase";

export const CLEAR_STATUSES = [
  "Track Lost",
  "Clear",
  "Full Recall",
  "Easy Clear",
  "Hard Clear",
  "EX",
  "EX+",
  "PM",
] as const;

export type ClearStatus = (typeof CLEAR_STATUSES)[number];

export interface ScoreRecord {
  id: number;
  user_id: string;
  song_id: number;
  difficulty: string;
  score: number;
  clear_status: ClearStatus;
  date_taken: string;
  created_at: string;
}

export interface ScoreHistoryRow extends ScoreRecord {
  song: Pick<Song, "id" | "title" | "artist" | "difficulty" | "constant" | "level" | "version"> | null;
  improvement?: number | null;
}

export interface ScoreRecordInput {
  songId: number;
  difficulty: string;
  scoreInput: string;
  clearStatus: string;
  dateTaken: string;
}

export interface ScoreRecordValidation {
  score: number | null;
  errors: string[];
}

export interface ScoreStatistics {
  totalPlays: number;
  average: number | null;
  highest: number | null;
  lowest: number | null;
  clearStatusCounts: Record<ClearStatus, number>;
  bestScores: Record<string, number>;
}

export type HistorySort = "date" | "score" | "improvement";

export interface ScoreHistoryFilter {
  search: string;
  difficulty: string;
  clearStatus: ClearStatus | "";
  fromDate: string;
  toDate: string;
}

const GROUPED_SCORE_PATTERN = /^\d{1,3}(?:[ ,]\d{3})+$/;
const SCORE_PATTERN = /^\d+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeScoreInput(value: string): number | null {
  const trimmed = value.trim();
  if (!SCORE_PATTERN.test(trimmed) && !GROUPED_SCORE_PATTERN.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replace(/[ ,]/g, "");
  const score = Number(normalized);
  return Number.isSafeInteger(score) ? score : null;
}

function isValidDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateScoreRecordInput(
  input: ScoreRecordInput,
  songs: Pick<Song, "id" | "difficulty">[],
  today = localDateString(),
): ScoreRecordValidation {
  const score = normalizeScoreInput(input.scoreInput);
  const errors: string[] = [];

  if (score === null || score < 0 || score > 10_000_000) {
    errors.push("Enter a whole-number score from 0 to 10,000,000.");
  }
  if (!songs.some((song) => song.id === input.songId && song.difficulty === input.difficulty)) {
    errors.push("Select an active song and difficulty.");
  }
  if (!CLEAR_STATUSES.includes(input.clearStatus as ClearStatus)) {
    errors.push("Select a valid clear status.");
  }
  if (!isValidDateOnly(input.dateTaken) || input.dateTaken > today) {
    errors.push("Played date must be a valid date no later than today.");
  }

  return { score, errors };
}

function chartKey(record: Pick<ScoreRecord, "song_id" | "difficulty">): string {
  return `${record.song_id}:${record.difficulty}`;
}

function compareAscending(a: ScoreRecord, b: ScoreRecord): number {
  return a.date_taken.localeCompare(b.date_taken)
    || a.created_at.localeCompare(b.created_at)
    || a.id - b.id;
}

export function orderHistory(rows: ScoreHistoryRow[]): ScoreHistoryRow[] {
  return [...rows].sort((a, b) => {
    return b.date_taken.localeCompare(a.date_taken)
      || b.created_at.localeCompare(a.created_at)
      || b.id - a.id;
  });
}

export function addImprovements(rows: ScoreHistoryRow[]): ScoreHistoryRow[] {
  const priorByChart = new Map<string, ScoreHistoryRow>();
  const ascending = [...rows].sort(compareAscending);
  const withImprovements = new Map<number, number | null>();

  for (const row of ascending) {
    const prior = priorByChart.get(chartKey(row));
    withImprovements.set(row.id, prior ? row.score - prior.score : null);
    priorByChart.set(chartKey(row), row);
  }

  return rows.map((row) => ({ ...row, improvement: withImprovements.get(row.id) ?? null }));
}

export function calculateStatistics(rows: ScoreRecord[]): ScoreStatistics {
  const clearStatusCounts = Object.fromEntries(
    CLEAR_STATUSES.map((status) => [status, 0]),
  ) as Record<ClearStatus, number>;
  const bestScores: Record<string, number> = {};

  for (const row of rows) {
    clearStatusCounts[row.clear_status] += 1;
    const key = chartKey(row);
    bestScores[key] = Math.max(bestScores[key] ?? 0, row.score);
  }

  const scores = rows.map((row) => row.score);
  return {
    totalPlays: rows.length,
    average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : null,
    highest: scores.length ? scores.reduce((highest, score) => Math.max(highest, score), scores[0]) : null,
    lowest: scores.length ? scores.reduce((lowest, score) => Math.min(lowest, score), scores[0]) : null,
    clearStatusCounts,
    bestScores,
  };
}
