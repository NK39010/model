# Defines input data models for NCBI Entrez RefSeq lookup modules.
from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from app.tools.errors import ToolInputError


class NCBIDatabase(StrEnum):
    NUCLEOTIDE = "nucleotide"
    PROTEIN = "protein"


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
class NCBIRefSeqLookupInput:
    ids: list[str]
    config: EntrezConfig

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "NCBIRefSeqLookupInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        return cls(
            ids=_ids_from_payload(payload, max_ids=50),
            config=EntrezConfig.from_payload(payload),
        )


def _optional_string(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("Optional string value must be a string when provided.")
    stripped = value.strip()
    return stripped or None


def infer_db_from_accession(accession: str) -> NCBIDatabase:
    normalized = accession.upper()
    protein_prefixes = ("NP_", "XP_", "YP_", "WP_", "AP_", "AAB", "AAA")
    nucleotide_prefixes = ("NM_", "NR_", "NC_", "NG_", "NT_", "NW_", "XM_", "XR_", "AC_")

    if normalized.startswith(protein_prefixes):
        return NCBIDatabase.PROTEIN
    if normalized.startswith(nucleotide_prefixes):
        return NCBIDatabase.NUCLEOTIDE
    return NCBIDatabase.NUCLEOTIDE


def _ids_from_payload(payload: dict[str, Any], max_ids: int = 200) -> list[str]:
    raw_ids = payload.get("ids", payload.get("id"))
    if isinstance(raw_ids, str):
        ids = [item.strip() for item in raw_ids.split(",") if item.strip()]
    elif isinstance(raw_ids, list):
        ids = [str(item).strip() for item in raw_ids if str(item).strip()]
    else:
        raise ToolInputError("NCBI lookup requires id or ids.")

    if not ids:
        raise ToolInputError("NCBI lookup requires at least one id.")
    if len(ids) > max_ids:
        raise ToolInputError(f"NCBI request supports at most {max_ids} ids.", {"max_ids": max_ids})
    return ids
