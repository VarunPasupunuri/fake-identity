"""Page retrieval and main-content extraction.

Responsible design (spec §32): EvidenceX only fetches publicly reachable pages,
honours robots.txt, and never attempts to bypass logins, paywalls, CAPTCHAs or
any other access control. A page that cannot be retrieved is recorded as
*not retrieved* and is never used as evidence.
"""
from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser

import httpx
from bs4 import BeautifulSoup

from .. import config

BLOCKED_MARKERS = (
    "enable javascript",
    "are you a robot",
    "verify you are human",
    "access denied",
    "subscribe to continue reading",
    "this content is for subscribers",
)


@dataclass
class Page:
    url: str
    ok: bool
    title: str = ""
    text: str = ""
    published_date: str | None = None
    status_note: str | None = None
    http_status: int | None = None
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat(timespec="seconds"))

    @property
    def domain(self) -> str:
        try:
            return urlparse(self.url).netloc.lower().removeprefix("www.")
        except Exception:
            return ""


_robots_cache: dict[str, RobotFileParser | None] = {}
_robots_lock = asyncio.Lock()


async def _robots_allows(url: str) -> tuple[bool, str | None]:
    if not config.RESPECT_ROBOTS:
        return True, None
    parsed = urlparse(url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    async with _robots_lock:
        parser = _robots_cache.get(root, "missing")  # type: ignore[arg-type]
    if parser == "missing":  # type: ignore[comparison-overlap]
        parser = None
        try:
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                resp = await client.get(f"{root}/robots.txt", headers={"User-Agent": config.USER_AGENT})
            if resp.status_code == 200 and resp.text.strip():
                parser = RobotFileParser()
                parser.parse(resp.text.splitlines())
        except Exception:
            parser = None
        async with _robots_lock:
            _robots_cache[root] = parser
    if parser is None:
        return True, None
    try:
        allowed = parser.can_fetch(config.USER_AGENT, url)
    except Exception:
        return True, None
    if not allowed:
        return False, "Blocked by robots.txt — the site asks crawlers not to fetch this page."
    return True, None


def _clean_text(raw: str) -> str:
    raw = re.sub(r"[ \t ]+", " ", raw)
    raw = re.sub(r"\n{3,}", "\n\n", raw)
    return raw.strip()[: config.PAGE_MAX_CHARS]


def _find_published_date(soup: BeautifulSoup, html: str) -> str | None:
    meta_keys = [
        ("property", "article:published_time"),
        ("property", "article:modified_time"),
        ("name", "pubdate"),
        ("name", "publishdate"),
        ("name", "date"),
        ("itemprop", "datePublished"),
        ("name", "dc.date"),
        ("name", "citation_publication_date"),
    ]
    for attr, key in meta_keys:
        tag = soup.find("meta", attrs={attr: key})
        if tag and tag.get("content"):
            return str(tag["content"])[:40]
    for script in soup.find_all("script", attrs={"type": "application/ld+json"})[:6]:
        try:
            payload = json.loads(script.string or "")
        except Exception:
            continue
        blobs = payload if isinstance(payload, list) else [payload]
        for blob in blobs:
            if isinstance(blob, dict):
                for key in ("datePublished", "dateModified", "uploadDate"):
                    if blob.get(key):
                        return str(blob[key])[:40]
    time_tag = soup.find("time")
    if time_tag and time_tag.get("datetime"):
        return str(time_tag["datetime"])[:40]
    match = re.search(r"\b(20[0-2]\d|19\d\d)-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b", html[:6000])
    return match.group(0) if match else None


def extract_content(url: str, html: str) -> tuple[str, str, str | None]:
    """Return (title, main_text, published_date) from raw HTML."""
    soup = BeautifulSoup(html, "html.parser")
    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()
    og = soup.find("meta", attrs={"property": "og:title"})
    if not title and og and og.get("content"):
        title = str(og["content"]).strip()
    published = _find_published_date(soup, html)

    text = ""
    try:  # trafilatura gives much cleaner main-content extraction when available
        import trafilatura

        extracted = trafilatura.extract(
            html, include_comments=False, include_tables=True, favor_recall=True, url=url
        )
        if extracted:
            text = extracted
    except Exception:
        text = ""

    if len(text) < 400:  # fallback: strip chrome and take the body text
        for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "form", "svg", "aside"]):
            tag.decompose()
        main = soup.find("main") or soup.find("article") or soup.body or soup
        text = main.get_text("\n", strip=True)

    return title[:300], _clean_text(text), published


async def open_page(url: str, *, client: httpx.AsyncClient | None = None) -> Page:
    """Fetch a single public page. Never raises — failures come back as Page(ok=False)."""
    allowed, robots_note = await _robots_allows(url)
    if not allowed:
        return Page(url=url, ok=False, status_note=robots_note)

    owns_client = client is None
    client = client or httpx.AsyncClient(
        timeout=config.PAGE_TIMEOUT_SECONDS, follow_redirects=True, max_redirects=5
    )
    headers = {
        "User-Agent": config.USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        resp = await client.get(url, headers=headers)
        status = resp.status_code
        if status == 401:
            return Page(url=url, ok=False, http_status=status,
                        status_note="Source requires authentication — not retrieved, not used as evidence.")
        if status == 402 or status == 451:
            return Page(url=url, ok=False, http_status=status,
                        status_note="Source is access-restricted — not retrieved, not used as evidence.")
        if status == 403:
            return Page(url=url, ok=False, http_status=status,
                        status_note="Source refused automated access (403) — not retrieved, not used as evidence.")
        if status == 404:
            return Page(url=url, ok=False, http_status=status, status_note="Page not found (404).")
        if status == 429:
            return Page(url=url, ok=False, http_status=status, status_note="Source rate limited the request (429).")
        if status >= 400:
            return Page(url=url, ok=False, http_status=status, status_note=f"Source returned HTTP {status}.")

        ctype = resp.headers.get("content-type", "")
        if "html" not in ctype and "text" not in ctype:
            return Page(url=url, ok=False, http_status=status,
                        status_note=f"Unsupported content type ({ctype or 'unknown'}) — not parsed.")

        title, text, published = extract_content(str(resp.url), resp.text)
        if len(text) < 200:
            lowered = resp.text.lower()
            marker = next((m for m in BLOCKED_MARKERS if m in lowered), None)
            note = (
                "Source could not be retrieved and was not used as evidence "
                f"({'requires JavaScript or blocks bots' if marker else 'no readable text content'})."
            )
            return Page(url=str(resp.url), ok=False, http_status=status, title=title, status_note=note)
        return Page(
            url=str(resp.url), ok=True, title=title or url, text=text,
            published_date=published, http_status=status,
        )
    except httpx.TimeoutException:
        return Page(url=url, ok=False, status_note="Source timed out — not retrieved, not used as evidence.")
    except httpx.HTTPError as exc:
        return Page(url=url, ok=False, status_note=f"Source could not be retrieved ({type(exc).__name__}).")
    except Exception as exc:  # pragma: no cover - defensive
        return Page(url=url, ok=False, status_note=f"Source could not be parsed ({type(exc).__name__}).")
    finally:
        if owns_client:
            await client.aclose()


async def open_pages(urls: list[str], *, concurrency: int = 5) -> list[Page]:
    sem = asyncio.Semaphore(concurrency)
    async with httpx.AsyncClient(
        timeout=config.PAGE_TIMEOUT_SECONDS, follow_redirects=True, max_redirects=5
    ) as client:
        async def one(u: str) -> Page:
            async with sem:
                return await open_page(u, client=client)

        return list(await asyncio.gather(*(one(u) for u in urls)))
