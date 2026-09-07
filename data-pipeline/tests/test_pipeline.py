import unittest
from decimal import Decimal

from pipeline import (
    _dataset_hash,
    _normalize_rows,
    _parse_level,
    _reconcile_rows,
    _verification_mismatches,
)


def row(title, difficulty, level, constant, artist="Artist"):
    return {
        "song": title,
        "artist": artist,
        "difficulty": difficulty,
        "level": level,
        "chart_constant": constant,
        "version": "5.0",
        "charter": "Charter",
        "source_page_title": title,
        "source_url": f"https://arcaea.miraheze.org/wiki/{title}",
        "source_revision": "123",
    }


class PipelineTests(unittest.TestCase):
    def test_decimal_boundaries_and_explicit_plus_levels(self):
        self.assertEqual(_parse_level("", Decimal("8.7")), "8+")
        self.assertEqual(_parse_level("", Decimal("9.7")), "9+")
        self.assertEqual(_parse_level("", Decimal("10.7")), "10+")
        self.assertEqual(_parse_level("11+", Decimal("11.1")), "11+")
        self.assertEqual(_parse_level("8+", Decimal("8.1")), "8+")
        self.assertEqual(_parse_level("9+", Decimal("9.1")), "9+")
        self.assertEqual(_parse_level("10+", Decimal("10.1")), "10+")
        self.assertEqual(_parse_level("10", Decimal("10.7")), "10")

    def test_diff_identifies_added_changed_unchanged_stale_and_replaced(self):
        source, errors, _ = _normalize_rows(
            [
                row("Added", "Future", "10", "10.0"),
                row("Changed", "Future", "10+", "10.7"),
                row("Same", "Future", "9", "9.0"),
                row("DREAD AREA", "Inscribed", "11+", "11.8"),
            ],
            {},
        )
        current, current_errors, _ = _normalize_rows(
            [
                row("Changed", "Future", "10", "10.0"),
                row("Same", "Future", "9", "9.0"),
                row("DREAD AREA", "Beyond", "11", "11.0"),
                row("Stale", "Future", "8", "8.0"),
            ],
            {},
        )
        self.assertFalse(errors)
        self.assertFalse(current_errors)

        diff = _reconcile_rows(source, current)

        self.assertEqual([item["title"] for item in diff["added"]], ["Added", "DREAD AREA"])
        self.assertEqual([item["title"] for item in diff["changed"]], ["Changed"])
        self.assertEqual([item["title"] for item in diff["unchanged"]], ["Same"])
        self.assertEqual([item["title"] for item in diff["stale"]], ["DREAD AREA", "Stale"])
        self.assertEqual([item["title"] for item in diff["replaced"]], ["DREAD AREA"])

    def test_incomplete_verification_does_not_require_stale_deletion(self):
        candidate, _, _ = _normalize_rows([row("Current", "Future", "9", "9.0")], {})
        database, _, _ = _normalize_rows(
            [row("Current", "Future", "9", "9.0"), row("Old", "Future", "8", "8.0")], {}
        )

        self.assertFalse(_verification_mismatches(candidate, database, complete_crawl=False))
        self.assertTrue(_verification_mismatches(candidate, database, complete_crawl=True))

    def test_inscribed_removes_beyond_and_conflicting_duplicates_block(self):
        rows, errors, _ = _normalize_rows(
            [
                row("DREAD AREA", "Beyond", "11", "11.0"),
                row("DREAD AREA", "Inscribed", "11+", "11.8"),
            ],
            {},
        )
        self.assertFalse(errors)
        self.assertEqual([item["difficulty"] for item in rows], ["Inscribed"])

        _, duplicate_errors, _ = _normalize_rows(
            [row("Last", "Future", "10", "10.0"), row("Last", "Future", "10+", "10.7")],
            {},
        )
        self.assertEqual(len(duplicate_errors), 1)

    def test_dataset_hash_is_order_independent(self):
        rows_a, _, _ = _normalize_rows(
            [row("A", "Future", "8", "8.0"), row("B", "Future", "9", "9.0")], {}
        )
        rows_b = list(reversed(rows_a))
        self.assertEqual(_dataset_hash(rows_a), _dataset_hash(rows_b))


if __name__ == "__main__":
    unittest.main()
