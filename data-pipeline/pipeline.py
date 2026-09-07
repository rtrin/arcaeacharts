#!/usr/bin/env python3
"""Validate and publish a complete Miraheze song catalog."""

import hashlib
import json
import logging
import os
import re
import sys
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import TYPE_CHECKING
from uuid import uuid4

if TYPE_CHECKING:
    from supabase import Client

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
PUBLISHED_FIELDS = ("title", "artist", "difficulty", "level", "constant", "version", "charter")
DATABASE_FIELDS = ",".join(PUBLISHED_FIELDS)

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


def get_supabase_client() -> "Client":
    """Create a Supabase client."""
    # Keep the SDK import at the production boundary so pure normalization and
    # reconciliation tests do not require its native dependencies at import time.
    from supabase import create_client  # pylint: disable=import-outside-toplevel,import-error

    return create_client(*_get_supabase_credentials())


def _parse_constant(value):
    """Parse a finite source constant without introducing binary rounding."""
    if value is None or isinstance(value, bool):
        return None
    try:
        constant = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    if not constant.is_finite() or constant < Decimal("0") or constant > Decimal("13"):
        return None
    return constant


def _parse_level(value, constant=None):
    """Preserve an explicit level and repair only absent or malformed legacy values."""
    text = str(value or "").strip()
    match = re.fullmatch(r"(\d+)\s*(\+)?", text)
    if match:
        return f"{match.group(1)}+" if match.group(2) else match.group(1)
    if constant is None:
        return None
    level = int(constant)
    fraction = constant - Decimal(level)
    if Decimal("0.7") <= fraction < Decimal("1.0"):
        return f"{level}+"
    return None


def _normalize_row(row, charter_lookup):
    """Normalize one scraper row while retaining its source identity."""
    title = re.sub(r"\s+", " ", str(row.get("song") or "")).strip()
    artist = re.sub(r"\s+", " ", str(row.get("artist") or "")).strip()
    difficulty = str(row.get("difficulty") or "").strip()
    constant = _parse_constant(row.get("chart_constant"))
    level = _parse_level(row.get("level"), constant)
    version = str(row.get("version") or "").strip()
    key = (title.casefold(), difficulty)
    charter = str(row.get("charter") or charter_lookup.get(key) or "").strip() or None
    normalized = {
        "title": title,
        "artist": artist,
        "difficulty": difficulty,
        "constant": constant,
        "level": level,
        "version": version,
        "charter": charter,
    }
    normalized.update(
        {
            "source_page_title": str(row.get("source_page_title") or ""),
            "source_url": str(row.get("source_url") or ""),
            "source_revision": str(row.get("source_revision") or ""),
        }
    )
    normalized["row_hash"] = _row_hash(normalized)
    return normalized


def _normalize_rows(rows, charter_lookup):
    """Normalize, validate, and deduplicate scraped rows."""
    unique_rows = {}
    errors = []
    warnings = []
    for index, row in enumerate(rows):
        normalized = _normalize_row(row, charter_lookup)
        key = (normalized["title"], normalized["artist"], normalized["difficulty"])
        if normalized["difficulty"] not in SUPPORTED_DIFFICULTIES:
            continue
        if row.get("diagnostics"):
            warnings.extend({"row": index, **diagnostic} for diagnostic in row["diagnostics"])
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
        if previous and previous["row_hash"] != normalized["row_hash"]:
            warnings.append(
                {
                    "row": index,
                    "warning": "duplicate chart variant; source values conflict",
                    "previous": previous,
                    "data": normalized,
                }
            )
            errors.append({"row": index, "error": "conflicting duplicate", "data": normalized})
            continue
        unique_rows[key] = normalized
    normalized_rows = list(unique_rows.values())
    inscribed_keys = {
        (row["title"], row["artist"])
        for row in normalized_rows
        if row["difficulty"] == "Inscribed"
    }
    normalized_rows = [
        row for row in normalized_rows
        if not (row["difficulty"] == "Beyond" and (row["title"], row["artist"]) in inscribed_keys)
    ]
    return normalized_rows, errors, warnings


def _snapshot_path(name):
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    return SNAPSHOT_DIR / name


