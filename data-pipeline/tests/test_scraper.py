import unittest
from decimal import Decimal
from pathlib import Path

from bs4 import BeautifulSoup

from scraper import _clean_constant, parse_song_soup


FIXTURE = Path(__file__).parent / "fixtures" / "song-inscribed.html"


class ScraperTests(unittest.TestCase):
    def test_visible_difficulty_wins_and_spanned_charter_aligns(self):
        soup = BeautifulSoup(FIXTURE.read_text(encoding="utf-8"), "html.parser")

        rows = parse_song_soup(soup)

        self.assertEqual([row["difficulty"] for row in rows], ["Future", "Inscribed"])
        self.assertEqual(rows[0]["level"], "10+")
        self.assertEqual(rows[1]["level"], "11+")
        self.assertEqual(rows[0]["chart_constant"], "10.7")
        self.assertEqual(rows[1]["chart_constant"], "11.8")
        self.assertEqual(rows[0]["charter"], "Shared Charter")
        self.assertEqual(rows[1]["charter"], "Inscribed Charter")
        self.assertEqual(rows[1]["diagnostics"][0]["type"], "difficulty_label_class_mismatch")

    def test_malformed_supported_cells_are_retained_for_validation(self):
        html = """
        <h1 id="firstHeading">Broken Song</h1>
        <div class="arcaeabox">
          <div class="label">Difficulty</div><div class="data">[Future]</div>
          <div class="label">Level</div><div class="data">unknown</div>
          <div class="label">Constant</div><div class="data">8.7-8.8</div>
        </div>
        """

        rows = parse_song_soup(BeautifulSoup(html, "html.parser"))

        self.assertEqual(rows[0]["level"], "unknown")
        self.assertEqual(rows[0]["chart_constant"], "8.7-8.8")

    def test_fixture_constants_are_decimal_source_values(self):
        self.assertEqual(_clean_constant("8.7"), Decimal("8.7"))
        self.assertEqual(_clean_constant("9.7"), Decimal("9.7"))
        self.assertEqual(_clean_constant("10.7"), Decimal("10.7"))
        self.assertIsNone(_clean_constant("8.7-8.8"))


if __name__ == "__main__":
    unittest.main()
