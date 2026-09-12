"""Deterministic constraint engine.

The language model may *identify* constraints and *extract* candidate values,
but the PASS / FAIL / UNKNOWN decision is made here, in Python, from parsed
values. The single most important rule of this module:

    UNKNOWN NEVER BECOMES PASS.
"""
from __future__ import annotations

import re
from typing import Any, Iterable

from ..models import Candidate, Constraint, ConstraintResult, Status

TRUE_WORDS = {
    "yes", "true", "y", "available", "included", "include", "included.", "provided",
    "offered", "free", "complimentary", "present", "supported", "with", "has", "in stock",
}
FALSE_WORDS = {
    "no", "false", "n", "unavailable", "not available", "not included", "excluded",
    "none", "absent", "unsupported", "without", "out of stock", "paid extra", "extra",
}
UNKNOWN_WORDS = {
    "", "unknown", "n/a", "na", "-", "--", "tbd", "not specified", "not stated",
    "unspecified", "not mentioned", "null", "none found", "not found",
}

_MULTIPLIERS = (
    (r"\bcrore[s]?\b|\bcr\b", 10_000_000),
    (r"\blakh[s]?\b|\blac[s]?\b", 100_000),
    (r"\bmillion[s]?\b|\bmn\b|\bm\b(?![a-z])", 1_000_000),
    (r"\bbillion[s]?\b|\bbn\b", 1_000_000_000),
    (r"\bthousand[s]?\b|\bk\b(?![a-z])", 1_000),
)
_UNIT_SCALE = {
    "tb": 1024.0, "terabyte": 1024.0, "terabytes": 1024.0,
    "gb": 1.0, "gigabyte": 1.0, "gigabytes": 1.0,
    "mb": 1 / 1024.0, "megabyte": 1 / 1024.0, "megabytes": 1 / 1024.0,
}
_CURRENCY_CHARS = "₹$€£¥"


def normalize_text(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value if value is not None else "")).strip()


def is_unknown(value: Any) -> bool:
    return normalize_text(value).lower() in UNKNOWN_WORDS


def parse_boolean(value: Any) -> bool | None:
    text = normalize_text(value).lower().strip(" .!")
    if not text or text in UNKNOWN_WORDS:
        return None
    if text in TRUE_WORDS:
        return True
    if text in FALSE_WORDS:
        return False
    # Look for a negation before an affirmative word ("breakfast not included")
    if re.search(r"\b(not|no|without|excluding|excluded)\b", text):
        return False
    for word in TRUE_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", text):
            return True
    return None


def parse_number(value: Any, *, unit: str | None = None, prefer: str = "max") -> float | None:
    """Parse a human-written quantity into a float.

    Handles currency symbols and grouping, Indian/Western magnitude words,
    storage units, and ranges ("2-4 days"). `prefer` chooses which end of a
    range to use so the comparison stays conservative.
    """
    text = normalize_text(value).lower()
    if not text or text in UNKNOWN_WORDS:
        return None

    for ch in _CURRENCY_CHARS:
        text = text.replace(ch, " ")
    text = re.sub(r"\b(rs\.?|inr|usd|eur|gbp|jpy|aud|cad)\b", " ", text)
    text = text.replace(",", "")
    text = re.sub(r"[–—]", "-", text)

    multiplier = 1.0
    for pattern, factor in _MULTIPLIERS:
        if re.search(pattern, text):
            multiplier = float(factor)
            break

    unit_scale = 1.0
    hinted = (unit or "").strip().lower()
    for token, scale in _UNIT_SCALE.items():
        if re.search(rf"\b{token}\b", text):
            unit_scale = scale
            break
    else:
        if hinted in _UNIT_SCALE and hinted != "gb":
            unit_scale = 1.0  # value carried no unit; assume it is already in the hinted unit

    numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", text)]
    if not numbers:
        return None
    # Percentages like "4.5/5" -> take the first number
    if re.search(r"\d\s*/\s*\d", text):
        numbers = numbers[:1]
    if len(numbers) > 1:
        value_num = max(numbers) if prefer == "max" else min(numbers)
    else:
        value_num = numbers[0]
    return value_num * multiplier * unit_scale


def _prefer_for(operator: str) -> str:
    """For "<=" style limits take the worst (largest) end of a range; vice versa."""
    return "max" if operator in ("<=", "<") else "min"


def format_expected(constraint: Constraint) -> str:
    op = constraint.operator
    unit = f" {constraint.unit}" if constraint.unit else ""
    if op == "exists":
        return "must be stated"
    if op == "boolean":
        return "required" if constraint.target in (True, "true", "True", None) else "must be absent"
    if op == "contains":
        return f"contains “{constraint.target}”"
    return f"{op} {constraint.target}{unit}".strip()


