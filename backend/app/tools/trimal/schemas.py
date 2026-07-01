# Defines input parsing for trimAl-style alignment trimming.
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

TRIMAL_MODES = {"automated1", "gappyout", "strict", "strictplus", "manual"}


@dataclass(frozen=True)
class TrimalRecordInput:
    name: str
    sequence: str


@dataclass(frozen=True)
class TrimalInput:
    records: list[TrimalRecordInput]
    sequence_type: str
    mode: str
    gap_threshold: float
    conservation_threshold: float

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "TrimalInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        mode = str(payload.get("mode", "automated1")).strip().lower()
        if mode not in TRIMAL_MODES:
            raise ToolInputError("Unsupported trimAl mode.", {"mode": mode, "supported": sorted(TRIMAL_MODES)})

        requested_type = str(payload.get("sequence_type", "auto")).strip().lower()
        if requested_type not in SEQUENCE_ALPHABETS:
            raise ToolInputError(
                "Unsupported sequence type.",
                {"sequence_type": requested_type, "supported": sorted(SEQUENCE_ALPHABETS)},
            )

        records = _records_from_payload(payload)
        if len(records) < 2:
            raise ToolInputError("trimAl requires at least two aligned sequences.")
        _ensure_unique_names(records)
        _ensure_same_alignment_length(records)
        sequence_type = _resolve_sequence_type(records, requested_type)
        _validate_characters(records, sequence_type, bool(payload.get("strict", False)))

        defaults = _mode_defaults(mode)
        gap_threshold = _bounded_float(payload.get("gap_threshold", defaults["gap_threshold"]), 0.0, 1.0, "gap_threshold")
        conservation_threshold = _bounded_float(
            payload.get("conservation_threshold", defaults["conservation_threshold"]),
            0.0,
            1.0,
            "conservation_threshold",
        )

        return cls(
            records=records,
            sequence_type=sequence_type,
            mode=mode,
            gap_threshold=gap_threshold,
            conservation_threshold=conservation_threshold,
        )


def _mode_defaults(mode: str) -> dict[str, float]:
    return {
        "automated1": {"gap_threshold": 0.5, "conservation_threshold": 0.0},
        "gappyout": {"gap_threshold": 0.4, "conservation_threshold": 0.0},
        "strict": {"gap_threshold": 0.2, "conservation_threshold": 0.5},
        "strictplus": {"gap_threshold": 0.1, "conservation_threshold": 0.7},
        "manual": {"gap_threshold": 0.5, "conservation_threshold": 0.0},
    }[mode]


def _records_from_payload(payload: dict[str, Any]) -> list[TrimalRecordInput]:
    if "aligned_fasta" in payload:
        return parse_fasta(payload["aligned_fasta"])
    if "fasta" in payload:
        return parse_fasta(payload["fasta"])
    raise ToolInputError("Missing aligned FASTA input.", {"required": ["aligned_fasta"]})


def parse_fasta(value: object) -> list[TrimalRecordInput]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[TrimalRecordInput] = []
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


def _record(name: str, sequence: str, index: int) -> TrimalRecordInput:
    cleaned_name = "_".join(str(name).strip().split()) or f"sequence_{index}"
    cleaned_sequence = "".join(str(sequence).split()).upper()
    if not cleaned_sequence:
        raise ToolInputError("Alignment record has an empty sequence.", {"name": cleaned_name})
    return TrimalRecordInput(name=cleaned_name, sequence=cleaned_sequence)


def _ensure_unique_names(records: list[TrimalRecordInput]) -> None:
    names = [record.name for record in records]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ToolInputError("Alignment record names must be unique.", {"duplicates": duplicates})


def _ensure_same_alignment_length(records: list[TrimalRecordInput]) -> None:
    lengths = {len(record.sequence) for record in records}
    if len(lengths) != 1:
        raise ToolInputError("trimAl input must already be aligned to the same length.", {"lengths": sorted(lengths)})


def _resolve_sequence_type(records: list[TrimalRecordInput], sequence_type: str) -> str:
    if sequence_type != "auto":
        return sequence_type
    observed = {char for record in records for char in record.sequence}
    if observed <= SEQUENCE_ALPHABETS["dna"]:
        return "dna"
    if observed <= SEQUENCE_ALPHABETS["rna"]:
        return "rna"
    return "protein"


def _validate_characters(records: list[TrimalRecordInput], sequence_type: str, strict: bool) -> None:
    alphabet = SEQUENCE_ALPHABETS[sequence_type]
    invalid_by_record = {}
    for record in records:
        invalid = sorted({char for char in record.sequence if char not in alphabet})
        if invalid:
            invalid_by_record[record.name] = invalid
    if invalid_by_record and strict:
        raise ToolInputError(
            "Alignment records contain invalid characters.",
            {"invalid": invalid_by_record, "allowed": sorted(alphabet)},
        )


def _bounded_float(value: object, min_value: float, max_value: float, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be numeric.", {field_name: value}) from exc
    if parsed < min_value or parsed > max_value:
        raise ToolInputError(
            f"{field_name} is out of range.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed
