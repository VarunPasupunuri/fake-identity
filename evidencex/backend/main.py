"""EvidenceX API.

    GET  /api/health                 provider readiness
    POST /api/research               run the full pipeline, return the result
    GET  /api/research/stream?q=...  server-sent events with live progress
"""
from __future__ import annotations

import asyncio
import json
import os

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from . import config
from .agent.pipeline import run_research, stream_research
from .llm import LLMClient
from .models import HealthResponse, ResearchRequest, ResearchResult
from .services.search import SearchService

app = FastAPI(title="EvidenceX", version="0.1.0", description="Research. Verify. Prove.")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    config.reload()
    llm, search = LLMClient(), SearchService()
    llm_problem = llm.cfg.problem()
    search_problem = search.cfg.problem()
    return HealthResponse(
        status="ok" if not (llm_problem or search_problem) else "setup_required",
        llm_provider=llm.cfg.provider,
        llm_model=llm.cfg.resolved_model(),
        llm_ready=llm_problem is None,
        llm_problem=llm_problem,
        search_engine=search.cfg.engine,
        search_ready=search_problem is None,
        search_problem=search_problem,
        limits={
            "max_search_rounds": config.MAX_SEARCH_ROUNDS,
            "max_sources": config.MAX_SOURCES,
            "max_candidates": config.MAX_CANDIDATES,
        },
    )


@app.post("/api/research", response_model=ResearchResult)
async def research(payload: ResearchRequest) -> ResearchResult:
    question = payload.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="A question is required.")
    return await run_research(question)


@app.get("/api/research/stream")
async def research_stream(q: str = Query(..., min_length=3, max_length=2000)) -> StreamingResponse:
    question = q.strip()

    async def events():
        yield "retry: 3000\n\n"
        try:
            async for snapshot in stream_research(question):
                payload = json.dumps(snapshot.model_dump(mode="json"), ensure_ascii=False)
                yield f"event: progress\ndata: {payload}\n\n"
                await asyncio.sleep(0)
            yield "event: done\ndata: {}\n\n"
        except asyncio.CancelledError:  # client navigated away
            raise
        except Exception as exc:  # pragma: no cover - defensive
            yield f"event: error\ndata: {json.dumps({'message': str(exc)})}\n\n"

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
