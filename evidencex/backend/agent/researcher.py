"""Stage 03-04: search the web and decide which pages are worth visiting."""
from __future__ import annotations

import re
from urllib.parse import urlparse

from ..models import Source
from ..services.search import SearchResult

# Deterministic source-quality heuristics (spec §13). No model involved.
HIGH_TLDS = (".gov", ".gov.in", ".gov.uk", ".edu", ".ac.in", ".ac.uk", ".edu.au", ".mil", ".int")
HIGH_DOMAIN_MARKERS = (
    "who.int", "un.org", "worldbank.org", "imf.org", "oecd.org", "europa.eu",
    "nature.com", "science.org", "sciencedirect.com", "nih.gov", "ncbi.nlm.nih.gov",
    "pubmed.ncbi.nlm.nih.gov", "arxiv.org", "ieee.org", "acm.org", "nirfindia.org",
    "sec.gov", "rbi.org.in", "nic.in", "pib.gov.in", "meity.gov.in", "isro.gov.in",
)
MEDIUM_DOMAINS = (
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk", "ft.com", "economist.com",
    "wsj.com", "nytimes.com", "theguardian.com", "bloomberg.com", "cnbc.com",
    "thehindu.com", "indianexpress.com", "livemint.com", "business-standard.com",
    "economictimes.indiatimes.com", "timesofindia.indiatimes.com", "hindustantimes.com",
    "moneycontrol.com", "techcrunch.com", "theverge.com", "arstechnica.com", "wired.com",
    "zdnet.com", "engadget.com", "tomshardware.com", "notebookcheck.net", "anandtech.com",
    "wikipedia.org", "britannica.com", "investopedia.com", "statista.com",
    "developer.mozilla.org", "stackoverflow.com", "github.com", "npmjs.com",
    "react.dev", "angular.dev", "vuejs.org", "python.org", "docs.python.org",
)
LOW_MARKERS = ("blogspot.", "wordpress.com", "medium.com", "quora.com", "reddit.com",
               "pinterest.", "facebook.com", "answers.", "ezinearticles", "slideshare")


def classify_quality(url: str, title: str = "", entities: list[str] | None = None) -> tuple[str, str]:
    """Return (quality, reason) for a URL. Purely deterministic."""
    domain = urlparse(url).netloc.lower().removeprefix("www.")
    if not domain:
        return "LOW", "Unrecognised URL."
    if any(domain.endswith(t) or f"{t}." in f".{domain}" for t in HIGH_TLDS):
        return "HIGH", "Government, military or academic domain."
    if any(marker in domain for marker in HIGH_DOMAIN_MARKERS):
        return "HIGH", "Official body, primary research or standards organisation."
    for entity in entities or []:
        slug = re.sub(r"[^a-z0-9]", "", entity.lower())
        root = re.sub(r"[^a-z0-9]", "", domain.split(".")[0])
        if slug and root and (slug == root or (len(slug) > 4 and slug in root)):
            return "HIGH", f"Official site of an entity named in the question ({entity})."
    if any(marker in domain for marker in MEDIUM_DOMAINS):
        return "MEDIUM", "Established reference or reputable publication."
    if any(marker in domain for marker in LOW_MARKERS):
        return "LOW", "User-generated or aggregated content of unclear provenance."
    return "LOW", "Unknown site — provenance could not be established."


def _domain(url: str) -> str:
    return urlparse(url).netloc.lower().removeprefix("www.")


def rank_and_select(
    results: list[SearchResult],
    *,
    already_used: set[str],
    used_domains: dict[str, int],
    limit: int,
    entities: list[str] | None = None,
    max_per_domain: int = 2,
) -> list[SearchResult]:
    """Pick the most useful, most *independent* set of pages to visit.

    Independence matters: cross-checking is meaningless if every source is the
    same site, so each domain is capped.
    """
    scored: list[tuple[float, SearchResult]] = []
    for result in results:
        if not result.url or result.url in already_used:
            continue
        quality, _ = classify_quality(result.url, result.title, entities)
        score = {"HIGH": 3.0, "MEDIUM": 2.0, "LOW": 1.0}[quality]
        domain = _domain(result.url)
        score -= 0.6 * used_domains.get(domain, 0)
        if result.snippet:
            score += 0.3
        if result.published_date:
            score += 0.2
        scored.append((score, result))

    scored.sort(key=lambda pair: pair[0], reverse=True)
    picked: list[SearchResult] = []
    local_domains = dict(used_domains)
    for _, result in scored:
        domain = _domain(result.url)
        if local_domains.get(domain, 0) >= max_per_domain:
            continue
        picked.append(result)
        local_domains[domain] = local_domains.get(domain, 0) + 1
        if len(picked) >= limit:
            break
    return picked


def source_from_result(source_id: str, result: SearchResult, entities: list[str] | None = None) -> Source:
    quality, reason = classify_quality(result.url, result.title, entities)
    return Source(
        id=source_id,
        url=result.url,
        title=result.title or result.url,
        domain=_domain(result.url),
        source_quality=quality,  # type: ignore[arg-type]
        quality_reason=reason,
        snippet_from_search=(result.snippet or None),
        published_date=result.published_date,
    )
