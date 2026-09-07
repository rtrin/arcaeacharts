"""Reliable Miraheze scraper for Arcaea song metadata."""

import argparse
import csv
import random
import re
import time
from html import unescape
from decimal import Decimal, InvalidOperation
from urllib.parse import unquote, urljoin, urlparse

import requests
from bs4 import BeautifulSoup

MIRAHEZE_ORIGIN = "https://arcaea.miraheze.org"
API_URL = f"{MIRAHEZE_ORIGIN}/w/api.php"
SONG_LIST_PAGE = "Song_list"
CHART_DESIGNERS_PAGE = "Chart_designers"
REQUEST_TIMEOUT = (10, 30)
MAX_RETRIES = 4
REQUEST_DELAY_SECONDS = 0.35
USER_AGENT = (
    "ArcaeaChartsFetcher/2.0 (+https://github.com/rtrin/arcaeacharts; "
    "contact via repository issues)"
)

DIFFICULTY_BY_CLASS = {
    "pst": "Past",
    "prs": "Present",
    "ftr": "Future",
    "etr": "Eternal",
    "byd": "Beyond",
    "ins": "Inscribed",
}
DIFFICULTY_BY_LABEL = {
    **{difficulty.casefold(): difficulty for difficulty in DIFFICULTY_BY_CLASS.values()},
    **{key.upper(): value for key, value in DIFFICULTY_BY_CLASS.items()},
}
SUPPORTED_DIFFICULTIES = {"Future", "Eternal", "Beyond", "Inscribed"}
KEPT_DIFFICULTIES = SUPPORTED_DIFFICULTIES


class ScrapeError(RuntimeError):
    """Raised when a source response cannot be safely consumed."""


def _session():
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT, "Accept": "application/json"})
    return session


SESSION = _session()


def _request(params, page_title):
    """Fetch a MediaWiki API response with bounded, compliant retries."""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            response = SESSION.get(API_URL, params=params, timeout=REQUEST_TIMEOUT)
            if response.status_code == 429 or response.status_code >= 500:
                retry_after = response.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() else 2 ** attempt
                time.sleep(delay + random.uniform(0, 0.25))
                last_error = ScrapeError(f"HTTP {response.status_code} for {page_title}")
                continue
            response.raise_for_status()
            return response.json()
        except (requests.RequestException, ValueError, ScrapeError) as error:
            last_error = error
            if attempt < MAX_RETRIES - 1:
                time.sleep((2 ** attempt) + random.uniform(0, 0.25))
    raise ScrapeError(f"Failed to fetch {page_title}: {last_error}") from last_error


def fetch_page_via_api(page_title):
    """Fetch parsed HTML for a MediaWiki page."""
    data = _request(
        {
            "action": "parse",
            "page": page_title,
            "prop": "text|revid",
            "format": "json",
            "redirects": "1",
        },
        page_title,
    )
    if "error" in data:
        raise ScrapeError(data["error"].get("info", str(data["error"])))
    parsed = data.get("parse", {})
    html = parsed.get("text", {}).get("*")
    if not html:
        raise ScrapeError(f"No parsed HTML returned for {page_title}")
    return html


def fetch_page_with_revision(page_title):
    """Fetch parsed HTML and the source revision ID."""
    data = _request(
        {
            "action": "parse",
            "page": page_title,
            "prop": "text|revid",
            "format": "json",
            "redirects": "1",
        },
        page_title,
    )
    if "error" in data:
        raise ScrapeError(data["error"].get("info", str(data["error"])))
    parsed = data.get("parse", {})
    html = parsed.get("text", {}).get("*")
    if not html:
        raise ScrapeError(f"No parsed HTML returned for {page_title}")
    return html, parsed.get("revid")


def _normalized_title(value):
    return re.sub(r"\s+", " ", unescape(value or "")).strip().lower()


def _page_title_from_href(href):
    parsed = urlparse(urljoin(MIRAHEZE_ORIGIN, href))
    if parsed.netloc != urlparse(MIRAHEZE_ORIGIN).netloc or not parsed.path.startswith("/wiki/"):
        return None
    title = unquote(parsed.path.removeprefix("/wiki/")).replace("_", " ").strip()
    if not title or ":" in title:
        return None
    return title


def _has_headers(table, expected):
    headers = {_normalized_title(cell.get_text(" ", strip=True)) for cell in table.select("th")}
    return expected.issubset(headers)


