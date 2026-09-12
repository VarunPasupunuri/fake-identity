"""Pydantic data models for the EvidenceX research pipeline."""
from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Status = Literal["PASS", "FAIL", "UNKNOWN"]
Confidence = Literal["HIGH", "MEDIUM", "LOW"]
Quality = Literal["HIGH", "MEDIUM", "LOW"]


class ResearchRequest(BaseModel):
    question: str = Field(min_length=3, max_length=2000)


class Constraint(BaseModel):
    name: str                       # human label, e.g. "Price"
    field: str                      # machine key, e.g. "price"
    operator: Literal["<=", "<", ">=", ">", "==", "!=", "contains", "exists", "boolean"]
    target: Any = None              # numeric / string / bool target
    unit: Optional[str] = None      # "INR", "GB", "days", ...
    hard_constraint: bool = True
    description: Optional[str] = None


class PlanStep(BaseModel):
    index: int
    title: str
    detail: Optional[str] = None


class ResearchPlan(BaseModel):
    question: str
    normalized_question: Optional[str] = None
    question_type: list[str] = []
    subquestions: list[str] = []
    research_steps: list[PlanStep] = []
    required_information: list[str] = []      # the dynamic research schema
    constraints: list[Constraint] = []
    entities: list[str] = []
    candidate_mode: bool = False              # question asks for N items meeting requirements
    candidate_noun: Optional[str] = None      # "laptop", "hotel", ...
    target_count: Optional[int] = None
    recency: Literal["none", "recent", "latest"] = "none"
    search_queries: list[str] = []


class Source(BaseModel):
    id: str
    url: str
    title: str = ""
    domain: str = ""
    source_quality: Quality = "LOW"
    quality_reason: Optional[str] = None
    visited: bool = False
    retrieved: bool = False
    status_note: Optional[str] = None         # why a page could not be used
    published_date: Optional[str] = None
    retrieved_text_chars: int = 0
    snippet_from_search: Optional[str] = None
    fetched_at: Optional[str] = None


class Evidence(BaseModel):
    id: str
    claim: str                                # what this snippet supports
    snippet: str                              # VERBATIM text from the retrieved page
    source_id: str
    field: Optional[str] = None               # maps to required_information / constraint field
    subject: Optional[str] = None             # candidate or entity this describes
    value: Optional[str] = None               # extracted normalized value
    unit: Optional[str] = None
    confidence: Confidence = "MEDIUM"
    verbatim_verified: bool = False           # snippet actually found in retrieved text


class Claim(BaseModel):
    id: str
    text: str
    evidence_ids: list[str] = []
    source_ids: list[str] = []
    confidence: Confidence = "LOW"
    verified: bool = False
    cross_checked: bool = False
    conflicted: bool = False
    subject: Optional[str] = None
    field: Optional[str] = None


class ConstraintResult(BaseModel):
    constraint: Constraint
    actual_value: Optional[str] = None
    expected_value: str = ""
    status: Status = "UNKNOWN"
    reason: Optional[str] = None
    evidence_ids: list[str] = []


class Candidate(BaseModel):
    id: str
    name: str
    attributes: dict[str, str] = {}
    attribute_evidence: dict[str, list[str]] = {}
    evidence_ids: list[str] = []
    source_ids: list[str] = []
    constraint_results: list[ConstraintResult] = []
    overall_status: Status = "UNKNOWN"
    reason: Optional[str] = None


class Conflict(BaseModel):
    claim: str
    field: Optional[str] = None
    subject: Optional[str] = None
    source_a: str
    source_b: str
    value_a: str
    value_b: str
    evidence_ids: list[str] = []
    resolution: str = "Conflicting evidence found; confidence reduced."


class AnswerSection(BaseModel):
    heading: str
    body: str
    evidence_ids: list[str] = []


class Answer(BaseModel):
    headline: str = ""
    summary: str = ""
    sections: list[AnswerSection] = []
    key_findings: list[Claim] = []
    unverified_notes: list[str] = []
    no_valid_result: bool = False
    no_valid_result_reason: Optional[str] = None
    limitations: list[str] = []


class ActivityEvent(BaseModel):
    ts: str
    stage: str
    label: str
    detail: Optional[str] = None
    level: Literal["info", "warn", "error", "success"] = "info"


class PipelineStage(BaseModel):
    key: str
    index: int
    label: str
    state: Literal["pending", "active", "complete", "failed", "skipped"] = "pending"
    note: Optional[str] = None


class ResearchResult(BaseModel):
    session_id: str
    question: str
    question_type: list[str] = []
    plan: Optional[ResearchPlan] = None
    stages: list[PipelineStage] = []
    activity: list[ActivityEvent] = []
    sources: list[Source] = []
    evidence: list[Evidence] = []
    claims: list[Claim] = []
    candidates: list[Candidate] = []
    constraints: list[Constraint] = []
    conflicts: list[Conflict] = []
    answer: Optional[Answer] = None
    overall_confidence: Confidence = "LOW"
    search_rounds: int = 0
    queries_used: list[str] = []
    errors: list[str] = []
    warnings: list[str] = []
    duration_seconds: float = 0.0
    completed: bool = False


class HealthResponse(BaseModel):
    status: str
    llm_provider: str
    llm_model: str
    llm_ready: bool
    llm_problem: Optional[str] = None
    search_engine: str
    search_ready: bool
    search_problem: Optional[str] = None
    limits: dict[str, int] = {}
