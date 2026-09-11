# Score Archive Phase 1

## Goal

Add private, authenticated score tracking to Arcaea Charts while leaving the
public song catalog and Chart View available without an account. Phase 1 covers
authentication, profiles, row-level security (RLS), manual score entry,
immutable history, and personal statistics. Video bookmarks and image/OCR
features are explicitly out of scope.

This document narrows the broader [Score Archive design](2026-09-07-score-archive-design.md)
to a shippable first release.

## User Experience

### Public catalog

- The existing `/` catalog route remains public and unchanged in behavior.
- Its header adds a `Sign in` action when signed out.
- A signed-in user sees a compact account menu with `Score Archive`, `Profile`,
  and `Sign out`.
- Account controls remain usable on narrow screens without hiding catalog
  filters or requiring a persistent sidebar.

### Authentication

- `/sign-in` supports email/password sign-in, account creation, and password
  recovery. `/reset-password` validates the recovery session and lets the user
  set a new password. Expired, reused, and malformed recovery links show a
  request-new-link state. Google OAuth is shown only when
  `VITE_GOOGLE_AUTH_ENABLED=true` and the provider is enabled in Supabase.
- `/auth/callback` completes provider redirects and returns the user to the
  route requested before authentication, falling back to `/records`.
- The client listens for Supabase auth changes so sign-out, token refresh, and
  expired sessions immediately update protected views.
- Authentication errors are actionable but never disclose whether an email
  address already has an account.

### Score Archive

- `/records` is the authenticated overview. It shows total plays, average,
  highest, and lowest score; clear-status counts; and a reverse-chronological
  history list.
- History filters are limited to song/artist search, difficulty, clear status,
  and played-date range. Sorting supports date played, score, and improvement.
- A record row displays song, difficulty, score, clear status, date played,
  and improvement against the immediately preceding record for the same chart.
- `/records/new` is the authenticated manual-entry route. Users select a song,
  then one of its available difficulties, enter a score and clear status, and
  may change the prefilled played date. A review summary appears before save.
- `/profile` lets a user set a display name and view their account email.
- A protected route redirects an unauthenticated visitor to `/sign-in` and
  retains the original route as a same-origin return target.

## Scope Decisions

- A score record references `songs.id`. The catalog row retains its identity
  when a source sync retires a chart, so history remains joinable. Difficulty
  is copied into the record as a required snapshot because a song has one
  catalog row per difficulty and its catalog metadata may later change.
- A manual record contains exactly `song_id`, `difficulty`, `score`,
  `clear_status`, `date_taken`, and timestamps. Potential, source images, OCR
  metadata, corrections, soft deletion, and notes are deferred.
- Records are append-only. Phase 1 exposes neither edit nor delete controls;
  an incorrect entry is retained as history and can be superseded by a new
  record.
- All dates are date-only values (`YYYY-MM-DD`), not timestamps. They represent
  the player's local calendar date and avoid accidental timezone shifts.
- Statistics are calculated from the authenticated user's records in the
  client from the already loaded, RLS-scoped history. The initial release does
  not introduce public aggregate endpoints or database RPCs.

## Data Model

### `profiles`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `uuid` | Primary key; references `auth.users(id)` with cascade delete. |
| `display_name` | `text` | Nullable; trimmed non-empty value of at most 80 characters. |
| `created_at` | `timestamptz` | Defaults to `now()`. |
| `updated_at` | `timestamptz` | Defaults to `now()` and changes on update. |

A `security definer` signup trigger inserts a profile for each new `auth.users`
row. It initializes `display_name` from safe provider metadata when present;
the trigger trims, truncates to 80 characters, and converts an empty result to
`NULL`. The value is still user-editable. A database check requires every
non-null value to equal `btrim(display_name)` and have a character length from
1 through 80. The client must tolerate a temporarily missing profile after a
successful signup and retry the profile read instead of attempting to create an
arbitrary profile row.

### `score_records`

