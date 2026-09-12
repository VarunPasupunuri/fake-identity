"""Stage 06-07: turn evidence into claims, cross-check them, expose conflicts.

Claim text comes from the model; *verification status*, *cross-check status*,
*conflict detection* and *confidence* are all computed here in Python from the
evidence graph, so they cannot be talked up by the model.
"""
from __future__ import annotations

import re
from typing import Iterable

from .. import prompts
from ..llm import LLMClient, LLMError
from ..models import Claim, Conflict, Confidence, Evidence, Source
from .constraints import parse_number

QUALITY_RANK = {"HIGH": 3, "MEDIUM": 2, "LOW": 1}


def _index_sources(sources: Iterable[Source]) -> dict[str, Source]:
    return {s.id: s for s in sources}


def evidence_block(evidence: list[Evidence], sources: dict[str, Source], *, with_date: bool = False) -> str:
    lines = []
    for e in evidence:
        src = sources.get(e.source_id)
        domain = src.domain if src else "unknown"
        parts = [e.id, domain]
        if with_date and src and src.published_date:
            parts.append(src.published_date[:10])
        parts += [e.claim, f"“{e.snippet[:220]}”"]
        lines.append(" | ".join(parts))
    return "\n".join(lines)


async def synthesize_claims(
    *,
    question: str,
    subquestions: list[str],
    evidence: list[Evidence],
    sources: list[Source],
    llm: LLMClient,
) -> tuple[list[Claim], list[dict], list[str], list[str]]:
    """Returns (claims, raw_conflict_hints, coverage_gaps, followup_queries)."""
    if not evidence:
        return [], [], subquestions[:4], []
    src_map = _index_sources(sources)
    valid_ids = {e.id for e in evidence}
    try:
        data = await llm.complete_json(
            prompts.CLAIMS_SYSTEM,
            prompts.CLAIMS_USER.format(
                question=question,
                subquestions="\n".join(f"- {s}" for s in subquestions[:8]) or "- (none)",
                evidence=evidence_block(evidence, src_map),
            ),
            max_tokens=3500,
        )
    except LLMError:
        return [], [], [], []
    if not isinstance(data, dict):
        return [], [], [], []

    ev_map = {e.id: e for e in evidence}
    claims: list[Claim] = []
    for i, item in enumerate(data.get("claims", [])[:12]):
        if not isinstance(item, dict):
            continue
        text = str(item.get("text") or "").strip()
        ids = [str(x).strip() for x in (item.get("evidence_ids") or []) if str(x).strip() in valid_ids]
        if not text or not ids:
            continue  # NO EVIDENCE = NO CLAIM
        source_ids = sorted({ev_map[i_].source_id for i_ in ids})
        claims.append(
            Claim(
                id=f"C{i + 1}",
                text=text[:500],
                evidence_ids=ids,
                source_ids=source_ids,
                verified=True,
                subject=(str(item["subject"])[:120] if item.get("subject") not in (None, "", "null") else None),
                field=(str(item["field"])[:60] if item.get("field") not in (None, "", "null") else None),
            )
        )

    conflict_hints = [c for c in data.get("conflicts", []) if isinstance(c, dict)][:6]
    gaps = [str(g).strip()[:200] for g in (data.get("coverage_gaps") or []) if str(g).strip()][:6]
    followups = [str(q).strip()[:200] for q in (data.get("followup_queries") or []) if str(q).strip()][:3]
    return claims, conflict_hints, gaps, followups


# -- conflict detection ------------------------------------------------------
def _value_key(evidence: Evidence) -> str | None:
    field = (evidence.field or "").strip().lower()
    subject = (evidence.subject or "").strip().lower()
    if not field or evidence.value in (None, ""):
        return None
    return f"{re.sub(r'[^a-z0-9]+', '_', subject)}::{re.sub(r'[^a-z0-9]+', '_', field)}"


def _values_disagree(a: Evidence, b: Evidence) -> bool:
    num_a = parse_number(a.value, unit=a.unit)
    num_b = parse_number(b.value, unit=b.unit)
    if num_a is not None and num_b is not None:
        if num_a == num_b:
            return False
        scale = max(abs(num_a), abs(num_b), 1.0)
        return abs(num_a - num_b) / scale > 0.05  # >5% apart is a real disagreement
    text_a = re.sub(r"\s+", " ", str(a.value or "")).strip().lower()
    text_b = re.sub(r"\s+", " ", str(b.value or "")).strip().lower()
    if not text_a or not text_b:
        return False
    return text_a != text_b and text_a not in text_b and text_b not in text_a


