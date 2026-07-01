# Defines input parsing for multiple sequence alignment quality analysis.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SEQUENCE_ALPHABETS = {
    "dna": set("ACGTN-"),
    "rna": set("ACGUN-"),
    "protein": set("ABCDEFGHIKLMNPQRSTVWXYZ*-"),
    "auto": set("ABCDEFGHIJKLMNOPQRSTUVWXYZ*-"),
}


@dataclass(frozen=True)
class MsaRecordInput:
    name: str
    sequence: str


@dataclass(frozen=True)
class MsaQualityInput:
    records: list[MsaRecordInput]
    sequence_type: str = "auto"
    majority_threshold: float = 0.6
    gap_consensus_threshold: float = 0.5
    high_gap_threshold: float = 0.7
    low_conservation_threshold: float = 0.5
    high_entropy_threshold: float = 1.5

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "MsaQualityInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        sequence_type = str(payload.get("sequence_type", "auto")).strip().lower()
        if sequence_type not in SEQUENCE_ALPHABETS:
            raise ToolInputError(
                "Unsupported sequence type.",
                {"sequence_type": sequence_type, "supported": sorted(SEQUENCE_ALPHABETS)},
            )

        records = _records_from_payload(payload)
        if len(records) < 2:
            raise ToolInputError("MSA_quality requires at least two aligned sequences.")
        _ensure_unique_names(records)
        _ensure_same_alignment_length(records)
        _validate_characters(records, sequence_type, bool(payload.get("strict", False)))

        return cls(
            records=records,
            sequence_type=sequence_type,
            majority_threshold=_bounded_float(payload.get("majority_threshold", 0.6), 0.0, 1.0, "majority_threshold"),
            gap_consensus_threshold=_bounded_float(
                payload.get("gap_consensus_threshold", 0.5),
                0.0,
                1.0,
                "gap_consensus_threshold",
            ),
            high_gap_threshold=_bounded_float(payload.get("high_gap_threshold", 0.7), 0.0, 1.0, "high_gap_threshold"),
            low_conservation_threshold=_bounded_float(
                payload.get("low_conservation_threshold", 0.5),
                0.0,
                1.0,
                "low_conservation_threshold",
            ),
            high_entropy_threshold=_bounded_float(
                payload.get("high_entropy_threshold", 1.5),
                0.0,
                10.0,
                "high_entropy_threshold",
            ),
        )


def _records_from_payload(payload: dict[str, Any]) -> list[MsaRecordInput]:
    if "fasta" in payload:
        return parse_fasta(payload["fasta"])
    if "aligned_fasta" in payload:
        return parse_fasta(payload["aligned_fasta"])
    if "records" in payload:
        return _manual_records(payload["records"])
    if "aligned_records" in payload:
        return _manual_records(payload["aligned_records"])
    raise ToolInputError("Missing MSA input.", {"required": ["fasta", "aligned_fasta", "records", "or aligned_records"]})


def _manual_records(value: object) -> list[MsaRecordInput]:
    if not isinstance(value, list) or not value:
        raise ToolInputError("MSA records must be a non-empty list.")

    records: list[MsaRecordInput] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise ToolInputError("Each MSA record must be an object.", {"index": index})
        name = str(item.get("name", item.get("id", f"sequence_{index}"))).strip()
        sequence = str(item.get("sequence", "")).strip()
        records.append(_record(name, sequence, index))
    return records


def parse_fasta(value: object) -> list[MsaRecordInput]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[MsaRecordInput] = []
    current_name: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_name is not None:
                records.append(_record(current_name, "".join(current_lines), len(records) + 1))
            current_name = line[1:].strip().split()[0]
            current_lines = []
        else:
            current_lines.append(line)

    if current_name is not None:
        records.append(_record(current_name, "".join(current_lines), len(records) + 1))

    if not records:
        raise ToolInputError("FASTA input did not contain any records.")
    return records


def _record(name: str, sequence: str, index: int) -> MsaRecordInput:
    cleaned_name = _clean_name(name, index)
    cleaned_sequence = "".join(str(sequence).split()).upper()
    if not cleaned_sequence:
        raise ToolInputError("MSA record has an empty sequence.", {"name": cleaned_name})
    return MsaRecordInput(name=cleaned_name, sequence=cleaned_sequence)


def _clean_name(value: str, index: int) -> str:
    name = "_".join(str(value).strip().split())
    allowed = []
    for char in name:
        if char.isalnum() or char in {"_", "-", ".", ":"}:
            allowed.append(char)
        else:
            allowed.append("_")
    return "".join(allowed).strip("_") or f"sequence_{index}"


def _ensure_unique_names(records: list[MsaRecordInput]) -> None:
    names = [record.name for record in records]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ToolInputError("MSA record names must be unique.", {"duplicates": duplicates})


def _ensure_same_alignment_length(records: list[MsaRecordInput]) -> None:
    lengths = {len(record.sequence) for record in records}
    if len(lengths) != 1:
        raise ToolInputError(
            "MSA records must already be aligned to the same length.",
            {"lengths": sorted(lengths)},
        )


def _validate_characters(records: list[MsaRecordInput], sequence_type: str, strict: bool) -> None:
    alphabet = SEQUENCE_ALPHABETS[sequence_type]
    invalid_by_record = {}
    for record in records:
        invalid = sorted({char for char in record.sequence if char not in alphabet})
        if invalid:
            invalid_by_record[record.name] = invalid
    if invalid_by_record and strict:
        raise ToolInputError(
            "MSA records contain invalid characters.",
            {"invalid": invalid_by_record, "allowed": sorted(alphabet)},
        )


def _bounded_float(value: object, min_value: float, max_value: float, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be a number.") from exc
    if not (min_value <= parsed <= max_value):
        raise ToolInputError(
            f"{field_name} must be between {min_value} and {max_value}.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed

