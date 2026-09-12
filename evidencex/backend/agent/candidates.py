"""Assemble candidate items from evidence, then hand them to the constraint engine."""
from __future__ import annotations

from .. import config, prompts
from ..llm import LLMClient, LLMError
from ..models import Candidate, Constraint, Evidence, Source
from .constraints import evaluate_candidate
from .verifier import evidence_block


async def build_candidates(
    *,
    question: str,
    noun: str | None,
    constraints: list[Constraint],
    evidence: list[Evidence],
    sources: list[Source],
    llm: LLMClient,
) -> list[Candidate]:
    if not evidence or not constraints:
        return []
    src_map = {s.id: s for s in sources}
    valid_ids = {e.id for e in evidence}
    ev_map = {e.id: e for e in evidence}

    constraint_lines = "\n".join(
        f"- field '{c.field}' ({c.name}): {c.operator} {c.target} {c.unit or ''}".rstrip()
        for c in constraints
    )
    try:
        data = await llm.complete_json(
            prompts.CANDIDATE_SYSTEM,
            prompts.CANDIDATE_USER.format(
                question=question,
                noun=noun or "matching item",
                constraints=constraint_lines,
                evidence=evidence_block(evidence, src_map),
                max_candidates=config.MAX_CANDIDATES,
            ),
            max_tokens=3500,
        )
    except LLMError:
        return []
    if not isinstance(data, dict):
        return []

    out: list[Candidate] = []
    for i, item in enumerate(data.get("candidates", [])[: config.MAX_CANDIDATES]):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "").strip()
        ids = [str(x).strip() for x in (item.get("evidence_ids") or []) if str(x).strip() in valid_ids]
        attr_evidence_raw = item.get("attribute_evidence") or {}
        attr_evidence: dict[str, list[str]] = {}
        if isinstance(attr_evidence_raw, dict):
            for key, value in attr_evidence_raw.items():
                cleaned = [str(x).strip() for x in (value or []) if str(x).strip() in valid_ids]
                if cleaned:
                    attr_evidence[str(key)] = cleaned
                    ids.extend(cleaned)
        ids = sorted(set(ids), key=lambda x: int(x[1:]) if x[1:].isdigit() else 0)
        if not name or not ids:
            continue  # a candidate with no real evidence behind it does not exist

        attributes = {}
        raw_attrs = item.get("attributes") or {}
        if isinstance(raw_attrs, dict):
            for key, value in raw_attrs.items():
                if value in (None, "", "null"):
                    continue
                attributes[str(key)] = str(value)[:160]

        candidate = Candidate(
            id=f"K{i + 1}",
            name=name[:160],
            attributes=attributes,
            attribute_evidence=attr_evidence,
            evidence_ids=ids,
            source_ids=sorted({ev_map[e].source_id for e in ids}),
        )
        out.append(evaluate_candidate(candidate, constraints))

    order = {"PASS": 0, "UNKNOWN": 1, "FAIL": 2}
    out.sort(key=lambda c: (order.get(c.overall_status, 3), c.name.lower()))
    return out
