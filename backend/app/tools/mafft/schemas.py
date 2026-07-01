# Defines input parsing for MAFFT multiple sequence alignment.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError
from app.tools.mafft.modes import DEFAULT_MAFFT_VERSION, DEFAULT_MODE, MAFFT_MODES, normalize_mode


SEQUENCE_ALPHABETS = {
    "dna": set("ACGTN"),
    "rna": set("ACGUN"),
    "protein": set("ABCDEFGHIKLMNPQRSTVWXYZ*"),
    "auto": set("ABCDEFGHIJKLMNOPQRSTUVWXYZ*"),
}


@dataclass(frozen=True)
class MafftRecordInput:
    name: str
    sequence: str


@dataclass(frozen=True)
class MafftAlignmentInput:
    records: list[MafftRecordInput]
    mode: str = DEFAULT_MODE
    sequence_type: str = "auto"
    strict: bool = False
    mafft_version: str = DEFAULT_MAFFT_VERSION
    thread_count: int = 1

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "MafftAlignmentInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        mode = normalize_mode(payload.get("mode", DEFAULT_MODE))
        if mode not in MAFFT_MODES:
            raise ToolInputError(
                "Unsupported MAFFT mode.",
                {"mode": mode, "supported": sorted(MAFFT_MODES)},
            )

        sequence_type = str(payload.get("sequence_type", "auto")).strip().lower()
        if sequence_type not in SEQUENCE_ALPHABETS:
            raise ToolInputError(
                "Unsupported sequence type.",
                {"sequence_type": sequence_type, "supported": sorted(SEQUENCE_ALPHABETS)},
            )

        records = _records_from_payload(payload)
        strict = bool(payload.get("strict", False))
        cleaned = _clean_records(records, sequence_type, strict)
        if len(cleaned) < 2:
            raise ToolInputError("MAFFT alignment requires at least two valid records.")
        _ensure_unique_names(cleaned)

        mafft_version = str(payload.get("mafft_version", DEFAULT_MAFFT_VERSION)).strip() or DEFAULT_MAFFT_VERSION
        thread_count = _bounded_int(payload.get("thread_count", 1), 1, 64, "thread_count")

        return cls(
            records=cleaned,
            mode=mode,
            sequence_type=sequence_type,
            strict=strict,
            mafft_version=mafft_version,
            thread_count=thread_count,
        )


def _records_from_payload(payload: dict[str, Any]) -> list[MafftRecordInput]:
    if "records" in payload:
        return _manual_records(payload["records"])
    if "sequences" in payload:
        return _manual_records(payload["sequences"])
    if "fasta" in payload:
        return parse_fasta(payload["fasta"])
    raise ToolInputError("Missing MAFFT input records.", {"required": ["records", "sequences", "or fasta"]})


def _manual_records(value: object) -> list[MafftRecordInput]:
    if not isinstance(value, list) or not value:
        raise ToolInputError("MAFFT records must be a non-empty list.")

    records: list[MafftRecordInput] = []
    for index, item in enumerate(value, start=1):
        if not isinstance(item, dict):
            raise ToolInputError("Each MAFFT record must be an object.", {"index": index})
        raw_name = item.get("name", item.get("id", f"sequence_{index}"))
        records.append(MafftRecordInput(name=str(raw_name), sequence=str(item.get("sequence", ""))))
    return records


def parse_fasta(value: object) -> list[MafftRecordInput]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[MafftRecordInput] = []
    current_name: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_name is not None:
                records.append(_fasta_record(current_name, current_lines))
            current_name = line[1:].strip().split()[0]
            current_lines = []
        else:
            current_lines.append(line)

    if current_name is not None:
        records.append(_fasta_record(current_name, current_lines))

    if not records:
        raise ToolInputError("FASTA input did not contain any records.")
    return records


def _fasta_record(name: str, sequence_lines: list[str]) -> MafftRecordInput:
    if not name:
        raise ToolInputError("FASTA record is missing a name.")
    return MafftRecordInput(name=name, sequence="".join(sequence_lines))


def _clean_records(records: list[MafftRecordInput], sequence_type: str, strict: bool) -> list[MafftRecordInput]:
    alphabet = SEQUENCE_ALPHABETS[sequence_type]
    cleaned: list[MafftRecordInput] = []

    for index, record in enumerate(records, start=1):
        name = _clean_name(record.name, index)
        sequence = "".join(str(record.sequence).split()).upper()
        invalid = sorted({char for char in sequence if char not in alphabet})
        if invalid and strict:
            raise ToolInputError("Sequence contains invalid characters.", {"name": name, "invalid": invalid})
        if invalid:
            sequence = "".join(char for char in sequence if char in alphabet)
        if not sequence:
            if strict:
                raise ToolInputError("Sequence is empty after cleaning.", {"name": name})
            continue
        cleaned.append(MafftRecordInput(name=name, sequence=sequence))
    return cleaned


def _clean_name(value: str, index: int) -> str:
    name = "_".join(str(value).strip().split())
    allowed = []
    for char in name:
        if char.isalnum() or char in {"_", "-", ".", ":"}:
            allowed.append(char)
        else:
            allowed.append("_")
    return "".join(allowed).strip("_") or f"sequence_{index}"


def _ensure_unique_names(records: list[MafftRecordInput]) -> None:
    names = [record.name for record in records]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ToolInputError("MAFFT record names must be unique.", {"duplicates": duplicates})


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

