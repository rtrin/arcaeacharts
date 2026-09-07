# Charter (Chart Designer) Scraping

## Goal

Scrape chart designer names from the [Chart_Designers](https://arcaea.fandom.com/wiki/Chart_Designers) wiki page and store them in the Supabase `songs` table alongside existing song data. Only Future, Eternal, and Beyond difficulties are relevant.

## Data Source

The Chart_Designers page contains ~28 designer sections, each with a `table.article-table` containing columns: Song, Name, Notes.

- **Song**: Wiki-linked song title, sometimes with `rowspan` for multi-difficulty entries
- **Name**: Stylized charter name (stored as-is, e.g., "N↑TRO", "TO4STER")
- **Notes**: Difficulty abbreviations (`FTR`, `BYD`, `ETR`, `PST/PRS/FTR`) and optional collaboration info. Empty means all difficulties.

## Architecture

### New function: `scraper.scrape_chart_designers()`

1. Fetch `Chart_Designers` via `fetch_page_via_api()`
2. Select all `table.article-table` tables
3. For each row, handle `rowspan` state for the Song column
4. Parse Notes column for difficulty abbreviations:
   - Strip non-difficulty text (e.g., "; joint work with..." → just the abbreviation part)
   - Map: `FTR→Future`, `ETR→Eternal`, `BYD→Beyond`. Skip `PST`/`PRS`.
   - Empty Notes → all of `{Future, Eternal, Beyond}`
5. Return `dict[(normalized_title, difficulty)] → charter_name`
6. Normalization: `.strip().lower()` (matches existing gap-check pattern)

### Pipeline integration

1. Call `scrape_chart_designers()` once after scraping songs
2. In the row loop, after difficulty filter: `r["charter"] = lookup.get((norm_title, r["difficulty"]))`
3. Unmatched songs get `charter = None`

### Supabase migration

```sql
ALTER TABLE songs ADD COLUMN IF NOT EXISTS charter text;
```

Nullable text, no constraint. Upsert conflict key unchanged: `(title, artist, difficulty)`.

## Files Changed

| File | Change |
|------|--------|
| `scraper.py` | Add `scrape_chart_designers()` + `DIFF_ABBREV_MAP` constant |
| `pipeline.py` | Import `scrape_chart_designers`, enrich rows, add `charter` to upsert dict |
| `supabase/migrations/001_add_charter_column.sql` | New file |
| `README.md` | Update mermaid diagram |

## Edge Cases

- **Rowspan**: Song cell spans multiple rows for different charters per difficulty. Track current song title across rows.
- **Stylized names**: Stored as-is from the Name column.
- **Collaborative notes**: "FTR; joint work with X" → extract "FTR" before the semicolon, charter is the Name column value (not the collaborator).
- **No match**: Songs in `songs` table without a Chart_Designers entry get `charter = NULL`.
