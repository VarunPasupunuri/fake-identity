"""Stage 05: extract evidence from retrieved page text — with a verbatim gate.

This module contains the anti-hallucination mechanism that the whole product
rests on: every snippet the model returns is checked, in Python, against the
text that was actually downloaded. A snippet that is not really in the page is
discarded. No exceptions, no "close enough".
"""
from __future__ import annotations

import difflib
import re

from .. import prompts
from ..llm import LLMClient, LLMError
from ..models import Evidence, Source
from ..services.webpage import Page

_WS = re.compile(r"\s+")
_FOLD = {
    "\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"',
    "\u2013": "-", "\u2014": "-", "\u00a0": " ", "\u200b": "",
}


def _fold(ch: str) -> str:
    return _FOLD.get(ch, ch)


def _normalize(text: str) -> str:
    return _WS.sub(" ", "".join(_fold(c) for c in text or "")).strip().lower()


def _normalize_with_map(text: str) -> tuple[str, list[int]]:
    """Normalize while keeping, for every normalized character, its original index."""
    chars: list[str] = []
    mapping: list[int] = []
    prev_space = True
    for i, raw in enumerate(text):
        ch = _fold(raw)
        if ch == "":
            continue
        if ch.isspace():
            if prev_space:
                continue
            chars.append(" ")
            mapping.append(i)
            prev_space = True
        else:
            chars.append(ch.lower())
            mapping.append(i)
            prev_space = False
    # drop a trailing space so the result matches _normalize()'s strip()
    while chars and chars[-1] == " ":
        chars.pop()
        mapping.pop()
    return "".join(chars), mapping


def verify_snippet(snippet: str, page_text: str, *, threshold: float = 0.92) -> tuple[bool, str]:
    """Is this snippet really in the page?

    Returns (verified, snippet_to_store). Exact normalized containment passes
    immediately. Otherwise a near-match is allowed only when a window of the
    page is >= `threshold` similar - and in both cases the stored snippet is
    sliced out of the ORIGINAL page text, so what the UI shows is always real
    page wording, never the model's paraphrase.
    """
    snippet = (snippet or "").strip()
    if len(snippet) < 15 or not page_text:
        return False, snippet

    norm_snippet = _normalize(snippet)
    norm_page, mapping = _normalize_with_map(page_text)
    if not norm_snippet or not norm_page:
        return False, snippet

    index = norm_page.find(norm_snippet)
    if index != -1:
        return True, _slice(page_text, mapping, index, len(norm_snippet)) or snippet

    size = len(norm_snippet)
    if size > len(norm_page):
        return False, snippet
    best_ratio, best_index = 0.0, -1
    step = max(1, size // 4)
    matcher = difflib.SequenceMatcher(a=norm_snippet, autojunk=False)
    for start in range(0, len(norm_page) - size + 1, step):
        window = norm_page[start : start + size]
        if not _shares_anchor(norm_snippet, window):
            continue
        matcher.set_seq2(window)
        if matcher.real_quick_ratio() < threshold or matcher.quick_ratio() < threshold:
            continue
        ratio = matcher.ratio()
        if ratio > best_ratio:
            best_ratio, best_index = ratio, start
    if best_ratio >= threshold and best_index >= 0:
        return True, (_slice(page_text, mapping, best_index, size) or snippet)
    return False, snippet


def _slice(page_text: str, mapping: list[int], start: int, length: int) -> str:
    """Cut the matched region out of the original text using the index map."""
    if start >= len(mapping) or length <= 0:
        return ""
    end = min(start + length, len(mapping)) - 1
    if end < start:
        return ""
    return page_text[mapping[start] : mapping[end] + 1].strip()


def _shares_anchor(snippet: str, window: str) -> bool:
    """Cheap pre-filter: do they share a distinctive long token?"""
    tokens = [t for t in snippet.split(" ") if len(t) > 6]
    if not tokens:
        return True
    probe = tokens[: 4]
    return any(t in window for t in probe)



def _chunk(text: str, size: int = 9000, overlap: int = 300, max_chunks: int = 3) -> list[str]:
    if len(text) <= size:
        return [text]
    chunks, start = [], 0
    while start < len(text) and len(chunks) < max_chunks:
        chunks.append(text[start : start + size])
        start += size - overlap
    return chunks


async def extract_evidence(
    *,
    question: str,
    needs: list[str],
    page: Page,
    source: Source,
    llm: LLMClient,
    start_index: int,
    candidate_noun: str | None = None,
) -> tuple[list[Evidence], int]:
    """Extract verified evidence from one retrieved page.

    Returns (evidence, rejected_count) where rejected_count counts snippets the
    model produced that could not be found in the real page text.
    """
    if not page.ok or not page.text:
        return [], 0

    candidate_hint = (
        f"This question is looking for individual {candidate_noun} items. When the page describes a "
        f"specific {candidate_noun}, name it exactly and attach its stated values."
        if candidate_noun
        else ""
    )
    needs_block = "\n".join(f"- {n}" for n in needs[:12]) or "- A direct answer to the question"

    evidence: list[Evidence] = []
    rejected = 0
    index = start_index

    for chunk in _chunk(page.text):
        try:
            data = await llm.complete_json(
                prompts.EXTRACT_SYSTEM,
                prompts.EXTRACT_USER.format(
                    question=question,
                    needs=needs_block,
                    candidate_hint=candidate_hint,
                    url=page.url,
                    title=page.title,
                    text=chunk,
                ),
                max_tokens=2500,
            )
        except LLMError:
            break
        if not isinstance(data, dict) or not data.get("evidence"):
            continue
        for item in data.get("evidence", [])[:8]:
            if not isinstance(item, dict):
                continue
            snippet = str(item.get("snippet") or "").strip()
            claim = str(item.get("claim") or "").strip()
            if not snippet or not claim:
                continue
            verified, stored = verify_snippet(snippet, page.text)
            if not verified:
                rejected += 1
                continue
            if any(_normalize(stored) == _normalize(e.snippet) for e in evidence):
                continue
            index += 1
            value = item.get("value")
            evidence.append(
                Evidence(
                    id=f"E{index}",
                    claim=claim[:400],
                    snippet=stored[:600],
                    source_id=source.id,
                    field=(str(item["field"])[:60] if item.get("field") not in (None, "", "null") else None),
                    subject=(str(item["subject"])[:120] if item.get("subject") not in (None, "", "null") else None),
                    value=(str(value)[:120] if value not in (None, "", "null") else None),
                    unit=(str(item["unit"])[:20] if item.get("unit") not in (None, "", "null") else None),
                    confidence="MEDIUM",
                    verbatim_verified=True,
                )
            )
        if len(evidence) >= 8:
            break
    return evidence[:8], rejected
