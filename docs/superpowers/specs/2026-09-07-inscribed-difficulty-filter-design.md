# Inscribed Difficulty Filter

## Goal

Add `Inscribed` as a selectable chart difficulty in the song browser, using
`INS` as its compact filter label and `#030E46` as its difficulty color.
This change is limited to the frontend and assumes Inscribed song data is
already available from Supabase.

## Existing Behavior

- `src/lib/song-utils.ts` owns the ordered `difficultyTypes` list and the
  `getDifficultyColor()` mapping.
- `src/pages/Index.tsx` renders one filter button per entry in
  `difficultyTypes`, derives the short label for known difficulties, and
  applies the mapped color to the button and song metadata.
- `src/hooks/useSongFilter.ts` already compares selected difficulty values as
  strings, so no filtering algorithm change is required.
- The `songs.difficulty` Supabase column and the `Song` types are already
  generic strings.

## Design

### Difficulty constants and color

Update `src/lib/song-utils.ts`:

1. Append `"Inscribed"` to `difficultyTypes`, preserving the existing button
   order and putting Inscribed after the currently supported difficulties.
2. Add an `"Inscribed"` case to `getDifficultyColor()` returning
   `"#030E46"`.

The existing default color remains unchanged for unknown values.

### Filter label

Update the label mapping in `src/pages/Index.tsx` so `"Inscribed"` renders as
`INS`. Keep the existing explicit mappings for `ETR`, `BYD`, and `FTR`; do not
replace the current UI pattern with a separate abstraction for one additional
case.

The existing selected/unselected button styles will be reused unchanged:

- Selected: `#030E46` background with white text.
- Unselected: transparent background with `#030E46` border and text.

### Data assumptions

No database migration or data-pipeline change is planned. The existing
`songs.difficulty` column and frontend `Song`/`SongSummary` types already use
string values, so the frontend can filter `Inscribed` rows without a schema
change. If the current Supabase dataset does not contain Inscribed rows, the
new control will still render but will return no results until the data is
available.

### Cache and API behavior

No cache or API changes are planned. Inscribed rows returned by Supabase will
flow through the existing local-storage summary cache and full-song fetch.
Chart View already passes the stored difficulty string through to the search
endpoint, so it will naturally receive `Inscribed` when used for an Inscribed
song.

## Files To Change

| File | Change |
|------|--------|
| `src/lib/song-utils.ts` | Add `Inscribed` to the difficulty list and color map. |
| `src/pages/Index.tsx` | Render `INS` for the Inscribed filter button. |

## Interaction and Accessibility

- The new button remains keyboard-focusable through the existing `Button`
  component.
- Its accessible name remains `INS`, matching the other compact difficulty
  controls.
- Verify the dark `#030E46` selected state remains readable with the existing
  white text and visible against the current light and dark themes.
- Selecting only Inscribed shows only Inscribed songs; selecting it with other
  difficulties uses the existing OR behavior; clearing all difficulty buttons
  restores all difficulties.

## Verification

1. Run `npm run lint`.
2. Run `npm run build`.
3. Manually verify the filter at desktop and mobile widths:
   - `INS` appears with the correct border/text color.
   - Selected `INS` uses `#030E46` and white text.
   - Inscribed-only and combined selections filter correctly.
   - Pagination resets after changing the selection.
4. If Inscribed rows are available in the existing dataset, verify cached and
   uncached app loads expose them to the filter.

## Risks and Decisions

- **Existing cached data:** Users with a valid 24-hour cache will not see newly
  available Inscribed rows until the normal cache refresh. No cache-version
  change is proposed because the cache schema is unchanged.
- **Color contrast:** `#030E46` is intentionally used as requested. The
  existing white selected text should be checked in the rendered button.
