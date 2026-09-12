"""Stage 01-02: understand the question and build a research plan."""
from __future__ import annotations

import re
from datetime import date
from typing import Any

from .. import prompts
from ..llm import LLMClient, LLMError
from ..models import Constraint, PlanStep, ResearchPlan

VALID_TYPES = {
    "factual", "research", "comparison", "recommendation", "product", "travel",
    "education", "finance", "science", "technology", "current_events",
    "list_generation", "constraint_heavy", "multi_part", "explanatory",
}
VALID_OPERATORS = {"<=", "<", ">=", ">", "==", "!=", "contains", "exists", "boolean"}
RECENCY_WORDS = ("latest", "current", "today", "recent", "this week", "this month", "this year", "now", "newest")


def _as_list(value: Any, limit: int = 12) -> list[str]:
    if isinstance(value, str):
        value = [value]
    if not isinstance(value, list):
        return []
    out = []
    for item in value:
        text = str(item).strip()
        if text and text.lower() not in ("null", "none"):
            out.append(text[:400])
    return out[:limit]


def _coerce_target(raw: Any) -> Any:
    if isinstance(raw, (int, float, bool)) or raw is None:
        return raw
    text = str(raw).strip()
    if text.lower() in ("true", "yes", "required"):
        return True
    if text.lower() in ("false", "no"):
        return False
    cleaned = re.sub(r"[,₹$€£]", "", text)
    if re.fullmatch(r"-?\d+(\.\d+)?", cleaned):
        return float(cleaned) if "." in cleaned else int(cleaned)
    return text


def _parse_constraints(raw: Any) -> list[Constraint]:
    if not isinstance(raw, list):
        return []
    out: list[Constraint] = []
    seen: set[str] = set()
    for item in raw[:10]:
        if not isinstance(item, dict):
            continue
        operator = str(item.get("operator", "")).strip()
        if operator not in VALID_OPERATORS:
            continue
        name = str(item.get("name") or item.get("field") or "").strip()
        if not name:
            continue
        field = str(item.get("field") or name).strip().lower()
        field = re.sub(r"[^a-z0-9]+", "_", field).strip("_") or "value"
        if field in seen:
            continue
        seen.add(field)
        unit = item.get("unit")
        unit = None if unit in (None, "", "null", "none") else str(unit)[:20]
        out.append(
            Constraint(
                name=name[:60],
                field=field,
                operator=operator,  # type: ignore[arg-type]
                target=_coerce_target(item.get("target")),
                unit=unit,
                hard_constraint=bool(item.get("hard_constraint", True)),
                description=(str(item["description"])[:200] if item.get("description") else None),
            )
        )
    return out


def _fallback_plan(question: str) -> ResearchPlan:
    """Used only when the model's JSON is unusable — never fabricates facts."""
    return ResearchPlan(
        question=question,
        normalized_question=question,
        question_type=["research"],
        subquestions=[question],
        required_information=["Direct answer to the question", "Supporting details", "Source agreement"],
        research_steps=[
            PlanStep(index=1, title="Search the web for authoritative sources"),
            PlanStep(index=2, title="Retrieve and read the most relevant pages"),
            PlanStep(index=3, title="Extract verbatim evidence"),
            PlanStep(index=4, title="Cross-check important facts"),
            PlanStep(index=5, title="Generate an evidence-backed answer"),
        ],
        recency="latest" if any(w in question.lower() for w in RECENCY_WORDS) else "none",
        search_queries=[question],
    )


async def analyze_question(question: str, llm: LLMClient) -> ResearchPlan:
    """Ask the model to classify the question and design a research plan."""
    try:
        data = await llm.complete_json(
            prompts.ANALYZE_SYSTEM,
            prompts.ANALYZE_USER.format(question=question, today=date.today().isoformat()),
            max_tokens=2500,
        )
    except LLMError:
        raise
    if not isinstance(data, dict):
        return _fallback_plan(question)

    types = [t.strip().lower().replace(" ", "_") for t in _as_list(data.get("question_type"), 6)]
    types = [t for t in types if t in VALID_TYPES] or ["research"]

    constraints = _parse_constraints(data.get("constraints"))
    if constraints and "constraint_heavy" not in types:
        types.append("constraint_heavy")

    steps_raw = _as_list(data.get("research_steps"), 8)
    steps = [PlanStep(index=i + 1, title=s) for i, s in enumerate(steps_raw)]
    if not steps:
        steps = _fallback_plan(question).research_steps

    recency = str(data.get("recency", "none")).strip().lower()
    if recency not in ("none", "recent", "latest"):
        recency = "latest" if any(w in question.lower() for w in RECENCY_WORDS) else "none"

    target_count = data.get("target_count")
    try:
        target_count = int(target_count) if target_count not in (None, "", "null") else None
    except (TypeError, ValueError):
        target_count = None

    queries = _as_list(data.get("search_queries"), 6) or [question]

    candidate_mode = bool(data.get("candidate_mode")) and bool(constraints)

    return ResearchPlan(
        question=question,
        normalized_question=str(data.get("normalized_question") or question)[:500],
        question_type=types,
        entities=_as_list(data.get("entities"), 8),
        subquestions=_as_list(data.get("subquestions"), 8) or [question],
        required_information=_as_list(data.get("required_information"), 10) or ["Direct answer to the question"],
        research_steps=steps,
        constraints=constraints,
        candidate_mode=candidate_mode,
        candidate_noun=(str(data["candidate_noun"])[:40] if data.get("candidate_noun") not in (None, "", "null") else None),
        target_count=target_count,
        recency=recency,  # type: ignore[arg-type]
        search_queries=queries,
    )
