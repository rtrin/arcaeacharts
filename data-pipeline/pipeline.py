#!/usr/bin/env python3
"""Validate and publish a complete Miraheze song catalog."""

import hashlib
import json
import logging
import math
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from supabase import Client, create_client  # pylint: disable=import-error
try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None

from scraper import (
    SUPPORTED_DIFFICULTIES,
    ScrapeError,
    scrape_chart_designers,
    scrape_song_catalog,
    scrape_song_pages,
)

SNAPSHOT_DIR = Path(os.environ.get("SONG_SNAPSHOT_DIR", "snapshots"))
MIN_LINK_COUNT = int(os.environ.get("SONG_MIN_LINK_COUNT", "100"))
MAX_FAILURE_RATIO = float(os.environ.get("SONG_MAX_FAILURE_RATIO", "0.05"))
REQUIRED_DIFFICULTIES = {"Future", "Eternal", "Beyond"}

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


def _load_env():
    """Load .env when python-dotenv is available."""
    if load_dotenv:
        load_dotenv()


def _get_supabase_credentials():
    """Return Supabase credentials from the environment."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.")
    return url, key


def get_supabase_client() -> Client:
    """Create a Supabase client."""
    return create_client(*_get_supabase_credentials())


def _parse_level(value):
    """Extract the leading integer from a level string."""
    match = re.match(r"\s*(\d+)", str(value or ""))
    return int(match.group(1)) if match else None


def _normalize_row(row, charter_lookup):
    """Normalize one scraper row to the songs table shape."""
    title = re.sub(r"\s+", " ", str(row.get("song") or "")).strip()
    artist = re.sub(r"\s+", " ", str(row.get("artist") or "")).strip()
    difficulty = str(row.get("difficulty") or "").strip()
    level = _parse_level(row.get("level"))
    try:
        constant = float(row.get("chart_constant"))
    except (TypeError, ValueError):
        constant = None
    if constant is not None and (not math.isfinite(constant) or constant > 13):
        constant = None
    version = str(row.get("version") or "").strip()
    key = (title.casefold(), difficulty)
    charter = row.get("charter") or charter_lookup.get(key)
    return {
        "title": title,
        "artist": artist,
        "difficulty": difficulty,
        "constant": constant,
        "level": level,
        "version": version,
        "charter": charter,
    }


def _normalize_rows(rows, charter_lookup):
    """Normalize, validate, and deduplicate scraped rows."""
    unique_rows = {}
    errors = []
    for index, row in enumerate(rows):
        normalized = _normalize_row(row, charter_lookup)
        key = (normalized["title"], normalized["artist"], normalized["difficulty"])
        if normalized["difficulty"] not in SUPPORTED_DIFFICULTIES:
            continue
        missing = [
            field for field in ("title", "artist", "difficulty", "level", "version")
            if not normalized[field]
        ]
        if normalized["constant"] is None or normalized["level"] is None:
            missing.append("constant/level")
        if missing:
            errors.append({"row": index, "fields": missing, "data": normalized})
            continue
        previous = unique_rows.get(key)
        if previous and previous != normalized:
            errors.append({"row": index, "error": "conflicting duplicate", "data": normalized})
            continue
        unique_rows[key] = normalized
    return list(unique_rows.values()), errors


def _snapshot_path(name):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return SNAPSHOT_DIR / name


def _write_snapshot(snapshot, successful):
    """Persist diagnostics even when the run fails validation."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    path = _snapshot_path(f"song-sync-{timestamp}.json")
    path.write_text(json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8")
    if successful:
        _snapshot_path("last-successful.json").write_text(
            json.dumps(snapshot, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    logger.info("Wrote %s snapshot to %s", "successful" if successful else "failed", path)


def _dataset_hash(rows):
    payload = json.dumps(rows, sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _validate_catalog(links, failures, rows, errors):
    """Return validation errors for a candidate crawl."""
    validation_errors = []
    if len(links) < MIN_LINK_COUNT:
        validation_errors.append(f"Only {len(links)} song links found; minimum is {MIN_LINK_COUNT}")
    failure_ratio = len(failures) / len(links) if links else 1
    if failure_ratio > MAX_FAILURE_RATIO:
        validation_errors.append(
            f"Detail-page failure ratio {failure_ratio:.2%} exceeds {MAX_FAILURE_RATIO:.2%}"
        )
    if not rows:
        validation_errors.append("No valid supported song rows were produced")
    present = {row["difficulty"] for row in rows}
    missing = REQUIRED_DIFFICULTIES - present
    if missing:
        validation_errors.append(f"Missing required difficulty rows: {sorted(missing)}")
    if errors:
        validation_errors.append(f"{len(errors)} row validation errors")
    return validation_errors


def _publish_rows(supabase, rows, source_revision, snapshot):
    """Stage rows and atomically publish them through the database function."""
    run_id = str(uuid4())
    supabase.table("song_sync_runs").insert(
        {
            "id": run_id,
            "status": "staged",
            "source_revision": str(source_revision or ""),
            "row_count": len(rows),
            "dataset_hash": snapshot["dataset_hash"],
            "details": snapshot,
        }
    ).execute()
    staged_rows = [{"run_id": run_id, **row} for row in rows]
    for start in range(0, len(staged_rows), 100):
        supabase.table("song_sync_staging").insert(staged_rows[start:start + 100]).execute()
    supabase.rpc("publish_song_sync", {"p_run_id": run_id}).execute()
    logger.info("Published %d rows from sync run %s", len(rows), run_id)


def run_pipeline():
    """Run the complete scrape, validation, snapshot, and publish flow."""
    snapshot: dict[str, object] = {
        "source_url": "https://arcaea.miraheze.org/wiki/Song_list",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "failed",
    }
    try:
        links, source_revision = scrape_song_catalog()
        snapshot["source_revision"] = source_revision or ""
        snapshot["discovered_link_count"] = len(links)
        logger.info("Discovered %d song links from Miraheze.", len(links))

        rows, failures = scrape_song_pages(links)
        snapshot["failed_pages"] = failures
        snapshot["failed_page_count"] = len(failures)

        charter_lookup = {}
        try:
            charter_lookup = scrape_chart_designers()
        except ScrapeError as error:  # Charter is enrichment, not a publish blocker.
            snapshot["charter_error"] = str(error)
            logger.warning("Charter enrichment failed: %s", error)

        normalized_rows, row_errors = _normalize_rows(rows, charter_lookup)
        validation_errors = _validate_catalog(links, failures, normalized_rows, row_errors)
        counts = {difficulty: 0 for difficulty in sorted(SUPPORTED_DIFFICULTIES)}
        for row in normalized_rows:
            counts[row["difficulty"]] += 1
        snapshot.update(
            {
                "successful_page_count": len(links) - len(failures),
                "row_count": len(normalized_rows),
                "row_counts_by_difficulty": counts,
                "validation_errors": validation_errors,
                "row_errors": row_errors,
                "dataset_hash": _dataset_hash(normalized_rows),
            }
        )
        if validation_errors:
            raise ScrapeError("; ".join(validation_errors))

        supabase = get_supabase_client()
        _publish_rows(supabase, normalized_rows, source_revision, snapshot)
        snapshot["status"] = "success"
        _write_snapshot(snapshot, successful=True)
    except Exception as error:
        snapshot["error"] = str(error)
        _write_snapshot(snapshot, successful=False)
        logger.error("Pipeline failed: %s", error)
        raise


def main():
    """CLI entry point."""
    _load_env()
    try:
        run_pipeline()
    except Exception as error:
        logger.error("Pipeline failed: %s", error)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