def evaluate_constraint(
    constraint: Constraint,
    raw_value: Any,
    evidence_ids: Iterable[str] | None = None,
) -> ConstraintResult:
    """Evaluate one constraint against one extracted value. Pure function."""
    evidence_ids = list(evidence_ids or [])
    actual = normalize_text(raw_value) or None
    result = ConstraintResult(
        constraint=constraint,
        actual_value=actual,
        expected_value=format_expected(constraint),
        status="UNKNOWN",
        evidence_ids=evidence_ids,
    )

    if not evidence_ids:
        result.reason = "No evidence was retrieved for this requirement, so it cannot be checked."
        return result
    if is_unknown(raw_value):
        result.reason = "Evidence did not state a value for this requirement."
        return result

    op = constraint.operator

    if op == "exists":
        result.status = "PASS"
        result.reason = "A value was found in the retrieved evidence."
        return result

    if op == "boolean":
        parsed = parse_boolean(raw_value)
        want = constraint.target if isinstance(constraint.target, bool) else True
        if parsed is None:
            result.reason = "Evidence was ambiguous about whether this is provided."
            return result
        result.status = "PASS" if parsed == want else "FAIL"
        result.reason = f"Evidence states “{actual}”."
        return result

    if op in ("contains", "==", "!=") and not _looks_numeric(constraint.target):
        target = normalize_text(constraint.target).lower()
        haystack = normalize_text(raw_value).lower()
        if op == "contains":
            hit = target in haystack
        elif op == "==":
            hit = target == haystack
        else:
            hit = target != haystack
        result.status = "PASS" if hit else "FAIL"
        result.reason = f"Evidence value “{actual}” vs required {format_expected(constraint)}."
        return result

    target_num = parse_number(constraint.target, unit=constraint.unit, prefer="min")
    actual_num = parse_number(raw_value, unit=constraint.unit, prefer=_prefer_for(op))
    if target_num is None:
        result.reason = "The requirement itself has no comparable numeric target."
        return result
    if actual_num is None:
        result.reason = f"Evidence value “{actual}” could not be read as a number."
        return result

    comparisons = {
        "<=": actual_num <= target_num,
        "<": actual_num < target_num,
        ">=": actual_num >= target_num,
        ">": actual_num > target_num,
        "==": abs(actual_num - target_num) < 1e-9,
        "!=": abs(actual_num - target_num) >= 1e-9,
    }
    ok = comparisons.get(op)
    if ok is None:
        result.reason = f"Unsupported operator '{op}'."
        return result
    result.status = "PASS" if ok else "FAIL"
    unit = f" {constraint.unit}" if constraint.unit else ""
    result.reason = (
        f"Evidence value {_fmt(actual_num)}{unit} {'satisfies' if ok else 'violates'} "
        f"{op} {_fmt(target_num)}{unit}."
    )
    return result


def _looks_numeric(value: Any) -> bool:
    if isinstance(value, bool):
        return False
    if isinstance(value, (int, float)):
        return True
    return parse_number(value) is not None


def _fmt(number: float) -> str:
    if abs(number - round(number)) < 1e-9:
        return f"{int(round(number)):,}"
    return f"{number:,.2f}".rstrip("0").rstrip(".")


def overall_status(results: list[ConstraintResult]) -> Status:
    """A candidate passes only when every HARD constraint passes.

    FAIL dominates UNKNOWN: an item already ruled out stays ruled out.
    """
    hard = [r for r in results if r.constraint.hard_constraint]
    if not hard:
        return "PASS" if results and all(r.status == "PASS" for r in results) else "UNKNOWN"
    if any(r.status == "FAIL" for r in hard):
        return "FAIL"
    if any(r.status == "UNKNOWN" for r in hard):
        return "UNKNOWN"
    return "PASS"


def evaluate_candidate(candidate: Candidate, constraints: list[Constraint]) -> Candidate:
    """Run every constraint against a candidate's extracted attributes."""
    results: list[ConstraintResult] = []
    for constraint in constraints:
        value = _lookup_attribute(candidate.attributes, constraint)
        evidence_ids = _lookup_evidence(candidate, constraint)
        results.append(evaluate_constraint(constraint, value, evidence_ids))
    candidate.constraint_results = results
    candidate.overall_status = overall_status(results)
    failed = [r.constraint.name for r in results if r.status == "FAIL" and r.constraint.hard_constraint]
    unknown = [r.constraint.name for r in results if r.status == "UNKNOWN" and r.constraint.hard_constraint]
    if candidate.overall_status == "FAIL":
        candidate.reason = "Fails required: " + ", ".join(failed)
    elif candidate.overall_status == "UNKNOWN":
        candidate.reason = "Not verified — no evidence found for: " + ", ".join(unknown)
    else:
        candidate.reason = "All required conditions verified against retrieved evidence."
    return candidate


def _lookup_evidence(candidate: Candidate, constraint: Constraint) -> list[str]:
    """Evidence backing this specific attribute; falls back to the candidate's own evidence."""
    mapping = candidate.attribute_evidence or {}
    for key in (constraint.field, constraint.name):
        if key in mapping and mapping[key]:
            return list(mapping[key])
    probe = re.sub(r"[^a-z0-9]", "", str(constraint.field).lower())
    for key, ids in mapping.items():
        if ids and probe and probe == re.sub(r"[^a-z0-9]", "", key.lower()):
            return list(ids)
    if _lookup_attribute(candidate.attributes, constraint) is not None:
        return list(candidate.evidence_ids)
    return []


def _lookup_attribute(attributes: dict[str, str], constraint: Constraint) -> Any:
    for key in (constraint.field, constraint.name, constraint.name.lower(), constraint.field.lower()):
        if key in attributes:
            return attributes[key]
    normalized = {re.sub(r"[^a-z0-9]", "", k.lower()): v for k, v in attributes.items()}
    for key in (constraint.field, constraint.name):
        probe = re.sub(r"[^a-z0-9]", "", str(key).lower())
        if probe in normalized:
            return normalized[probe]
        for existing_key, value in normalized.items():
            if probe and (probe in existing_key or existing_key in probe):
                return value
    return None