def _json_value(value):
    """Convert Decimal values and nested rows into stable JSON values."""
    if isinstance(value, Decimal):
        return format(value.normalize(), "f")
    if isinstance(value, dict):
        return {key: _json_value(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_json_value(item) for item in value]
    return value


def _published_row(row):
    return {field: row.get(field) for field in PUBLISHED_FIELDS}


def _row_hash(row):
    payload = json.dumps(
        _json_value(_published_row(row)), sort_keys=True, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _row_key(row):
    return row["title"], row["artist"], row["difficulty"]


def _write_snapshot(snapshot, successful):
    """Persist diagnostics even when the run fails validation."""
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    path = _snapshot_path(f"song-sync-{timestamp}.json")
    serialized = json.dumps(_json_value(snapshot), indent=2, ensure_ascii=False)
    path.write_text(serialized, encoding="utf-8")
    if successful:
        _snapshot_path("last-successful.json").write_text(serialized, encoding="utf-8")
    logger.info("Wrote %s snapshot to %s", "successful" if successful else "failed", path)


def _dataset_hash(rows):
    ordered = sorted((_published_row(row) for row in rows), key=_row_key)
    payload = json.dumps(_json_value(ordered), sort_keys=True, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _database_row(row):
    """Normalize a Supabase row into the candidate comparison representation."""
    normalized = {
        "title": re.sub(r"\s+", " ", str(row.get("title") or "")).strip(),
        "artist": re.sub(r"\s+", " ", str(row.get("artist") or "")).strip(),
        "difficulty": str(row.get("difficulty") or "").strip(),
        "constant": _parse_constant(row.get("constant")),
        "level": str(row.get("level") or "").strip(),
        "version": str(row.get("version") or "").strip(),
        "charter": str(row.get("charter") or "").strip() or None,
    }
    normalized["row_hash"] = _row_hash(normalized)
    return normalized


def _read_database_rows(supabase):
    rows = []
    offset = 0
    page_size = 1000
    while True:
        response = (
            supabase.table("songs")
            .select(DATABASE_FIELDS)
            .order("title")
            .order("artist")
            .order("difficulty")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        page = response.data or []
        rows.extend(page)
        if len(page) < page_size:
            break
        offset += page_size
    return [_database_row(row) for row in rows]


def _reconcile_rows(candidate_rows, database_rows):
    """Build a key-level diff between the complete candidate and current catalog."""
    candidate = {_row_key(row): row for row in candidate_rows}
    current = {_row_key(row): row for row in database_rows}
    added = [candidate[key] for key in sorted(candidate.keys() - current.keys())]
    changed = [candidate[key] for key in sorted(candidate.keys() & current.keys())
               if candidate[key]["row_hash"] != current[key]["row_hash"]]
    unchanged = [candidate[key] for key in sorted(candidate.keys() & current.keys())
                 if candidate[key]["row_hash"] == current[key]["row_hash"]]
    stale = [current[key] for key in sorted(current.keys() - candidate.keys())]
    inscribed_pairs = {(row["title"], row["artist"]) for row in candidate_rows
                       if row["difficulty"] == "Inscribed"}
    replaced = [row for row in stale if row["difficulty"] == "Beyond"
                and (row["title"], row["artist"]) in inscribed_pairs]
    return {
        "added": added,
        "changed": changed,
        "unchanged": unchanged,
        "stale": stale,
        "replaced": replaced,
        "deleted": stale,
    }


def _diff_summary(diff):
    return {key: len(value) for key, value in diff.items()}


def _empty_diff():
    return {key: [] for key in ("added", "changed", "unchanged", "stale", "replaced", "deleted")}


def _write_artifacts(snapshot, rows, diff):
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    candidate_path = _snapshot_path(f"song-sync-{timestamp}.candidate.json")
    diff_path = _snapshot_path(f"song-sync-{timestamp}.diff.json")
    candidate_path.write_text(json.dumps(_json_value(rows), indent=2, ensure_ascii=False), encoding="utf-8")
    diff_path.write_text(json.dumps(_json_value(diff), indent=2, ensure_ascii=False), encoding="utf-8")
    snapshot["candidate_artifact"] = str(candidate_path)
    snapshot["diff_artifact"] = str(diff_path)


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


def _validate_difficulty_regression(candidate_rows, database_rows):
    """Prevent a complete-looking crawl from silently losing a difficulty."""
    candidate_difficulties = {row["difficulty"] for row in candidate_rows}
    current_difficulties = {row["difficulty"] for row in database_rows}
    missing = sorted(current_difficulties - candidate_difficulties)
    return [f"Candidate unexpectedly lost existing difficulties: {missing}"] if missing else []


def _publish_rows(  # pylint: disable=too-many-arguments,too-many-positional-arguments
    supabase, run_id, rows, source_revision, snapshot, complete_crawl
):
    """Stage rows and atomically publish them through the database function."""
    snapshot["run_id"] = run_id
    supabase.table("song_sync_runs").insert(
        {
            "id": run_id,
            "status": "staged",
            "source_revision": str(source_revision or ""),
            "row_count": len(rows),
            "dataset_hash": snapshot["dataset_hash"],
            "diff_summary": snapshot.get("diff_summary", {}),
            "details": _json_value(snapshot),
        }
    ).execute()
    staged_rows = [
        {
            "run_id": run_id,
            **_published_row(row),
            "source_page_title": row["source_page_title"],
            "source_url": row["source_url"],
            "source_revision": row["source_revision"],
            "row_hash": row["row_hash"],
        }
        for row in rows
    ]
    for row in staged_rows:
        if isinstance(row["constant"], Decimal):
            row["constant"] = float(row["constant"])
    for start in range(0, len(staged_rows), 100):
        supabase.table("song_sync_staging").insert(staged_rows[start:start + 100]).execute()
    supabase.rpc(
        "publish_song_sync", {"p_run_id": run_id, "p_complete": complete_crawl}
    ).execute()
    logger.info("Published %d rows from sync run %s", len(rows), run_id)
    return run_id


def _verification_mismatches(candidate_rows, database_rows, complete_crawl):
    candidate = {_row_key(row): row for row in candidate_rows}
    database = {_row_key(row): row for row in database_rows}
    mismatches = []
    keys = sorted(database.keys()) if complete_crawl else sorted(candidate.keys())
    if complete_crawl:
        for key in sorted(candidate.keys() - database.keys()):
            mismatches.append({"key": key, "source": candidate[key], "stored": None})
        for key in sorted(database.keys() - candidate.keys()):
            mismatches.append({"key": key, "source": None, "stored": database[key]})
    else:
        for key in sorted(candidate.keys() - database.keys()):
            mismatches.append({"key": key, "source": candidate[key], "stored": None})
    for key in keys:
        source = candidate.get(key)
        stored = database.get(key)
        if source is None or stored is None:
            continue
        differing_fields = {
            field: {"source": source.get(field), "stored": stored.get(field)}
            for field in PUBLISHED_FIELDS
            if _json_value(source.get(field)) != _json_value(stored.get(field))
        }
        if differing_fields:
            mismatches.append({"key": key, "fields": differing_fields})
    return mismatches


def _update_run(supabase, run_id, status, snapshot):
    supabase.table("song_sync_runs").update(
        {
            "status": status,
            "post_publish_hash": snapshot.get("post_publish_database_hash"),
            "verification_status": snapshot.get("verification_status"),
            "details": _json_value(snapshot),
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
    ).eq("id", run_id).execute()


def run_pipeline():  # pylint: disable=too-many-locals,too-many-statements
    """Run the complete scrape, validation, snapshot, and publish flow."""
    snapshot: dict[str, object] = {
        "source_url": "https://arcaea.miraheze.org/wiki/Song_list",
        "started_at": datetime.now(timezone.utc).isoformat(),
        "status": "failed",
    }
    run_id = None
    supabase = None
    try:
        links, source_revision = scrape_song_catalog()
        snapshot["source_revision"] = source_revision or ""
        snapshot["source_fetched_at"] = datetime.now(timezone.utc).isoformat()
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

        normalized_rows, row_errors, row_warnings = _normalize_rows(rows, charter_lookup)
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
                "row_warnings": row_warnings,
                "dataset_hash": _dataset_hash(normalized_rows),
            }
        )
        if validation_errors:
            empty_diff = _empty_diff()
            snapshot["diff_summary"] = _diff_summary(empty_diff)
            _write_artifacts(snapshot, normalized_rows, empty_diff)
            raise ScrapeError("; ".join(validation_errors))

        supabase = get_supabase_client()
        database_rows = _read_database_rows(supabase)
        diff = _reconcile_rows(normalized_rows, database_rows)
        snapshot["diff_summary"] = _diff_summary(diff)
        snapshot["source_complete"] = not failures
        validation_errors.extend(_validate_difficulty_regression(normalized_rows, database_rows))
        diff["deleted"] = diff["stale"] if not failures and not validation_errors else []
        snapshot["diff_summary"] = _diff_summary(diff)
        snapshot["validation_errors"] = validation_errors
        _write_artifacts(snapshot, normalized_rows, diff)
        if snapshot["validation_errors"]:
            raise ScrapeError("; ".join(snapshot["validation_errors"]))

        run_id = str(uuid4())
        _publish_rows(
            supabase, run_id, normalized_rows, source_revision, snapshot, complete_crawl=not failures
        )
        database_rows = _read_database_rows(supabase)
        snapshot["post_publish_database_hash"] = _dataset_hash(database_rows)
        mismatches = _verification_mismatches(normalized_rows, database_rows, not failures)
        hash_matches = snapshot["dataset_hash"] == snapshot["post_publish_database_hash"]
        snapshot["database_hash_matches_candidate"] = hash_matches if not failures else None
        if not hash_matches and not failures:
            mismatches.append(
                {
                    "type": "dataset_hash_mismatch",
                    "source": snapshot["dataset_hash"],
                    "stored": snapshot["post_publish_database_hash"],
                }
            )
        snapshot["row_mismatches"] = mismatches
        snapshot["verification_status"] = (
            "verified" if not mismatches and not failures
            else "verified_partial" if not mismatches
            else "mismatch"
        )
        if mismatches:
            _update_run(supabase, run_id, "failed", snapshot)
            raise ScrapeError(f"Post-publish verification found {len(mismatches)} mismatches")
        snapshot["status"] = "success"
        _update_run(supabase, run_id, "success", snapshot)
        _write_snapshot(snapshot, successful=True)
    except Exception as error:  # pylint: disable=broad-exception-caught
        snapshot["error"] = str(error)
        if run_id and supabase:
            snapshot["verification_status"] = snapshot.get("verification_status", "failed")
            try:
                _update_run(supabase, run_id, "failed", snapshot)
            except Exception as update_error:  # pylint: disable=broad-exception-caught
                logger.error("Failed to mark sync run %s as failed: %s", run_id, update_error)
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
