# Searches NCBI GenBank records for annotated sequence elements.
from __future__ import annotations

from io import StringIO
import os
from typing import Any

from app.tools.errors import ToolDependencyError, ToolExecutionError, ToolInputError


def search_ncbi_elements(
    query: str,
    email: str | None,
    feature_types: set[str],
    keywords: list[str],
    max_records: int,
) -> list[dict[str, Any]]:
    entrez = _configure_entrez(email)
    seqio = _get_seqio()

    try:
        with entrez.esearch(db="nucleotide", term=query, retmax=max_records) as handle:
            search_result = entrez.read(handle)
    except Exception as exc:
        raise ToolExecutionError("NCBI element search failed.", {"query": query, "reason": str(exc)}) from exc

    ids = search_result.get("IdList", [])
    if not ids:
        return []

    try:
        with entrez.efetch(db="nucleotide", id=",".join(ids), rettype="gb", retmode="text") as handle:
            records_text = handle.read()
    except Exception as exc:
        raise ToolExecutionError("NCBI element fetch failed.", {"ids": ids, "reason": str(exc)}) from exc

    candidates: list[dict[str, Any]] = []
    for record in seqio.parse(StringIO(records_text), "genbank"):
        candidates.extend(_record_candidates(record, feature_types, keywords))
    return candidates


def _configure_entrez(email: str | None):
    try:
        from Bio import Entrez
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for NCBI Entrez tools.",
            {"install": "uv sync or pip install biopython"},
        ) from exc

    resolved_email = email or os.getenv("NCBI_EMAIL")
    if not resolved_email:
        raise ToolInputError("NCBI Entrez requires an email.", {"set": "payload.email or NCBI_EMAIL"})

    Entrez.tool = "bio-tool-backend-example"
    Entrez.email = resolved_email
    return Entrez


def _get_seqio():
    try:
        from Bio import SeqIO
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for GenBank parsing.",
            {"install": "uv sync or pip install biopython"},
        ) from exc
    return SeqIO


def _record_candidates(record: Any, feature_types: set[str], keywords: list[str]) -> list[dict[str, Any]]:
    record_text = " ".join([record.id, record.name, record.description]).lower()
    candidates: list[dict[str, Any]] = []

    for feature in record.features:
        feature_type = str(feature.type).lower()
        qualifier_text = _qualifier_text(feature.qualifiers)
        searchable = f"{record_text} {feature_type} {qualifier_text}".lower()
        type_match = feature_type in feature_types
        keyword_matches = [keyword for keyword in keywords if keyword.lower() in searchable]
        if not type_match and not keyword_matches:
            continue

        try:
            sequence = str(feature.extract(record.seq)).upper()
        except Exception:
            sequence = ""
        if not sequence or any(base not in "ACGTN" for base in sequence):
            continue

        candidates.append(
            {
                "source": "ncbi",
                "name": _feature_name(feature, record),
                "record_id": record.id,
                "accessions": record.annotations.get("accessions", []),
                "organism": record.annotations.get("organism"),
                "record_description": record.description,
                "feature_type": feature_type,
                "location": str(feature.location),
                "strand": feature.location.strand,
                "sequence": sequence,
                "length": len(sequence),
                "gc_content": round(_gc_content(sequence), 4),
                "matched_fields": sorted(set(keyword_matches + ([feature_type] if type_match else []))),
                "qualifiers": {
                    key: [str(item) for item in value]
                    for key, value in feature.qualifiers.items()
                },
            }
        )
    return candidates


def _feature_name(feature: Any, record: Any) -> str:
    for key in ["label", "gene", "product", "note", "standard_name"]:
        values = feature.qualifiers.get(key)
        if values:
            return str(values[0])
    return f"{feature.type} from {record.id}"


def _qualifier_text(qualifiers: dict[str, list[Any]]) -> str:
    return " ".join(str(item) for values in qualifiers.values() for item in values)


def _gc_content(sequence: str) -> float:
    if not sequence:
        return 0.0
    return (sequence.count("G") + sequence.count("C")) / len(sequence)
