# Defines input models for the NCBI BLAST lookup tool.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_PROGRAMS = {"blastn", "blastp", "blastx", "tblastn", "tblastx"}


@dataclass(frozen=True)
class EntrezConfig:
    email: str | None = None
    tool: str = "bio-tool-backend-example"

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "EntrezConfig":
        return cls(
            email=_optional_string(payload.get("email")),
            tool=_optional_string(payload.get("tool")) or "bio-tool-backend-example",
        )


@dataclass(frozen=True)
class NCBIBlastLookupInput:
    query_id: str
    query_sequence: str
    program: str
    database: str
    expect: float
    max_hits: int
    entrez_query: str | None
    megablast: bool
    config: EntrezConfig

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "NCBIBlastLookupInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        sequence = _required_sequence(payload)
        query_id = _optional_string(payload.get("query_id")) or "query_1"

        program = str(payload.get("program", "blastn")).strip().lower()
        if program not in SUPPORTED_PROGRAMS:
            raise ToolInputError(
                "Unsupported BLAST program.",
                {"program": program, "supported": sorted(SUPPORTED_PROGRAMS)},
            )

        database = _optional_string(payload.get("database")) or ("nt" if program == "blastn" else "nr")
        if not database:
            raise ToolInputError("Database must not be empty.")

        expect = _positive_float(payload.get("expect", 1e-10), field_name="expect")
        max_hits = _bounded_int(payload.get("max_hits", payload.get("hitlist_size", 20)), 1, 200, "max_hits")
        entrez_query = _optional_string(payload.get("entrez_query"))
        megablast = bool(payload.get("megablast", True if program == "blastn" else False))
        if program != "blastn" and megablast:
            raise ToolInputError("megablast is only valid for blastn.", {"program": program})

        return cls(
            query_id=query_id,
            query_sequence=sequence,
            program=program,
            database=database,
            expect=expect,
            max_hits=max_hits,
            entrez_query=entrez_query,
            megablast=megablast,
            config=EntrezConfig.from_payload(payload),
        )


def _required_sequence(payload: dict[str, Any]) -> str:
    raw = payload.get("sequence", payload.get("query"))
    if not isinstance(raw, str):
        raise ToolInputError("BLAST lookup requires sequence.", {"required": ["sequence"]})

    normalized = "".join(raw.split()).upper()
    if not normalized:
        raise ToolInputError("Sequence must not be empty.")
    return normalized


def _optional_string(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("Optional string value must be a string when provided.")
    stripped = value.strip()
    return stripped or None


def _positive_float(value: object, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be a number.") from exc
    if parsed <= 0:
        raise ToolInputError(f"{field_name} must be greater than 0.", {field_name: parsed})
    return parsed


def _bounded_int(value: object, min_value: int, max_value: int, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be an integer.") from exc
    if not (min_value <= parsed <= max_value):
        raise ToolInputError(
            f"{field_name} must be between {min_value} and {max_value}.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed
