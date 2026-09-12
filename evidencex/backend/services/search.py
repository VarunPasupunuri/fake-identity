"""Web search abstraction.

EvidenceX never invents search results. If no provider is configured the
service raises SearchUnavailable and the UI shows a setup error instead.
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

import httpx

from .. import config


class SearchUnavailable(RuntimeError):
    """The search provider is missing, misconfigured, or unreachable."""


@dataclass
class SearchResult:
    url: str
    title: str
    snippet: str = ""
    published_date: str | None = None
    engine: str = ""

    @property
    def domain(self) -> str:
        try:
            return urlparse(self.url).netloc.lower().removeprefix("www.")
        except Exception:
            return ""


def _ok(url: str) -> bool:
    if not url or not url.startswith(("http://", "https://")):
        return False
    lowered = url.lower()
    bad_ext = (".pdf", ".zip", ".doc", ".docx", ".ppt", ".pptx", ".xls", ".xlsx", ".mp4", ".jpg", ".png")
    # PDFs are legitimate sources but we cannot extract them reliably in the
    # MVP, so they are skipped rather than cited without having been read.
    return not lowered.endswith(bad_ext)


class SearchService:
    def __init__(self, cfg: config.SearchConfig | None = None) -> None:
        self.cfg = cfg or config.SEARCH

    def ready(self) -> bool:
        return self.cfg.problem() is None

    async def search(self, query: str, *, limit: int | None = None, recent: bool = False) -> list[SearchResult]:
        problem = self.cfg.problem()
        if problem:
            raise SearchUnavailable(problem)
        limit = limit or config.MAX_RESULTS_PER_QUERY
        engine = self.cfg.engine
        handler = {
            "tavily": self._tavily,
            "brave": self._brave,
            "serper": self._serper,
            "searxng": self._searxng,
            "duckduckgo": self._duckduckgo,
        }[engine]
        try:
            results = await handler(query, limit, recent)
        except SearchUnavailable:
            raise
        except httpx.HTTPError as exc:
            raise SearchUnavailable(f"Search provider '{engine}' is unreachable: {exc}") from exc
        seen: set[str] = set()
        cleaned: list[SearchResult] = []
        for r in results:
            if not _ok(r.url) or r.url in seen:
                continue
            seen.add(r.url)
            r.engine = engine
            cleaned.append(r)
        return cleaned[:limit]

    # -- providers ---------------------------------------------------------
    async def _tavily(self, query: str, limit: int, recent: bool) -> list[SearchResult]:
        base = (self.cfg.base_url or "https://api.tavily.com").rstrip("/")
        payload = {
            "api_key": self.cfg.api_key,
            "query": query,
            "max_results": limit,
            "search_depth": "advanced",
            "include_answer": False,
        }
        if recent:
            payload["topic"] = "news"
            payload["days"] = 120
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{base}/search", json=payload)
        self._raise_for_auth(resp, "tavily")
        data = resp.json()
        return [
            SearchResult(
                url=item.get("url", ""),
                title=item.get("title", "") or item.get("url", ""),
                snippet=item.get("content", "") or "",
                published_date=item.get("published_date"),
            )
            for item in data.get("results", [])
        ]

    async def _brave(self, query: str, limit: int, recent: bool) -> list[SearchResult]:
        base = (self.cfg.base_url or "https://api.search.brave.com/res/v1").rstrip("/")
        params = {"q": query, "count": min(limit, 20)}
        if recent:
            params["freshness"] = "py"
        headers = {"X-Subscription-Token": self.cfg.api_key, "Accept": "application/json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{base}/web/search", params=params, headers=headers)
        self._raise_for_auth(resp, "brave")
        data = resp.json()
        return [
            SearchResult(
                url=item.get("url", ""),
                title=item.get("title", ""),
                snippet=item.get("description", "") or "",
                published_date=item.get("page_age"),
            )
            for item in (data.get("web", {}).get("results") or [])
        ]

    async def _serper(self, query: str, limit: int, recent: bool) -> list[SearchResult]:
        base = (self.cfg.base_url or "https://google.serper.dev").rstrip("/")
        payload: dict = {"q": query, "num": min(limit, 10)}
        if recent:
            payload["tbs"] = "qdr:y"
        headers = {"X-API-KEY": self.cfg.api_key, "Content-Type": "application/json"}
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{base}/search", json=payload, headers=headers)
        self._raise_for_auth(resp, "serper")
        data = resp.json()
        return [
            SearchResult(
                url=item.get("link", ""),
                title=item.get("title", ""),
                snippet=item.get("snippet", "") or "",
                published_date=item.get("date"),
            )
            for item in (data.get("organic") or [])
        ]

    async def _searxng(self, query: str, limit: int, recent: bool) -> list[SearchResult]:
        base = self.cfg.base_url.rstrip("/")
        params = {"q": query, "format": "json"}
        if recent:
            params["time_range"] = "year"
        headers = {"User-Agent": config.USER_AGENT}
        if self.cfg.api_key:
            headers["Authorization"] = f"Bearer {self.cfg.api_key}"
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(f"{base}/search", params=params, headers=headers)
        self._raise_for_auth(resp, "searxng")
        data = resp.json()
        return [
            SearchResult(
                url=item.get("url", ""),
                title=item.get("title", ""),
                snippet=item.get("content", "") or "",
                published_date=item.get("publishedDate"),
            )
            for item in (data.get("results") or [])
        ][:limit]

    async def _duckduckgo(self, query: str, limit: int, recent: bool) -> list[SearchResult]:
        """Keyless fallback using DuckDuckGo's public HTML endpoint.

        These are real results from a real engine - nothing is synthesised.
        DuckDuckGo rate-limits aggressively, so a paid provider is recommended.
        """
        from bs4 import BeautifulSoup  # local import keeps the hot path light

        base = (self.cfg.base_url or "https://html.duckduckgo.com").rstrip("/")
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        }
        data = {"q": query}
        if recent:
            data["df"] = "y"
        async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
            resp = await client.post(f"{base}/html/", data=data, headers=headers)
        if resp.status_code in (202, 403, 429):
            raise SearchUnavailable(
                "DuckDuckGo blocked this request (rate limiting). Configure SEARCH_ENGINE=tavily "
                "or brave with SEARCH_API_KEY for reliable research."
            )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        out: list[SearchResult] = []
        for row in soup.select(".result, .web-result")[: limit * 2]:
            link = row.select_one("a.result__a")
            if not link:
                continue
            href = link.get("href", "")
            if href.startswith("//duckduckgo.com/l/") or "uddg=" in href:
                from urllib.parse import parse_qs, unquote, urlparse as _p

                qs = parse_qs(_p(href).query)
                href = unquote(qs.get("uddg", [""])[0]) or href
            body = row.select_one(".result__snippet")
            out.append(
                SearchResult(
                    url=href,
                    title=link.get_text(" ", strip=True),
                    snippet=body.get_text(" ", strip=True) if body else "",
                )
            )
        return out

    @staticmethod
    def _raise_for_auth(resp: httpx.Response, engine: str) -> None:
        if resp.status_code in (401, 403):
            raise SearchUnavailable(
                f"Search provider '{engine}' rejected the API key (HTTP {resp.status_code}). Check SEARCH_API_KEY."
            )
        if resp.status_code == 429:
            raise SearchUnavailable(f"Search provider '{engine}' is rate limiting this key (HTTP 429).")
        if resp.status_code >= 400:
            raise SearchUnavailable(f"Search provider '{engine}' returned HTTP {resp.status_code}.")
