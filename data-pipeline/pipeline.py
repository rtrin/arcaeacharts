#!/usr/bin/env python3
"""
Full sync pipeline: scrape Songs by Level, filter to Future/Eternal/Beyond, upsert into songs table.

Credentials from env: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (required for writes).
"""

import logging
import os
import re
import sys

from supabase import create_client, Client  # pylint: disable=import-error
from scraper import (
    scrape_songs_by_level, fetch_song, scrape_news_links, filter_song_pages,
    scrape_chart_designers,
)

# -----------------------------------------------------------------------------
# Env & Config
# -----------------------------------------------------------------------------

def _load_env() -> None:
    
    """Load .env via python-dotenv when available."""
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

def _get_supabase_credentials() -> tuple[str, str]:
    """Return (url, key) from env."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError(
            "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set."
        )
    return url, key

_load_env()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

def _parse_level(level_str: str) -> int | None:
    """Extract the leading integer from a level string (e.g. '9+' → 9)."""
    if not level_str:
        return None
    match = re.match(r"(\d+)", level_str)
    return int(match.group(1)) if match else None


def get_supabase_client() -> Client:
    """Create and return Supabase client using env credentials."""
    url, key = _get_supabase_credentials()
    return create_client(url, key)


def run_pipeline() -> None:
    """Run sync: scrape songs by level, upsert to DB (metadata only)."""
    supabase = get_supabase_client()

    # 1. Scrape Songs by Level
    rows = scrape_songs_by_level()
    if not rows:
        logger.error("No rows from scrape. Exiting.")
        return

    # 1b. Gap Check (News Section Songs vs Songs_by_Level)
    # Automatically scrape song links from the News section and check for missing songs.
    
    logger.info("Scraping News section for new songs...")
    try:
        # Get all page links from News section
        news_page_titles = scrape_news_links()
        
        # Filter to only song pages using API
        song_titles = filter_song_pages(news_page_titles)
        
        if not song_titles:
            logger.info("No song pages found in News section.")
        else:
            # Normalize existing titles for comparison
            existing_titles_csv = set((r.get("song") or "").strip().lower() for r in rows)
            
            # Find missing songs
            missing_titles = []
            for title in song_titles:
                # Normalize for comparison (replace underscores, lowercase)
                norm_title = title.replace("_", " ").strip().lower()
                if norm_title not in existing_titles_csv:
                    missing_titles.append(title)
            
            logger.info(f"Found {len(missing_titles)} new songs from News section.")
            
            # Fetch missing songs
            fetched_count = 0
            for m_title in missing_titles:
                new_entries = fetch_song(m_title)
                if new_entries:
                    logger.info(f"Added new song: {m_title}")
                    rows.extend(new_entries)
                    fetched_count += 1
                else:
                    logger.warning(f"Could not parse data for {m_title}")
                    
            logger.info(f"Added {fetched_count} new songs from News section.")
        
    except Exception as e:
        logger.error(f"News section scraping failed: {e}")
        # We continue with what we have

    # 1c. Scrape chart designer names
    charter_lookup = {}
    try:
        charter_lookup = scrape_chart_designers()
        logger.info("Loaded %d charter entries.", len(charter_lookup))
    except Exception as e:
        logger.error(f"Charter scraping failed: {e}")

    # 2. Build rows for upsert (Metadata Only)
    unique_rows = {}  # (title, artist, difficulty) -> row_dict
    
    for row in rows:
        # Standardize fields
        const_val = row.get("chart_constant")
        if const_val in [None, "", "-"]:
             const_val = None
        else:
             try:
                 const_val = float(const_val)
             except (ValueError, TypeError):
                 const_val = None

        # Exclude songs with constant > 13 per user request
        if const_val is not None and const_val > 13:
            continue

        r = {
            "title": (row.get("song") or "").strip(),
            "artist": (row.get("artist") or "").strip(),
            "difficulty": (row.get("difficulty") or "").strip(),
            "constant": const_val,
            "level": _parse_level((row.get("level") or "").strip()),
            "version": (row.get("version") or "").strip(),
        }
        if r["difficulty"] not in {"Future", "Eternal", "Beyond"}:
            continue
        norm_title = r["title"].strip().lower()
        r["charter"] = charter_lookup.get((norm_title, r["difficulty"]))
        key = (r["title"], r["artist"], r["difficulty"])
        unique_rows[key] = r

    db_rows = list(unique_rows.values())

    # Filter out rows with null chart constants before upload
    pre_filter_count = len(db_rows)
    db_rows = [r for r in db_rows if r["constant"] is not None]
    null_filtered = pre_filter_count - len(db_rows)
    if null_filtered:
        logger.info("Excluded %d rows with null chart constant.", null_filtered)
    
    # 3. Upsert into Supabase
    batch_size = 100
    total = 0
    for i in range(0, len(db_rows), batch_size):
        batch = db_rows[i : i + batch_size]
        supabase.table("songs").upsert(
            batch,
            on_conflict="title,artist,difficulty",
            ignore_duplicates=False, # Update existing
        ).execute()
        total += len(batch)
        logger.info("Upserted rows %d-%d", i + 1, total)
    logger.info("Done. Upserted %d rows into songs table.", total)


def main() -> int:
    """CLI entry point."""
    try:
        run_pipeline()
        return 0
    except Exception as err:
        logger.error("Pipeline failed: %s", err)
        raise SystemExit(1) from err


if __name__ == "__main__":
    raise SystemExit(main())
