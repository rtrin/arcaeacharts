# Score Archive Phase 1 Implementation Plan

> **For implementation:** complete the steps in order. Phase 1 is limited to
> authentication, profiles, RLS, manual score records, history, and basic
> statistics defined in
> [`2026-09-10-score-archive-phase-1-design.md`](../specs/2026-09-10-score-archive-phase-1-design.md).

## 1. Add the database migration

Create `data-pipeline/supabase/migrations/004_score_archive_phase_1.sql`.

- Create `profiles` and `score_records` using the exact columns, constraints,
  indexes, trigger functions, and RLS policy expressions in the Phase 1 design.
- Add `songs.is_active` and update `publish_song_sync` so a complete sync marks
  source-absent rows inactive instead of deleting them, while upserts reactivate
  present rows. Update public catalog queries to select active rows; history
  joins must include inactive rows. Update every pipeline snapshot,
  reconciliation, regression-check, hash, and post-publish verification read to
  consider active rows only, with reactivation covered by tests.
- Create the `auth.users` profile trigger as a hardened `security definer`
  function with an explicit `search_path`.
- Add a `BEFORE INSERT` trigger on `score_records` that verifies its
  `song_id`/`difficulty` pair against an active `songs` row.
- Add a security-invoker `get_score_history_snapshot()` RPC that returns only
  the database transaction timestamp. It provides a consistent history cutoff,
  not aggregation or user data.
- Do not add record update/delete policies. This makes the authenticated API
  append-only while preserving `auth.users` cascade deletion for account
  removal; document privileged maintenance as an operational-only path.
- Grant only the privileges required by the anon/authenticated roles; do not
  grant direct write access that conflicts with the RLS policy.
- Add Supabase CLI configuration and pgTAP tests. Use two seeded `auth.users`
  fixtures and JWT claim simulation to prove RLS isolation, profile key
  immutability, record append-only behavior, account-deletion cascade, failed
  invalid inserts, profile-name constraints, UTC-12/UTC+14 date boundaries,
  safe catalog retirement, consecutive syncs, and reactivation. Run them
  through `supabase test db` locally and in CI.

## 2. Define score-domain utilities and types

Add `src/lib/score-records.ts`.

- Define the controlled clear-status list, `ScoreRecord`, history row, filter,
  and statistics types.
- Implement pure functions for ASCII comma/space score-input normalization,
  client validation, history ordering with `id` as its final tie-breaker,
  immediate-prior improvement, per-chart best scores, and summary statistics.
- Keep database calls in `src/lib/supabase.ts` or a narrowly focused data file;
  do not embed query mechanics in page components.
- Add unit tests with same-day/timestamp records, duplicate scores, a zero
  score, an empty history, and invalid localized/decimal score strings.

## 3. Add auth and profile data access

Create `src/auth/AuthProvider.tsx` and `src/auth/RequireAuth.tsx`.

- Initialize session state with `supabase.auth.getSession()` and subscribe to
  `onAuthStateChange`.
- Expose auth actions for sign-in, sign-up, password reset, optional OAuth, and
  sign-out. `VITE_GOOGLE_AUTH_ENABLED` defaults to false; render OAuth only
  when it is exactly `true`.
- Fetch the authenticated profile through React Query; clear user-owned query
  data on a user/session change.
- Add typed methods for reading/updating the profile and reading/inserting
  score records. Capture `snapshot_created_at` from the database RPC, then
  fetch history exhaustively in 500-row keyset pages filtered to that cutoff.
  Page after the first must be strictly below the prior final
  `(date_taken, created_at, id)` tuple in descending order; do not use offset
  ranges or render aggregates from a partial page sequence. Use a joined song
  selection for history and active catalog rows for the form.
- Treat a missing profile immediately after signup as retryable rather than
  letting it block the authenticated shell.
- Capture the initiating user ID for profile and record mutations; only show a
  success toast or navigate when that same user is still active on completion.

