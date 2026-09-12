"""Stage 08: generate the final answer, then validate it against the evidence.

The validation pass (spec §41) is the last safety gate: any citation the model
produced that does not exist is stripped, and any section left with no evidence
at all is flagged as unverified rather than presented as fact.
"""
from __future__ import annotations

import re
from datetime import date

from .. import prompts
from ..llm import LLMClient, LLMError
from ..models import (
    Answer, AnswerSection, Candidate, Claim, Conflict, Constraint, Evidence, Source,
)
from .verifier import evidence_block

CITATION = re.compile(r"\[(E\d+)\]")


def _constraint_block(constraints: list[Constraint], candidates: list[Candidate]) -> str:
    if not constraints:
        return "REQUIREMENT CHECK: this question states no hard requirements, so do not produce a pass/fail table."
    lines = ["REQUIREMENT CHECK (already decided by deterministic code — do not re-decide it):"]
    for c in constraints:
        lines.append(f"- {c.name}: {c.operator} {c.target} {c.unit or ''}".rstrip())
    if candidates:
        lines.append("")
        lines.append("CANDIDATES EVALUATED:")
        for cand in candidates:
            cells = ", ".join(
                f"{r.constraint.name}={r.status}" + (f" ({r.actual_value})" if r.actual_value else "")
                for r in cand.constraint_results
            )
            lines.append(f"- {cand.name} -> {cand.overall_status} [{cells}]")
        passing = [c.name for c in candidates if c.overall_status == "PASS"]
        lines.append("")
        lines.append(
            f"{len(passing)} candidate(s) satisfy every hard requirement: "
            + (", ".join(passing) if passing else "none")
        )
        lines.append("UNKNOWN means evidence was missing. UNKNOWN is never a pass. Report it honestly.")
    else:
        lines.append("No candidate items could be assembled from the retrieved evidence.")
    return "\n".join(lines)


def _conflict_block(conflicts: list[Conflict]) -> str:
    if not conflicts:
        return "SOURCE CONFLICTS: none detected."
    lines = ["SOURCE CONFLICTS DETECTED (you must mention these, do not silently pick one):"]
    for c in conflicts:
        lines.append(f"- {c.claim}: {c.source_a} says '{c.value_a}' but {c.source_b} says '{c.value_b}'.")
    return "\n".join(lines)


def _gap_block(gaps: list[str], failed_sources: list[Source]) -> str:
    lines = []
    if gaps:
        lines.append("FACTS THE EVIDENCE DOES NOT ESTABLISH (say so plainly):")
        lines += [f"- {g}" for g in gaps]
    if failed_sources:
        lines.append("")
        lines.append("SOURCES THAT COULD NOT BE RETRIEVED (never cite these):")
        lines += [f"- {s.domain}: {s.status_note}" for s in failed_sources[:6]]
    return "\n".join(lines) or "No coverage gaps were reported."