| Column | Type | Rules |
| --- | --- | --- |
| `id` | `bigint` | Generated primary key. |
| `user_id` | `uuid` | Required; references `auth.users(id)` with cascade delete. |
| `song_id` | `bigint` | Required; references `songs(id)` with restrict delete. |
| `difficulty` | `text` | Required catalog difficulty snapshot. |
| `score` | `integer` | Required; `0 <= score <= 10000000`. |
| `clear_status` | `text` | Required; controlled enum-like check. |
| `date_taken` | `date` | Required; cannot be later than database `current_date + 1`. |
| `created_at` | `timestamptz` | Defaults to `now()`; submission timestamp. |

`clear_status` is one of `Track Lost`, `Clear`, `Full Recall`, `Easy Clear`,
`Hard Clear`, `EX`, `EX+`, or `PM`. The selected status is user-reported and is
not inferred from the score because game modes and user intent can differ.

An insert trigger verifies that `song_id` exists, is active, and that
`difficulty` exactly matches that song row. This prevents malformed client
submissions from pairing one song row with another difficulty or recording a
chart retired after the form loaded. An index on `(user_id, date_taken desc,
created_at desc, id desc)` supports history, and `(user_id, song_id,
difficulty, date_taken, created_at, id)` supports per-chart comparisons.

### Catalog-retirement compatibility

Add `is_active boolean NOT NULL DEFAULT true` to `songs`. A complete catalog
sync marks rows absent from its validated source snapshot inactive instead of
deleting them. Its upsert marks source-present rows active again. Public catalog
queries and cache refreshes select only active rows, while history joins include
inactive rows. The entry form offers active rows only. This preserves score
history and allows a retired chart to be restored if it reappears in the source.
All source-snapshot, reconciliation, regression-check, dataset-hash, and
post-publish verification reads operate on active rows only. A reactivated row
is included with its current source metadata in the next snapshot.

## Authorization and RLS

- Enable RLS on both tables. Existing `songs` policies remain unchanged.
- `profiles` select: `USING ((select auth.uid()) = id)`; update: both
  `USING ((select auth.uid()) = id)` and `WITH CHECK ((select auth.uid()) =
  id)`. Users cannot insert or delete profiles directly.
- `score_records` select: `USING ((select auth.uid()) = user_id)`; insert:
  `WITH CHECK ((select auth.uid()) = user_id)`. There are no update or delete
  policies.
- The authenticated API is append-only: RLS creates no update or delete policy.
  The database does not reject privileged deletes so `ON DELETE CASCADE` can
  remove a user's records when Supabase deletes their auth user. Privileged
  maintenance is outside the product API and must be audited operationally.
- The profile trigger is `security definer`, has a fixed `search_path`, and is
  executable only by its owner. It is the only privileged profile-creation
  path.
- The browser receives only `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_ANON_KEY`. Service-role credentials are never added to Vite
  variables, browser code, or repository files.

## Client Data and Validation

- The auth provider is a single React context exposing session, user, profile,
  loading state, sign-in, sign-up, reset-password, OAuth, and sign-out actions.
- React Query keys include the authenticated user ID. Query caches are cleared
  on auth transitions to prevent a previous account's history appearing during
  a shared-browser account switch. Mutations capture their initiating user ID
  and only navigate or show success after completion if that user remains the
  active user.
- Score history queries select the score record plus its catalog song fields.
  RLS is the authorization boundary; a client `user_id` predicate is optional
  for query efficiency but never relied on for isolation.
- The entry form validates required song/difficulty pairing, integer score,
  allowed status, and date before submission. Database checks duplicate this
  validation. It accepts ASCII commas and spaces as digit grouping only; signs,
  decimals, Unicode digits, and every other separator are invalid.
- The client prevents dates after the user's local calendar date. The database
  permits `current_date + 1` because a UTC+14 user can legitimately be one day
  ahead of its UTC session; it still rejects dates farther in the future.
- Improvement is calculated after ordering each chart's records by
  `date_taken`, then `created_at`, then `id`, and comparing each record to its
  immediate predecessor. Entries from the same day are ordered by submission
  time and primary key.