## 4. Add authentication routes and account controls

Create `src/pages/SignIn.tsx`, `src/pages/AuthCallback.tsx`,
`src/pages/ResetPassword.tsx`, and reusable account navigation components as
the existing visual language requires.

- Add `/sign-in`, `/auth/callback`, `/reset-password`, `/records`,
  `/records/new`, and `/profile` routes in `src/App.tsx`; protect the latter
  three with `RequireAuth`.
- Implement email/password sign-in, sign-up, password-reset request, and reset
  completion with `supabase.auth.updateUser({ password })`. Handle recovery auth
  events and invalid, expired, or reused links with a request-new-link state.
- Add `VITE_GOOGLE_AUTH_ENABLED` to environment typing and deployment docs.
- Preserve only same-origin internal return paths to avoid open redirects.
- Add signed-out and signed-in account actions to the existing `/` header,
  preserving mobile layout and public catalog functionality.

## 5. Build the profile page

Create `src/pages/Profile.tsx`.

- Show account email from Supabase Auth and editable display name from
  `profiles`.
- Trim non-empty display names to 80 characters before updating; submit an
  empty value as `null`. The database check enforces the same contract and the
  signup trigger normalizes provider metadata.
- Surface save, loading, retry, and authorization errors with the existing
  Sonner/toast pattern.

## 6. Build manual score entry

Create `src/pages/NewScoreRecord.tsx`.

- Load the catalog using the existing song-query path; make a searchable song
  selector that disambiguates title and artist.
- Once a song is selected, offer only its cataloged difficulties and retain the
  selected song row's ID and difficulty.
- Accept ASCII comma/space-grouped numeric input, normalize it, require a
  controlled clear status, and prefill an editable local calendar date. Reject
  dates after local today; the database allows a one-day UTC boundary offset.
- Present a concise review before the final insert. Disable duplicate submits
  while the mutation is pending. If the active-chart insert check fails, retain
  the form values and require catalog refresh and re-selection.
- On successful insertion, invalidate the user-scoped history query and route
  to `/records` with a confirmation.

## 7. Build records history and statistics

Create `src/pages/Records.tsx` and small presentation components only when
reused by both desktop and mobile views.

- Fetch every page of the current user's history through RLS before computing
  Phase 1 statistics with the pure utilities. A later-page failure is a
  retryable error, not a partially accurate overview.
- Render total plays, average, high, low, clear-status counts, then a
  reverse-chronological history table/list.
- Add search, difficulty, clear-status, and date filters; sort by played date,
  score, and improvement.
- Render responsive dense list rows on mobile instead of requiring a wide
  table. Provide explicit loading, empty, error, and retry states.
- No edit or delete control is included.

## 8. Test and verify

- Add the smallest compatible test runner if none exists, then run unit and
  component tests for the behaviors specified in the design.
- Start the local Supabase CLI stack, apply migrations, and run the pgTAP suite
  with `supabase test db`. Confirm public reads of active `songs` remain
  unchanged, a referenced catalog row is retired rather than deleted, repeated
  sync verification excludes it, and source reappearance reactivates it.
- Test keyset history pagination with an insertion between page requests and
  confirm the captured database-time cutoff prevents duplicate or skipped rows.
- Run `npm run lint` and `npm run build`.
- Manually verify anonymous catalog access; email confirmation and password
  reset states; sign-in redirect and account switch; desktop records; and
  mobile score entry.

## Completion Criteria

- A user can create an account, sign in, update their own display name, append
  valid manual score records, and view their own filtered history and basic
  statistics.
- Anonymous visitors retain full catalog and Chart View access.
- RLS prevents reading, changing, or deleting another user's profile or score
  records, including direct API attempts.
- The database rejects dates later than UTC `current_date + 1`, invalid
  score/status values, inactive charts, and mismatched song/difficulty pairs.
- The deferred image/OCR and bookmark tables, UI, credentials, and dependencies
  are absent from Phase 1.