async def generate_answer(
    *,
    question: str,
    question_type: list[str],
    evidence: list[Evidence],
    claims: list[Claim],
    sources: list[Source],
    constraints: list[Constraint],
    candidates: list[Candidate],
    conflicts: list[Conflict],
    gaps: list[str],
    llm: LLMClient,
) -> Answer:
    src_map = {s.id: s for s in sources}
    failed = [s for s in sources if s.visited and not s.retrieved]

    if not evidence:
        return Answer(
            headline="No answer could be evidenced.",
            summary=(
                "EvidenceX did not retrieve any usable source text for this question, so it has nothing "
                "to stand behind. No answer is given rather than an unsupported one."
            ),
            no_valid_result=True,
            no_valid_result_reason="No source could be retrieved and read.",
            limitations=[s.status_note or "Source unavailable." for s in failed[:5]],
        )

    claims_text = "\n".join(f"- {c.text} {c.evidence_ids}" for c in claims[:12]) or "- (none synthesised)"
    try:
        data = await llm.complete_json(
            prompts.ANSWER_SYSTEM,
            prompts.ANSWER_USER.format(
                question=question,
                qtype=", ".join(question_type),
                today=date.today().isoformat(),
                evidence=evidence_block(evidence, src_map, with_date=True),
                claims=claims_text,
                constraint_block=_constraint_block(constraints, candidates),
                conflict_block=_conflict_block(conflicts),
                gap_block=_gap_block(gaps, failed),
            ),
            max_tokens=3500,
        )
    except LLMError as exc:
        return Answer(
            headline="The answer could not be generated.",
            summary=f"Research completed but the language model failed during answer generation: {exc}",
            limitations=["Evidence below was still collected and verified and can be read directly."],
        )
    if not isinstance(data, dict):
        data = {}

    answer = Answer(
        headline=str(data.get("headline") or "")[:400],
        summary=str(data.get("summary") or "")[:2000],
        unverified_notes=[str(x)[:300] for x in (data.get("unverified_notes") or [])][:6],
        limitations=[str(x)[:300] for x in (data.get("limitations") or [])][:6],
        no_valid_result=bool(data.get("no_valid_result")),
        no_valid_result_reason=(
            str(data["no_valid_result_reason"])[:400]
            if data.get("no_valid_result_reason") not in (None, "", "null")
            else None
        ),
    )
    for section in (data.get("sections") or [])[:6]:
        if not isinstance(section, dict):
            continue
        heading = str(section.get("heading") or "").strip()
        body = str(section.get("body") or "").strip()
        if not heading or not body:
            continue
        answer.sections.append(
            AnswerSection(
                heading=heading[:80].upper(),
                body=body[:3000],
                evidence_ids=[str(x).strip() for x in (section.get("evidence_ids") or [])][:12],
            )
        )
    answer.key_findings = claims[:8]
    return answer


def validate_answer(
    answer: Answer,
    evidence: list[Evidence],
    candidates: list[Candidate],
    constraints: list[Constraint],
    target_count: int | None,
) -> Answer:
    """Strip invented citations and force honesty about the no-valid-result case."""
    valid_ids = {e.id for e in evidence}
    stripped = 0

    def clean(text: str) -> str:
        nonlocal stripped

        def repl(match: re.Match) -> str:
            nonlocal stripped
            if match.group(1) in valid_ids:
                return match.group(0)
            stripped += 1
            return ""

        return re.sub(r"\s*\[(E\d+)\]", lambda m: repl(m) or "", text)

    answer.summary = clean(answer.summary)
    kept_sections: list[AnswerSection] = []
    for section in answer.sections:
        section.body = clean(section.body)
        section.evidence_ids = [i for i in section.evidence_ids if i in valid_ids]
        if not section.evidence_ids:
            section.evidence_ids = sorted(set(CITATION.findall(section.body)))
        kept_sections.append(section)
    answer.sections = kept_sections
    answer.key_findings = [c for c in answer.key_findings if c.evidence_ids]

    if stripped:
        answer.unverified_notes.append(
            f"{stripped} citation(s) produced by the model did not match any retrieved evidence and were removed."
        )

    # Deterministic override of the no-valid-result verdict for candidate questions.
    if constraints and candidates:
        passing = [c for c in candidates if c.overall_status == "PASS"]
        required = target_count or 1
        if len(passing) < required:
            answer.no_valid_result = True
            failing = len(candidates) - len(passing)
            answer.no_valid_result_reason = (
                f"{len(passing)} of the {len(candidates)} candidate(s) examined satisfy every hard requirement; "
                f"{required} were asked for. {failing} candidate(s) failed or could not be verified."
            )
        elif answer.no_valid_result:
            answer.no_valid_result = False
            answer.no_valid_result_reason = None
    elif constraints and not candidates:
        answer.no_valid_result = True
        answer.no_valid_result_reason = (
            "No candidate item could be assembled from evidence that was actually retrieved, "
            "so no item can be reported as satisfying the requirements."
        )
    return answer