def detect_conflicts(
    evidence: list[Evidence], sources: list[Source], hints: list[dict] | None = None
) -> list[Conflict]:
    """Deterministic pass over extracted values, plus any model-reported hints."""
    src_map = _index_sources(sources)
    grouped: dict[str, list[Evidence]] = {}
    for e in evidence:
        key = _value_key(e)
        if key:
            grouped.setdefault(key, []).append(e)

    conflicts: list[Conflict] = []
    seen: set[tuple[str, str]] = set()
    for key, items in grouped.items():
        for i, a in enumerate(items):
            for b in items[i + 1 :]:
                src_a, src_b = src_map.get(a.source_id), src_map.get(b.source_id)
                if not src_a or not src_b or src_a.domain == src_b.domain:
                    continue  # same site is not an independent disagreement
                if not _values_disagree(a, b):
                    continue
                pair = tuple(sorted((a.id, b.id)))
                if pair in seen:
                    continue
                seen.add(pair)
                subject, field = key.split("::", 1)
                conflicts.append(
                    Conflict(
                        claim=a.claim,
                        field=field.replace("_", " ") or None,
                        subject=subject.replace("_", " ") or None,
                        source_a=src_a.domain,
                        source_b=src_b.domain,
                        value_a=str(a.value),
                        value_b=str(b.value),
                        evidence_ids=[a.id, b.id],
                        resolution=_resolve(src_a, src_b),
                    )
                )
    conflicts.extend(_conflicts_from_hints(hints or [], evidence, src_map, seen))
    return conflicts[:8]


def _resolve(src_a: Source, src_b: Source) -> str:
    rank_a = QUALITY_RANK[src_a.source_quality]
    rank_b = QUALITY_RANK[src_b.source_quality]
    if rank_a != rank_b:
        better, worse = (src_a, src_b) if rank_a > rank_b else (src_b, src_a)
        return (
            f"Not silently resolved. {better.domain} is the higher-quality source "
            f"({better.source_quality} vs {worse.source_quality}), so its figure is more likely correct, "
            "but both values are shown and confidence is reduced."
        )
    return "Conflicting evidence found; confidence reduced. Neither source outranks the other."


def _conflicts_from_hints(
    hints: list[dict], evidence: list[Evidence], src_map: dict[str, Source], seen: set
) -> list[Conflict]:
    ev_map = {e.id: e for e in evidence}
    out: list[Conflict] = []
    for hint in hints:
        ids = [str(i).strip() for i in (hint.get("evidence_ids") or []) if str(i).strip() in ev_map]
        if len(ids) < 2:
            continue
        a, b = ev_map[ids[0]], ev_map[ids[1]]
        pair = tuple(sorted((a.id, b.id)))
        if pair in seen:
            continue
        src_a, src_b = src_map.get(a.source_id), src_map.get(b.source_id)
        if not src_a or not src_b or src_a.domain == src_b.domain:
            continue
        seen.add(pair)
        out.append(
            Conflict(
                claim=str(hint.get("claim") or a.claim)[:300],
                field=(str(hint["field"])[:60] if hint.get("field") not in (None, "", "null") else None),
                subject=(str(hint["subject"])[:120] if hint.get("subject") not in (None, "", "null") else None),
                source_a=src_a.domain,
                source_b=src_b.domain,
                value_a=str(a.value or a.snippet[:80]),
                value_b=str(b.value or b.snippet[:80]),
                evidence_ids=ids[:2],
                resolution=_resolve(src_a, src_b),
            )
        )
    return out


# -- cross-check + confidence ------------------------------------------------
def score_claims(claims: list[Claim], evidence: list[Evidence], sources: list[Source], conflicts: list[Conflict]) -> None:
    """Set cross_checked / conflicted / confidence on every claim. Deterministic."""
    ev_map = {e.id: e for e in evidence}
    src_map = _index_sources(sources)
    conflicted_ids = {i for c in conflicts for i in c.evidence_ids}

    for claim in claims:
        domains = set()
        best_quality = 0
        for eid in claim.evidence_ids:
            e = ev_map.get(eid)
            if not e:
                continue
            src = src_map.get(e.source_id)
            if src:
                domains.add(src.domain)
                best_quality = max(best_quality, QUALITY_RANK[src.source_quality])
        claim.cross_checked = len(domains) >= 2
        claim.conflicted = bool(set(claim.evidence_ids) & conflicted_ids)
        claim.confidence = _confidence(best_quality, claim.cross_checked, claim.conflicted)

    for e in evidence:
        src = src_map.get(e.source_id)
        quality = QUALITY_RANK[src.source_quality] if src else 1
        e.confidence = "HIGH" if quality == 3 else ("MEDIUM" if quality == 2 else "LOW")
        if e.id in conflicted_ids:
            e.confidence = "LOW"


def _confidence(best_quality: int, cross_checked: bool, conflicted: bool) -> Confidence:
    if conflicted:
        return "LOW"
    if best_quality >= 2 and cross_checked:
        return "HIGH"
    if best_quality >= 2:
        return "MEDIUM"
    if cross_checked:
        return "MEDIUM"
    return "LOW"


def overall_confidence(claims: list[Claim], sources: list[Source], conflicts: list[Conflict]) -> Confidence:
    retrieved = [s for s in sources if s.retrieved]
    if not claims or not retrieved:
        return "LOW"
    highs = sum(1 for c in claims if c.confidence == "HIGH")
    lows = sum(1 for c in claims if c.confidence == "LOW")
    ratio_high = highs / len(claims)
    if conflicts and len(conflicts) >= max(2, len(claims) // 3):
        return "LOW"
    if ratio_high >= 0.5 and len(retrieved) >= 3 and not conflicts:
        return "HIGH"
    if lows / len(claims) > 0.6:
        return "LOW"
    return "MEDIUM"
