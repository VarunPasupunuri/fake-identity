"""Provider-agnostic LLM client.

Supports Anthropic's Messages API and any OpenAI-compatible chat endpoint
(OpenAI, Groq, OpenRouter, Together, vLLM, Ollama, ...). The rest of the
codebase only ever calls `complete_json` / `complete_text`.
"""
from __future__ import annotations

import json
import re
from typing import Any

import httpx

from . import config


class LLMError(RuntimeError):
    """Raised when the language model is unavailable or returns nothing usable."""


def _extract_json(text: str) -> Any:
    """Pull the first JSON object/array out of a model response."""
    text = (text or "").strip()
    if not text:
        raise LLMError("The language model returned an empty response.")
    fenced = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fenced:
        text = fenced.group(1).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    # fall back to the outermost {...} or [...]
    for opener, closer in (("{", "}"), ("[", "]")):
        start = text.find(opener)
        end = text.rfind(closer)
        if start != -1 and end > start:
            chunk = text[start : end + 1]
            try:
                return json.loads(chunk)
            except json.JSONDecodeError:
                continue
    raise LLMError("The language model did not return valid JSON.")


class LLMClient:
    def __init__(self, cfg: config.LLMConfig | None = None) -> None:
        self.cfg = cfg or config.LLM

    def ready(self) -> bool:
        return self.cfg.problem() is None

    async def complete_text(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int = 2000,
        temperature: float = 0.0,
    ) -> str:
        problem = self.cfg.problem()
        if problem:
            raise LLMError(problem)
        if self.cfg.provider == "anthropic":
            return await self._anthropic(system, user, max_tokens, temperature)
        return await self._openai_compatible(system, user, max_tokens, temperature)

    async def complete_json(
        self,
        system: str,
        user: str,
        *,
        max_tokens: int = 3000,
        temperature: float = 0.0,
        retries: int = 1,
    ) -> Any:
        last_error: Exception | None = None
        for attempt in range(retries + 1):
            raw = await self.complete_text(
                system + "\n\nRespond with valid JSON only. No prose, no code fences.",
                user if attempt == 0 else user + "\n\nYour previous reply was not valid JSON. Reply with JSON only.",
                max_tokens=max_tokens,
                temperature=temperature,
            )
            try:
                return _extract_json(raw)
            except LLMError as exc:  # pragma: no cover - retry path
                last_error = exc
        raise LLMError(str(last_error) if last_error else "No JSON returned.")

    # -- providers ---------------------------------------------------------
    async def _anthropic(self, system: str, user: str, max_tokens: int, temperature: float) -> str:
        url = f"{self.cfg.resolved_base_url()}/v1/messages"
        payload = {
            "model": self.cfg.resolved_model(),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "system": system,
            "messages": [{"role": "user", "content": user}],
        }
        headers = {
            "x-api-key": self.cfg.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        data = await self._post(url, payload, headers)
        parts = [b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"]
        return "".join(parts).strip()

    async def _openai_compatible(self, system: str, user: str, max_tokens: int, temperature: float) -> str:
        url = f"{self.cfg.resolved_base_url()}/chat/completions"
        payload = {
            "model": self.cfg.resolved_model(),
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        headers = {"content-type": "application/json"}
        if self.cfg.api_key:
            headers["Authorization"] = f"Bearer {self.cfg.api_key}"
        data = await self._post(url, payload, headers)
        choices = data.get("choices") or []
        if not choices:
            raise LLMError("The language model returned no choices.")
        return (choices[0].get("message", {}).get("content") or "").strip()

    async def _post(self, url: str, payload: dict, headers: dict) -> dict:
        try:
            async with httpx.AsyncClient(timeout=config.LLM_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload, headers=headers)
        except httpx.HTTPError as exc:
            raise LLMError(f"Could not reach the language model at {url}: {exc}") from exc
        if resp.status_code == 401 or resp.status_code == 403:
            raise LLMError("The language model rejected the API key (check LLM_API_KEY).")
        if resp.status_code == 429:
            raise LLMError("The language model is rate limiting this key. Try again shortly.")
        if resp.status_code >= 400:
            raise LLMError(f"Language model error {resp.status_code}: {resp.text[:300]}")
        try:
            return resp.json()
        except ValueError as exc:
            raise LLMError("The language model returned a non-JSON HTTP body.") from exc