def parse_song_list_html(html):
    """Extract unique song links and catalog fields from the Song_list table."""
    soup = BeautifulSoup(html, "html.parser")
    tables = [table for table in soup.select("table") if _has_headers(table, {"song", "artist"})]
    if not tables:
        raise ScrapeError("Song_list did not contain a table with Song and Artist headers")

    links = {}
    for row in tables[0].select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) < 2 or cells[0].name == "th":
            continue
        link = cells[0].find("a", href=True)
        if not link:
            continue
        href = str(link["href"])
        title = _page_title_from_href(href)
        if not title:
            continue
        key = _normalized_title(title)
        links.setdefault(
            key,
            {
                "page_title": title,
                "url": urljoin(MIRAHEZE_ORIGIN, href),
                "display_title": link.get_text(" ", strip=True),
                "artist": cells[1].get_text(" ", strip=True),
            },
        )
    if not links:
        raise ScrapeError("Song_list contained no song links in its first column")
    return list(links.values())


def scrape_song_catalog():
    """Return the validated Song_list links and source revision."""
    html, revision_id = fetch_page_with_revision(SONG_LIST_PAGE)
    return parse_song_list_html(html), revision_id


def _direct_box_nodes(box):
    return [node for node in box.find_all("div", recursive=False) if node.get("class")]


def _label_values(box, label_text):
    nodes = _direct_box_nodes(box)
    for index, node in enumerate(nodes):
        if "label" not in node.get("class", []):
            continue
        if node.get_text(" ", strip=True).casefold() != label_text.casefold():
            continue
        values = []
        for following in nodes[index + 1:]:
            classes = following.get("class", [])
            if "label" in classes or "header" in classes:
                break
            if "data" in classes:
                values.append(following)
        return values
    return []


def _visible_difficulty(cell):
    text = cell.get_text(" ", strip=True)
    text = re.sub(r"^\s*\[([^\[\]]+)\]\s*$", r"\1", text).strip()
    return DIFFICULTY_BY_LABEL.get(text.casefold()) or DIFFICULTY_BY_LABEL.get(text.upper())


def _class_difficulty(cell):
    for node in [cell, *cell.select("[class]")]:
        for class_name in node.get("class", []):
            match = re.fullmatch(r"([a-z]+)-txt", class_name.casefold())
            if match and match.group(1) in DIFFICULTY_BY_CLASS:
                return DIFFICULTY_BY_CLASS[match.group(1)]
    return None


def _difficulty_from_cell_details(cell):
    visible = _visible_difficulty(cell)
    class_difficulty = _class_difficulty(cell)
    warning = None
    if visible and class_difficulty and visible != class_difficulty:
        warning = {
            "type": "difficulty_label_class_mismatch",
            "visible": visible,
            "css_class": class_difficulty,
        }
    return visible or class_difficulty, warning


def _difficulty_from_cell(cell):
    """Return the visible difficulty, falling back to its CSS class."""
    return _difficulty_from_cell_details(cell)[0]


def _clean_constant(value):
    text = "" if value is None else str(value)
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*", text)
    if not match:
        return None
    try:
        constant = Decimal(match.group(1))
    except InvalidOperation:
        return None
    return constant if constant.is_finite() and constant <= Decimal("13") else None


def _clean_version(value):
    match = re.search(r"v?(\d+(?:\.\d+)+)", value or "")
    return match.group(1) if match else ""


def _expand_chart_cells(cells):
    """Expand cells with grid spans so chart columns align by difficulty."""
    expanded = []
    for cell in cells:
        match = re.search(r"grid-column\s*:\s*span\s+(\d+)", cell.get("style", ""), re.IGNORECASE)
        expanded.extend([cell] * int(match.group(1)) if match else [cell])
    return expanded


def _parse_chart_rows(box, title, artist, version):  # pylint: disable=too-many-locals
    """Parse chart columns from a song information box."""
    difficulty_cells = _expand_chart_cells(_label_values(box, "Difficulty"))
    level_cells = _expand_chart_cells(_label_values(box, "Level"))
    constant_cells = _expand_chart_cells(_label_values(box, "Constant"))
    charter_cells = _expand_chart_cells(_label_values(box, "Chart designer"))

    rows = []
    for index, cell in enumerate(difficulty_cells):
        difficulty, difficulty_warning = _difficulty_from_cell_details(cell)
        if difficulty not in SUPPORTED_DIFFICULTIES:
            continue
        level = level_cells[index].get_text(" ", strip=True) if index < len(level_cells) else ""
        constant_text = constant_cells[index].get_text(" ", strip=True) if index < len(constant_cells) else ""
        constant = _clean_constant(constant_text)
        charter = ""
        if index < len(charter_cells):
            charter = charter_cells[index].get_text(" ", strip=True)
        row = {
            "song": title.strip(),
            "artist": artist,
            "difficulty": difficulty,
            "chart_constant": constant_text,
            "level": level,
            "version": version,
            "charter": charter or None,
        }
        if constant is None:
            row["diagnostics"] = [{"type": "invalid_constant", "value": constant_text}]
        if difficulty_warning:
            row.setdefault("diagnostics", []).append(difficulty_warning)
        rows.append(row)
    return rows


