"""Runtime configuration for EvidenceX.

Everything is provider-agnostic: the LLM and the web-search engine are chosen
through environment variables so the agent is never locked to one vendor.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

try:  # optional, only for local development
    from dotenv import load_dotenv

    for _candidate in (
        Path(__file__).resolve().parent / ".env",
        Path(__file__).resolve().parent.parent / ".env",
    ):
        if _candidate.exists():
            load_dotenv(_candidate)
            break
except Exception:  # pragma: no cover - dotenv is a convenience only
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, "").strip() or default)
    except ValueError:
        return default


# --- Agent safety limits (section 6/39 of the spec) -------------------------
MAX_SEARCH_ROUNDS = _int("MAX_SEARCH_ROUNDS", 4)
MAX_SOURCES = _int("MAX_SOURCES", 12)
MAX_CANDIDATES = _int("MAX_CANDIDATES", 20)
MAX_QUERIES_PER_ROUND = _int("MAX_QUERIES_PER_ROUND", 4)
MAX_RESULTS_PER_QUERY = _int("MAX_RESULTS_PER_QUERY", 8)
PAGE_TIMEOUT_SECONDS = _int("PAGE_TIMEOUT_SECONDS", 20)
PAGE_MAX_CHARS = _int("PAGE_MAX_CHARS", 60000)
LLM_TIMEOUT_SECONDS = _int("LLM_TIMEOUT_SECONDS", 120)

USER_AGENT = os.getenv(
    "EVIDENCEX_USER_AGENT",
    "EvidenceXResearchBot/0.1 (+https://github.com/; respects robots.txt)",
)
RESPECT_ROBOTS = (os.getenv("RESPECT_ROBOTS", "true").strip().lower() != "false")


@dataclass
class LLMConfig:
    provider: str = field(default_factory=lambda: os.getenv("LLM_PROVIDER", "anthropic").strip().lower())
    api_key: str = field(default_factory=lambda: os.getenv("LLM_API_KEY", "").strip())
    model: str = field(default_factory=lambda: os.getenv("LLM_MODEL", "").strip())
    base_url: str = field(default_factory=lambda: os.getenv("LLM_BASE_URL", "").strip())

    DEFAULT_MODELS = {
        "anthropic": "claude-sonnet-5",
        "openai": "gpt-4o-mini",
        "openai_compatible": "",
        "ollama": "llama3.1",
    }
    DEFAULT_BASE_URLS = {
        "anthropic": "https://api.anthropic.com",
        "openai": "https://api.openai.com/v1",
        "openai_compatible": "",
        "ollama": "http://localhost:11434/v1",
    }

    def resolved_model(self) -> str:
        return self.model or self.DEFAULT_MODELS.get(self.provider, "")

    def resolved_base_url(self) -> str:
        return (self.base_url or self.DEFAULT_BASE_URLS.get(self.provider, "")).rstrip("/")

    def requires_key(self) -> bool:
        return self.provider not in ("ollama",)

    def problem(self) -> str | None:
        if self.provider not in self.DEFAULT_MODELS:
            return (
                f"LLM_PROVIDER='{self.provider}' is not supported. "
                f"Use one of: {', '.join(sorted(self.DEFAULT_MODELS))}."
            )
        if self.requires_key() and not self.api_key:
            return "LLM_API_KEY is not set. EvidenceX cannot reason without a language model."
        if not self.resolved_model():
            return "LLM_MODEL is not set and this provider has no default model."
        if not self.resolved_base_url():
            return "LLM_BASE_URL is not set and this provider has no default endpoint."
        return None


@dataclass
class SearchConfig:
    engine: str = field(default_factory=lambda: os.getenv("SEARCH_ENGINE", "tavily").strip().lower())
    api_key: str = field(default_factory=lambda: os.getenv("SEARCH_API_KEY", "").strip())
    base_url: str = field(default_factory=lambda: os.getenv("SEARCH_BASE_URL", "").strip())

    SUPPORTED = ("tavily", "brave", "serper", "searxng", "duckduckgo")
    KEYLESS = ("searxng", "duckduckgo")

    def problem(self) -> str | None:
        if self.engine not in self.SUPPORTED:
            return (
                f"SEARCH_ENGINE='{self.engine}' is not supported. "
                f"Use one of: {', '.join(self.SUPPORTED)}."
            )
        if self.engine not in self.KEYLESS and not self.api_key:
            return (
                f"SEARCH_API_KEY is not set for SEARCH_ENGINE='{self.engine}'. "
                "EvidenceX will not fabricate search results, so research cannot start."
            )
        if self.engine == "searxng" and not self.base_url:
            return "SEARCH_BASE_URL must point at your SearXNG instance when SEARCH_ENGINE=searxng."
        return None


LLM = LLMConfig()
SEARCH = SearchConfig()


def reload() -> None:
    """Re-read the environment (used by tests)."""
    global LLM, SEARCH
    LLM = LLMConfig()
    SEARCH = SearchConfig()
