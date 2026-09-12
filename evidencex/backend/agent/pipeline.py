"""The EvidenceX agent loop.

    understand -> plan -> search -> visit -> extract -> verify -> cross-check -> answer

The loop is adaptive: after the first round of extraction it asks whether the
evidence actually covers what the question needs, and searches again for the
gaps until it has enough or hits MAX_SEARCH_ROUNDS.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from datetime import datetime, timezone
from typing import AsyncIterator, Callable

from .. import config
from ..llm import LLMClient, LLMError
from ..models import (
    ActivityEvent, Evidence, PipelineStage, ResearchPlan, ResearchResult, Source,
)
from ..services.search import SearchService, SearchUnavailable
from ..services.webpage import open_pages
from . import answer as answer_stage
from . import candidates as candidate_stage
from . import extractor, planner, researcher, verifier

STAGES = [
    ("understand", "UNDERSTAND"),
    ("plan", "PLAN"),
    ("search", "SEARCH"),
    ("visit", "VISIT"),
    ("extract", "EXTRACT"),
    ("verify", "VERIFY"),
    ("crosscheck", "CROSS-CHECK"),
    ("answer", "ANSWER"),
]

Emitter = Callable[[ResearchResult], None] | None


def _now() -> str:
    return datetime.now(timezone.utc).strftime("%H:%M:%S")


class ResearchRun:
    """Holds mutable state for one research session and emits progress snapshots."""

    def __init__(self, question: str, emit: Emitter = None) -> None:
        self.result = ResearchResult(
            session_id=uuid.uuid4().hex[:8].upper(),
            question=question,
            stages=[PipelineStage(key=k, index=i + 1, label=l) for i, (k, l) in enumerate(STAGES)],
        )
        self._emit = emit
        self._started = time.monotonic()

    # -- progress plumbing -------------------------------------------------
    def log(self, stage: str, label: str, detail: str | None = None, level: str = "info") -> None:
        self.result.activity.append(
            ActivityEvent(ts=_now(), stage=stage, label=label.upper(), detail=detail, level=level)  # type: ignore[arg-type]
        )
        self.push()

    def stage(self, key: str, state: str, note: str | None = None) -> None:
        for s in self.result.stages:
            if s.key == key:
                s.state = state  # type: ignore[assignment]
                if note:
                    s.note = note
        self.push()

    def push(self) -> None:
        self.result.duration_seconds = round(time.monotonic() - self._started, 2)
        if self._emit:
            self._emit(self.result)

    def fail(self, stage_key: str, message: str) -> ResearchResult:
        self.stage(stage_key, "failed")
        for s in self.result.stages:
            if s.state == "pending":
                s.state = "skipped"
        self.result.errors.append(message)
        self.result.completed = True
        self.log(stage_key, "RESEARCH INTERRUPTED", message, level="error")
        return self.result


async def run_research(question: str, emit: Emitter = None) -> ResearchResult:
    run = ResearchRun(question, emit)
    result = run.result
    llm = LLMClient()
    search = SearchService()

    llm_problem = llm.cfg.problem()
    if llm_problem:
        return run.fail("understand", llm_problem)
    search_problem = search.cfg.problem()
    if search_problem:
        return run.fail("search", search_problem)

    run.log("understand", "RESEARCH SESSION OPENED", f"Session {result.session_id}", level="success")

    # -- 01 UNDERSTAND -----------------------------------------------------
    run.stage("understand", "active")
    try:
        plan: ResearchPlan = await planner.analyze_question(question, llm)
    except LLMError as exc:
        return run.fail("understand", str(exc))
    result.plan = plan
    result.question_type = plan.question_type
    result.constraints = plan.constraints
    run.stage("understand", "complete", ", ".join(plan.question_type))
    run.log("understand", "QUESTION ANALYZED", f"Type: {', '.join(plan.question_type)}", level="success")
    if plan.constraints:
        run.log(
            "understand",
            "HARD REQUIREMENTS IDENTIFIED",
            "; ".join(f"{c.name} {c.operator} {c.target}{' ' + c.unit if c.unit else ''}" for c in plan.constraints),
        )

    # -- 02 PLAN -----------------------------------------------------------
    run.stage("plan", "active")
    run.stage("plan", "complete", f"{len(plan.research_steps)} steps")
    run.log("plan", "RESEARCH PLAN CREATED", f"{len(plan.research_steps)} steps, {len(plan.subquestions)} subquestions", level="success")

    # -- the adaptive research loop ---------------------------------------
    sources: list[Source] = []
    evidence: list[Evidence] = []
    visited_urls: set[str] = set()
    used_domains: dict[str, int] = {}
    queries = list(plan.search_queries)[: config.MAX_QUERIES_PER_ROUND]
    gaps: list[str] = []
    conflict_hints: list[dict] = []
    claims = []
    rejected_snippets = 0
    source_counter = 0
    evidence_counter = 0

    for round_index in range(config.MAX_SEARCH_ROUNDS):
        if not queries or len(sources) >= config.MAX_SOURCES:
            break
        result.search_rounds = round_index + 1

        # -- 03 SEARCH -----------------------------------------------------
        run.stage("search", "active", f"round {round_index + 1}")
        found = []
        for query in queries[: config.MAX_QUERIES_PER_ROUND]:
            run.log("search", "SEARCH QUERY ISSUED", query)
            try:
                hits = await search.search(query, recent=plan.recency in ("recent", "latest"))
            except SearchUnavailable as exc:
                if not sources:
                    return run.fail("search", str(exc))
                result.warnings.append(str(exc))
                run.log("search", "SEARCH DEGRADED", str(exc), level="warn")
                break
            result.queries_used.append(query)
            found.extend(hits)
            run.log("search", "RESULTS RETURNED", f"{len(hits)} results for “{query}”")
        if not found and not sources:
            return run.fail("search", "The search provider returned no results for this question.")

        remaining = config.MAX_SOURCES - len(sources)
        picked = researcher.rank_and_select(
            found,
            already_used=visited_urls,
            used_domains=used_domains,
            limit=min(remaining, 6),
            entities=plan.entities,
        )
        if not picked:
            run.log("search", "NO NEW SOURCES", "Every result was already visited or filtered out.", level="warn")
            break
        run.stage("search", "complete", f"{len(result.queries_used)} queries")

        # -- 04 VISIT ------------------------------------------------------
        run.stage("visit", "active")
        round_sources: list[Source] = []
        for hit in picked:
            source_counter += 1
            src = researcher.source_from_result(f"S{source_counter}", hit, plan.entities)
            round_sources.append(src)
            visited_urls.add(hit.url)
            used_domains[src.domain] = used_domains.get(src.domain, 0) + 1
        sources.extend(round_sources)
        result.sources = sources
        run.log("visit", "SOURCES SELECTED", f"{len(round_sources)} pages queued for retrieval")

        pages = await open_pages([s.url for s in round_sources])
        page_by_url = {}
        for src, page in zip(round_sources, pages):
            src.visited = True
            src.retrieved = page.ok
            src.fetched_at = page.fetched_at
            src.status_note = page.status_note
            src.retrieved_text_chars = len(page.text)
            if page.ok:
                src.title = page.title or src.title
                src.published_date = page.published_date or src.published_date
                page_by_url[src.id] = page
                run.log("visit", "SOURCE RETRIEVED", f"{src.domain} — {len(page.text):,} chars · {src.source_quality} quality", level="success")
            else:
                run.log("visit", "SOURCE UNAVAILABLE", f"{src.domain} — {page.status_note}", level="warn")
        run.stage("visit", "complete", f"{sum(1 for s in sources if s.retrieved)}/{len(sources)} retrieved")

        if not page_by_url:
            queries = []
            continue

        # -- 05 EXTRACT ----------------------------------------------------
        run.stage("extract", "active")
        needs = plan.required_information + plan.subquestions
        tasks = []
        for src in round_sources:
            page = page_by_url.get(src.id)
            if not page:
                continue
            tasks.append((src, page))

        for src, page in tasks:
            found_evidence, rejected = await extractor.extract_evidence(
                question=plan.normalized_question or question,
                needs=needs,
                page=page,
                source=src,
                llm=llm,
                start_index=evidence_counter,
                candidate_noun=plan.candidate_noun if plan.candidate_mode else None,
            )
            evidence_counter += len(found_evidence)
            rejected_snippets += rejected
            evidence.extend(found_evidence)
            result.evidence = evidence
            if found_evidence:
                run.log("extract", "EVIDENCE EXTRACTED", f"{len(found_evidence)} verbatim snippets from {src.domain}", level="success")
            else:
                run.log("extract", "NO USABLE EVIDENCE", f"{src.domain} had nothing that answers this question", level="warn")
            if rejected:
                run.log(
                    "extract", "SNIPPETS REJECTED",
                    f"{rejected} snippet(s) from {src.domain} were not found verbatim in the page and were discarded",
                    level="warn",
                )
        run.stage("extract", "complete", f"{len(evidence)} verified snippets")

        # -- 06 VERIFY (coverage check drives the loop) ---------------------
        run.stage("verify", "active")
        claims, conflict_hints, gaps, followups = await verifier.synthesize_claims(
            question=plan.normalized_question or question,
            subquestions=plan.subquestions,
            evidence=evidence,
            sources=sources,
            llm=llm,
        )
        result.claims = claims
        run.log("verify", "CLAIMS SYNTHESISED", f"{len(claims)} claims, each tied to retrieved evidence", level="success")

        enough = bool(claims) and not gaps
        last_round = round_index == config.MAX_SEARCH_ROUNDS - 1
        if enough or last_round or len(sources) >= config.MAX_SOURCES:
            if gaps and (last_round or len(sources) >= config.MAX_SOURCES):
                run.log("verify", "COVERAGE GAPS REMAIN", "; ".join(gaps[:3]), level="warn")
            break
        run.log("verify", "EVIDENCE INCOMPLETE", f"Searching again for: {'; '.join(gaps[:3])}", level="warn")
        queries = followups or [f"{question} {g}" for g in gaps[:2]]

    if not sources:
        return run.fail("search", "No sources could be selected for this question.")

    result.evidence = evidence
    if rejected_snippets:
        result.warnings.append(
            f"{rejected_snippets} model-produced snippet(s) failed the verbatim check against the "
            "downloaded page text and were discarded."
        )

    # -- 07 CROSS-CHECK ----------------------------------------------------
    run.stage("verify", "complete", f"{len(claims)} claims")
    run.stage("crosscheck", "active")
    conflicts = verifier.detect_conflicts(evidence, sources, conflict_hints)
    verifier.score_claims(claims, evidence, sources, conflicts)
    result.conflicts = conflicts
    result.claims = claims
    cross_checked = sum(1 for c in claims if c.cross_checked)
    run.log(
        "crosscheck", "CROSS-CHECK COMPLETE",
        f"{cross_checked}/{len(claims)} claims confirmed by 2+ independent domains",
        level="success" if cross_checked else "warn",
    )
    if conflicts:
        run.log("crosscheck", "SOURCE CONFLICT DETECTED", f"{len(conflicts)} disagreement(s) between sources", level="warn")

    built_candidates = []
    if plan.candidate_mode and plan.constraints:
        run.log("crosscheck", "CHECKING HARD REQUIREMENTS", f"{len(plan.constraints)} requirements against each candidate")
        built_candidates = await candidate_stage.build_candidates(
            question=plan.normalized_question or question,
            noun=plan.candidate_noun,
            constraints=plan.constraints,
            evidence=evidence,
            sources=sources,
            llm=llm,
        )
        result.candidates = built_candidates
        passing = sum(1 for c in built_candidates if c.overall_status == "PASS")
        run.log(
            "crosscheck", "REQUIREMENT MATRIX COMPLETE",
            f"{passing} of {len(built_candidates)} candidate(s) satisfy every hard requirement",
            level="success" if passing else "warn",
        )
    run.stage("crosscheck", "complete", f"{len(conflicts)} conflicts")

    # -- 08 ANSWER ---------------------------------------------------------
    run.stage("answer", "active")
    final = await answer_stage.generate_answer(
        question=question,
        question_type=plan.question_type,
        evidence=evidence,
        claims=claims,
        sources=sources,
        constraints=plan.constraints,
        candidates=built_candidates,
        conflicts=conflicts,
        gaps=gaps,
        llm=llm,
    )
    final = answer_stage.validate_answer(final, evidence, built_candidates, plan.constraints, plan.target_count)
    result.answer = final
    result.overall_confidence = verifier.overall_confidence(claims, sources, conflicts)
    run.stage("answer", "complete", result.overall_confidence)
    run.log("answer", "ANSWER GENERATED", f"Overall confidence: {result.overall_confidence}", level="success")
    if final.no_valid_result:
        run.log("answer", "NO FULLY VALID RESULT", final.no_valid_result_reason or "", level="warn")

    result.completed = True
    run.push()
    return result


async def stream_research(question: str) -> AsyncIterator[ResearchResult]:
    """Run the pipeline, yielding a snapshot whenever progress is made."""
    queue: asyncio.Queue[ResearchResult | None] = asyncio.Queue()

    def emit(res: ResearchResult) -> None:
        queue.put_nowait(res.model_copy(deep=True))

    async def runner() -> None:
        try:
            await run_research(question, emit)
        except Exception as exc:  # pragma: no cover - defensive
            failed = ResearchResult(
                session_id="ERROR", question=question, completed=True,
                errors=[f"Unexpected error: {type(exc).__name__}: {exc}"],
                stages=[PipelineStage(key=k, index=i + 1, label=l, state="failed") for i, (k, l) in enumerate(STAGES)],
            )
            queue.put_nowait(failed)
        finally:
            queue.put_nowait(None)

    task = asyncio.create_task(runner())
    try:
        while True:
            snapshot = await queue.get()
            if snapshot is None:
                break
            yield snapshot
    finally:
        if not task.done():
            task.cancel()
