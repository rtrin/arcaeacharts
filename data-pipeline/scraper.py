"""
Arcaea Fandom scraper — Songs by Level only.

- Songs by Level: scrape Songs_by_Level (Song, Artist, Difficulty, Chart Constant, Level, Version).

Uses MediaWiki API to fetch the parsed page content to avoid basic blocks.
"""

import argparse
import csv
import re
import requests
from bs4 import BeautifulSoup

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

API_URL = "https://arcaea.fandom.com/api.php"
HEADERS = {
    "User-Agent": "ArcaeaChartsFetcher/1.0 (https://github.com/your-repo; gentle bot)",
    "Accept": "application/json",
}

SONGS_BY_LEVEL_PAGE = "Songs_by_Level"
WIKI_HOME_PAGE = "Arcaea_Wiki"
REQUEST_TIMEOUT = 30

CHART_DESIGNERS_PAGE = "Chart_Designers"
KEPT_DIFFICULTIES = {"Future", "Eternal", "Beyond"}


# -----------------------------------------------------------------------------
# News Section Scraper
# -----------------------------------------------------------------------------

def scrape_news_links():
    """Scrape the wiki homepage and extract all links from the News section.
    
    Only parses the visible Mobile tab (display: block), not the hidden Switch tab.
    
    Returns:
        List of wiki page titles (e.g., ["OMAJINAI", "CHAIN2NITE", ...])
    """
    print("Fetching News section from homepage...")
    params = {
        "action": "parse",
        "page": WIKI_HOME_PAGE,
        "prop": "text",
        "format": "json",
        "redirects": "1",
    }
    response = requests.get(
        API_URL, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT
    )
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(data["error"].get("info", str(data["error"])))
    
    html = data["parse"]["text"]["*"]
    soup = BeautifulSoup(html, "html.parser")
    
    # Find the News section: look for the visible tabber tab (display: block)
    # The visible tab is inside a tabberex-body with display: block style
    page_titles = set()
    
    # Find tabberex-tab divs and only use the one with display: block
    visible_tab = None
    for tab in soup.select(".tabberex-tab"):
        style = str(tab.get("style", ""))
        if "display: block" in style or "display:block" in style:
            visible_tab = tab
            break
    
    if not visible_tab:
        # Fallback: try the first tabberex-tab
        visible_tab = soup.select_one(".tabberex-tab")
    
    if visible_tab:
        # Find links in the visible News section only
        for link in visible_tab.select("a[href^='/wiki/']"):
            href = str(link.get("href", ""))
            if "/wiki/" in href:
                # Extract page title from /wiki/Page_Title
                page_title = href.split("/wiki/")[-1]
                # Skip special pages, categories, files, etc.
                if ":" in page_title:
                    continue
                # Skip anchors
                if "#" in page_title:
                    page_title = page_title.split("#")[0]
                if page_title:
                    page_titles.add(page_title)
    
    print(f"Found {len(page_titles)} unique page links from News section.")
    return list(page_titles)