- Statistics include every submitted record, including lower or duplicate
  scores. Best-score values use the maximum score per chart only where labeled
  as best. Before loading history, the client obtains one database-time
  `snapshot_created_at` from a security-invoker RPC that returns no user data.
  History is fetched exhaustively in 500-row keyset pages where
  `created_at <= snapshot_created_at`, ordered by `date_taken DESC, created_at
  DESC, id DESC`. Each page after the first requests a tuple strictly below the
  preceding page's final `(date_taken, created_at, id)`. Scores created after
  the snapshot are visible on the next refresh, never duplicated or skipped in
  the in-progress load. A failed later page leaves the prior data unrendered and
  exposes a retry state rather than partial totals.

## Edge Cases

| Situation | Behavior |
| --- | --- |
| New user has no history | Show an explicit empty state with `Add score`; all aggregates show zero or `--` rather than `NaN`. |
| Authenticated user opens a protected URL with an expired session | Redirect to sign-in; after successful auth, return to the safe internal path. |
| OAuth is not configured | Do not render a Google button. Email/password remains available. |
| Signup requires email confirmation | Show a confirmation message and do not assume a session exists until the link is followed. |
| Profile trigger is briefly delayed | Render the account from auth metadata and retry profile fetch; do not fail authentication. |
| Password-recovery link is invalid, expired, reused, or opened without a recovery session | Show a safe error and offer a new reset request; never show a password form without the recovery session. |
| Song catalog has not loaded in the entry form | Disable chart selection and saving, with a loading or retry state. |
| Song difficulty changes after an older record was saved | Preserve the record's difficulty snapshot; the form only offers currently cataloged charts. |
| Source sync retires a chart referenced by history | Keep its catalog row inactive; show it in existing history but exclude it from the public catalog and new-entry selector. |
| A selected chart retires before save | The insert trigger rejects it as inactive; retain form values and prompt the user to refresh their chart selection. |
| Multiple submissions for one chart on one day | Preserve all rows and order their improvement calculation by `created_at`, then `id`. |
| User's device has a different timezone | `date_taken` is stored as the literal selected calendar date; timestamps use database time. |
| User selects a future date or an out-of-range score | Client rejects dates after local today; database rejects values later than UTC `current_date + 1` and invalid scores. |
| A user tampers with a submitted `song_id`/difficulty pair | The insert trigger rejects it. |
| User attempts to alter or delete a historical record through the API | RLS denies the operation. |
| User deletes their account | Supabase's auth-user deletion cascades to profiles and score records; no record-delete trigger blocks it. |
| A session changes while a mutation is in flight | Clear user-scoped caches on the auth event; the server's RLS check accepts or rejects the mutation based on the request token. |
| A mutation from an old session succeeds after account switch | Do not navigate or show a success toast unless its initiating user is still active. |
| A later page of history fails | Do not calculate partial totals; retain a retryable error state until all pages load. |
| A score is added while history is loading | The keyset query excludes it using the captured database-time snapshot; it appears after refresh without shifting or duplicating loaded pages. |

## Non-Goals

- Video bookmarks, images, uploads, OCR, extraction jobs, and provider keys.
- Social features, public profiles, sharing, or cross-user statistics.
- Editing, deleting, deduplicating, or importing score history.
- Advanced charts, potential/rating tracking, and server-side aggregation RPCs.

## Verification

- Add unit tests for score normalization, score/status/date validation,
  aggregation, best-score selection, and same-day improvement ordering.
- Add component tests for signed-out redirects, form validation, successful
  submission, recovery completion, and loading/empty/error states.
- Add a local Supabase CLI project and pgTAP database tests, run with
  `supabase test db`. The fixtures create two `auth.users` rows, set JWT claims
  with `set_config('request.jwt.claim.sub', ..., true)`, exercise policies as
  `authenticated`, and roll back each test transaction. CI runs this command
  against the local stack. Tests verify cross-user RLS isolation, immutable
  score records through the authenticated API, profile ownership, invalid
  song/difficulty rejection including inactive charts, profile-name constraints,
  account-deletion cascade, UTC-12/UTC+14 date boundaries, keyset pagination
  with an insert between pages, and a referenced chart becoming inactive after
  sync. Include consecutive retirement and reactivation syncs.
- Run `npm run lint` and `npm run build`.
- Manually verify anonymous catalog access, email/password account flow,
  account switching, desktop history, and mobile score entry.