def parse_song_soup(soup, fallback_title=""):
    """Parse a Miraheze song page into supported chart rows."""
    title_node = soup.select_one(".mw-page-title-main, h1#firstHeading")
    title = title_node.get_text(" ", strip=True) if title_node else fallback_title
    box = soup.select_one(".arcaeabox")
    if not box:
        return []
    artist_values = _label_values(box, "Artist")
    artist = artist_values[0].get_text(" ", strip=True) if artist_values else ""
    version_values = _label_values(box, "Version (Date)")
    version = _clean_version(version_values[0].get_text(" ", strip=True)) if version_values else ""
    return _parse_chart_rows(box, title.strip(), artist, version)


def fetch_song(page_title):
    """Fetch and parse one song page."""
    html = fetch_page_via_api(page_title)
    return parse_song_soup(BeautifulSoup(html, "html.parser"), fallback_title=page_title)


def scrape_song_pages(song_links):
    """Fetch all discovered song pages and return rows plus failure diagnostics."""
    rows = []
    failures = []
    for index, link in enumerate(song_links):
        if index:
            time.sleep(REQUEST_DELAY_SECONDS)
        try:
            html, revision_id = fetch_page_with_revision(link["page_title"])
            parsed_rows = parse_song_soup(
                BeautifulSoup(html, "html.parser"), fallback_title=link["page_title"]
            )
            for row in parsed_rows:
                row.update(
                    {
                        "source_page_title": link["page_title"],
                        "source_url": link["url"],
                        "source_revision": str(revision_id or ""),
                    }
                )
            rows.extend(parsed_rows)
        except ScrapeError as error:  # Keep crawling and let the publish gate decide.
            failures.append(
                {
                    "page_title": link["page_title"],
                    "url": link["url"],
                    "error": str(error),
                }
            )
    return rows, failures


def _collect_song_rows(tables):
    """Collect chart designer rows grouped by normalized song title."""
    songs = []
    for table in tables:
        current_song = ""
        current_charter = ""
        current_rows = []
        remaining_rowspan = 0
        for row in table.select("tr"):
            cells = row.select("td")
            if not cells:
                continue
            if remaining_rowspan:
                remaining_rowspan -= 1
                if cells:
                    current_rows.append((current_charter, cells[0].get_text(" ", strip=True)))
                continue
            if current_song and current_rows:
                songs.append((current_song, current_rows))
            current_rows = []
            if len(cells) < 3:
                current_song = ""
                continue
            rowspan = cells[0].get("rowspan")
            remaining_rowspan = int(rowspan) - 1 if rowspan and str(rowspan).isdigit() else 0
            link = cells[0].find("a")
            song_text = link.get_text(" ", strip=True) if link else cells[0].get_text(" ", strip=True)
            current_song = _normalized_title(song_text)
            current_charter = cells[1].get_text(" ", strip=True)
            current_rows.append((cells[1].get_text(" ", strip=True), cells[2].get_text(" ", strip=True)))
        if current_song and current_rows:
            songs.append((current_song, current_rows))
    return songs


def scrape_chart_designers():
    """Build a best-effort chart designer lookup from the wiki page."""
    soup = BeautifulSoup(fetch_page_via_api(CHART_DESIGNERS_PAGE), "html.parser")
    lookup = {}
    for title, sub_rows in _collect_song_rows(soup.select("table.article-table, table.wikitable")):
        charter = sub_rows[-1][0]
        for difficulty in KEPT_DIFFICULTIES:
            lookup[(title, difficulty)] = charter
    return lookup


def save_to_csv(data, filename):
    """Save rows to CSV."""
    if not data:
        return
    with open(filename, "w", newline="", encoding="utf-8") as output:
        writer = csv.DictWriter(output, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)


def scrape_songs_by_level(save_path=None):
    """Compatibility entry point that performs the complete Miraheze crawl."""
    links, _ = scrape_song_catalog()
    rows, failures = scrape_song_pages(links)
    if failures:
        raise ScrapeError(f"Failed to scrape {len(failures)} song pages")
    if save_path:
        save_to_csv(rows, save_path)
    return rows


def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(description="Scrape Arcaea song data from Miraheze")
    parser.add_argument("--output", "-o", default="songs.csv", help="Output CSV")
    args = parser.parse_args()
    scrape_songs_by_level(save_path=args.output)


if __name__ == "__main__":
    main()