def filter_song_pages(page_titles):
    """Filter a list of page titles to only include pages in Category:Songs.
    
    Uses MediaWiki API batch query to check categories efficiently.
    
    Args:
        page_titles: List of wiki page titles to check.
        
    Returns:
        List of page titles that belong to Category:Songs.
    """
    if not page_titles:
        return []
    
    song_pages = []
    # API allows up to 50 titles per request
    batch_size = 50
    
    for i in range(0, len(page_titles), batch_size):
        batch = page_titles[i:i + batch_size]
        titles_param = "|".join(batch)
        
        params = {
            "action": "query",
            "titles": titles_param,
            "prop": "categories",
            "cllimit": "max",  # Get all categories
            "format": "json",
        }
        response = requests.get(
            API_URL, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        data = response.json()
        
        pages = data.get("query", {}).get("pages", {})
        for page_id, page_data in pages.items():
            if page_id == "-1":  # Page doesn't exist
                continue
            categories = page_data.get("categories", [])
            cat_titles = [c.get("title", "") for c in categories]
            if "Category:Songs" in cat_titles:
                song_pages.append(page_data.get("title", ""))
    
    print(f"Filtered to {len(song_pages)} song pages.")
    return song_pages


# -----------------------------------------------------------------------------
# Chart Designers (Chart_Designers page)
# -----------------------------------------------------------------------------

def _collect_song_rows(tables):
    """Collect (charter_name, notes_text) sub-rows grouped by normalized song title.

    Returns:
        List of (norm_title, sub_rows) where sub_rows is [(charter_name, notes_text), ...].
    """
    songs = []  # [(norm_title, [(charter_name, notes_text), ...])]

    for table in tables:
        trs = table.select("tr")
        if not trs:
            continue
        current_song = ""
        remaining_rowspan = 0
        current_sub_rows = []

        for tr in trs[1:]:
            tds = tr.select("td")
            if not tds:
                continue

            if remaining_rowspan > 0:
                remaining_rowspan -= 1
                if len(tds) < 2:
                    continue
                charter_name = tds[0].get_text(strip=True)
                notes_text = tds[1].get_text(strip=True)
            else:
                # Flush previous song if we have sub-rows
                if current_song and current_sub_rows:
                    songs.append((current_song, current_sub_rows))
                    current_sub_rows = []

                if len(tds) < 3:
                    continue
                song_cell = tds[0]
                rowspan = song_cell.get("rowspan")
                if rowspan:
                    remaining_rowspan = int(rowspan) - 1
                song_link = song_cell.select_one("a")
                current_song = (song_link.get_text(strip=True) if song_link
                                else song_cell.get_text(strip=True)).strip().lower()
                charter_name = tds[1].get_text(strip=True)
                notes_text = tds[2].get_text(strip=True)

            if charter_name:
                current_sub_rows.append((charter_name, notes_text))

        # Flush last song in table
        if current_song and current_sub_rows:
            songs.append((current_song, current_sub_rows))

    return songs


def scrape_chart_designers():
    """Scrape the Chart_Designers wiki page and build a charter lookup.

    Uses the last sub-row's charter name for each song across all kept difficulties.

    Returns:
        Dict mapping (normalized_title, difficulty) -> charter_name.
    """
    print(f"Fetching {CHART_DESIGNERS_PAGE} via API...")
    html = fetch_page_via_api(CHART_DESIGNERS_PAGE)
    soup = BeautifulSoup(html, "html.parser")

    tables = soup.select("table.article-table")
    song_groups = _collect_song_rows(tables)
    lookup = {}

    for norm_title, sub_rows in song_groups:
        charter_name = sub_rows[-1][0]
        for diff in KEPT_DIFFICULTIES:
            lookup[(norm_title, diff)] = charter_name

    print(f"Built charter lookup with {len(lookup)} entries.")
    return lookup


# -----------------------------------------------------------------------------
# CSV Helper
# -----------------------------------------------------------------------------

def save_to_csv(data, filename):
    """Save list of dicts to a CSV file."""
    if not data:
        print("No data to save.")
        return
    with open(filename, "w", newline="", encoding="utf-8") as out_file:
        writer = csv.DictWriter(out_file, fieldnames=data[0].keys())
        writer.writeheader()
        writer.writerows(data)
    print(f"Saved {len(data)} rows to {filename}")


# -----------------------------------------------------------------------------
# MediaWiki API
# -----------------------------------------------------------------------------

def fetch_page_via_api(page_title):
    """Fetch parsed HTML for a wiki page using the MediaWiki API."""
    params = {
        "action": "parse",
        "page": page_title,
        "prop": "text",
        "format": "json",
        "redirects": "1",
    }
    response = requests.get(
        API_URL, params=params, headers=HEADERS, timeout=REQUEST_TIMEOUT
    )
    response.raise_for_status()
    data = response.json()
    if "error" in data:
        raise ValueError(data["error"].get("info", str(data["error"])))
    return data["parse"]["text"]["*"]


# -----------------------------------------------------------------------------
# Songs by Level (Songs_by_Level page)
# -----------------------------------------------------------------------------

def parse_songs_by_level_html(html):  # pylint: disable=too-many-locals,too-many-branches
    """Parse the Songs by Level wiki page HTML into a list of row dicts.

    Table columns: Song, Artist, Difficulty, Chart Constant, Level, Version.
    """
    soup = BeautifulSoup(html, "html.parser")
    rows = []
    # Fandom can use wikitable sortable, article-table sortable, or plain wikitable
    selectors = [
        "table.wikitable.sortable",
        "table.article-table.sortable",
        "table.wikitable",
        "table.sortable",
    ]
    tables = []
    for sel in selectors:
        tables = soup.select(sel)
        if tables:
            break
    if not tables:
        # Fallback: any table with 6+ columns in first data row
        for table in soup.select("table"):
            for row in table.select("tbody tr"):
                tds = row.select("td")
                if len(tds) >= 6:
                    tables = [table]
                    break
            if tables:
                break
    for table in tables:
        rows_processed = 0
        for row in table.select("tbody tr"):
            tds = row.select("td")
            if len(tds) < 6:
                continue
            # Song: often <a href="/wiki/...">Display name</a>
            song_cell = tds[0]
            song_link = song_cell.select_one("a")
            if song_link:
                song_title = song_link.get_text(strip=True)
            else:
                song_title = song_cell.get_text(strip=True)
            artist = tds[1].get_text(strip=True)
            difficulty = tds[2].get_text(strip=True)
            chart_constant = tds[3].get_text(strip=True)
            level = tds[4].get_text(strip=True)
            version = tds[5].get_text(strip=True)
            if not song_title:
                continue
            rows.append({
                "song": song_title,
                "artist": artist,
                "difficulty": difficulty,
                "chart_constant": chart_constant,
                "level": level,
                "version": version,
            })
            rows_processed += 1
        # If we successfully parsed rows from this table, stop (assume it's the main table)
        # Filters out secondary tables that might contain duplicate/incorrect data (e.g. 1.0.0c table)
        if rows_processed > 0:
            break
    return rows


def scrape_songs_by_level(save_path=None):
    """Scrape the Songs by Level page via API and return (and optionally save) rows.

    Args:
        save_path: If set, save rows to this CSV file.

    Returns:
        List of dicts with keys: song, artist, difficulty, chart_constant, level, version.
    """
    print(f"Fetching {SONGS_BY_LEVEL_PAGE} via API...")
    html = fetch_page_via_api(SONGS_BY_LEVEL_PAGE)
    rows = parse_songs_by_level_html(html)
    print(f"Parsed {len(rows)} rows from Songs by Level.")
    if save_path:
        save_to_csv(rows, save_path)
    return rows



# -----------------------------------------------------------------------------
# Individual song pages (chart info + metadata)
# -----------------------------------------------------------------------------

def parse_song_soup(soup, fallback_title=""):
    """Parse song data from a BeautifulSoup object. Returns list of dicts."""
    title = ""
    title_elem = soup.select_one(".mw-page-title-main")
    if title_elem:
        title = title_elem.get_text(strip=True)
    if not title:
        for selector in ["h1.page-header__title", "h1#firstHeading", ".song-template-title", "h1"]:
            elem = soup.select_one(selector)
            if elem:
                title = elem.get_text(strip=True)
                break
    if not title and fallback_title:
        title = fallback_title.replace("_", " ")

    artist = ""
    artist_elem = soup.select_one(".song-template-artist")
    if artist_elem:
        artist = re.sub(r"\([^)]+\)", "", artist_elem.get_text()).strip()

    # Attempt to find Version/Added from infobox
    song_version = ""
    # Check CamelCase and lowercase keys (user reported "Version")
    for ds in ["Version", "version", "Added", "added"]:
        v_elem = soup.select_one(f'[data-source="{ds}"] .pi-data-value')
        if not v_elem:
            v_elem = soup.select_one(f'.pi-data-value[data-source="{ds}"]')
            
        if v_elem:
            # e.g. "6.12.0 (2025-01-29)" -> "6.12.0"
            raw_v = v_elem.get_text(strip=True)
            song_version = re.sub(r"\s*\(.*?\)", "", raw_v).strip()
            if song_version:
                break

    songs_data = []
    chart_tables = soup.select("table.pi-horizontal-group")
    if not chart_tables:
        return songs_data

    # Helper to clean constant (handle ?, -, ranges)
    def safe_decimal(val):
        """Return float/decimal string or None if invalid."""
        if not val:
            return None
        # Remove non-numeric except dot/minus
        cleaned = re.sub(r"[^\d\.-]", "", val)
        try:
            return float(cleaned)
        except ValueError:
            return None

    # Helper to extract level/constant
    def extract_chart_prop(cell, difficulty_key):
        span = cell.select_one(f'span[class*="{difficulty_key}"]')
        return span.get_text(strip=True) if span else ""

    # First table: default tab (FTR/ETR, sometimes BYD)
    default_table = chart_tables[0]
    data_cells = default_table.select("tbody td")
    if len(data_cells) >= 3:
        level_cell = data_cells[0]
        constant_cell = data_cells[2]
        difficulties = [
            ("Future", "ftr"),
            ("Eternal", "etr"),
            ("Beyond", "byd"),
        ]
        for difficulty_name, class_key in difficulties:
            level_str = extract_chart_prop(level_cell, class_key)
            raw_constant = extract_chart_prop(constant_cell, class_key)
            constant_val = safe_decimal(raw_constant)
            
            if not level_str or level_str.strip() == "-":
                continue
            
            # Filter out invalid entries (e.g. constant is None but level exists? suspicious)
            if constant_val is None:
                continue

            songs_data.append({
                "song": title,
                "artist": artist,
                "difficulty": difficulty_name,
                "chart_constant": constant_val,
                "level": level_str,
                "version": song_version,
            })

    # Second table: Beyond tab only (if separate)
    if len(chart_tables) >= 2:
        byd_table = chart_tables[1]
        byd_cells = byd_table.select("tbody td")
        if len(byd_cells) >= 3:
            level_str = byd_cells[0].get_text(strip=True)
            raw_constant = byd_cells[2].get_text(strip=True)
            constant_val = safe_decimal(raw_constant)
            
            if level_str and level_str.strip() != "-":
                # Filter out invalid entries
                if constant_val is not None:
                    if not any(s.get("difficulty") == "Beyond" for s in songs_data):
                        songs_data.append({
                            "song": title,
                            "artist": artist,
                            "difficulty": "Beyond",
                            "chart_constant": constant_val,
                            "level": level_str,
                            "version": song_version,
                        })

    return songs_data


def fetch_song(page_title):
    """Fetch and parse one song page via API; returns list of song entries."""
    try:
        html = fetch_page_via_api(page_title)
        soup = BeautifulSoup(html, "html.parser")
        return parse_song_soup(soup, fallback_title=page_title.replace("_", " "))
    except Exception as e:
        print(f"Error fetching {page_title}: {e}")
        return []





# -----------------------------------------------------------------------------
# CLI
# -----------------------------------------------------------------------------

def main():
    """CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Arcaea Fandom scraper (Songs by Level only)"
    )
    # Default behavior is just scraping songs by level if run directly
    parser.add_argument(
        "--output", "-o",
        help="Output CSV (default: songs_by_level.csv)",
        default="songs_by_level.csv"
    )
    args = parser.parse_args()
    scrape_songs_by_level(save_path=args.output)


if __name__ == "__main__":
    main()
