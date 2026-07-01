# Defines input parsing for IQ-TREE phylogenetic inference.
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

DNA_MODELS = {"GTR+G", "GTR+I+G", "HKY+G", "JC", "K2P"}
PROTEIN_MODELS = {"LG+G", "WAG+G", "JTT+G", "VT+G"}
MODEL_MODES = {"auto", "fixed"}
THREAD_MODES = {"auto", "fixed"}


@dataclass(frozen=True)
class IqtreeRecordInput:
    name: str
    sequence: str


@dataclass(frozen=True)
class IqtreeInput:
    records: list[IqtreeRecordInput]
    sequence_type: str
    model_mode: str
    model: str
    iqtree_model: str
    bootstrap_enabled: bool
    bootstrap_replicates: int
    alrt_enabled: bool
    alrt_replicates: int
    thread_mode: str
    thread_count: int
    random_seed: int | None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "IqtreeInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        requested_type = str(payload.get("sequence_type", "auto")).strip().lower()
        if requested_type not in SEQUENCE_ALPHABETS:
            raise ToolInputError(
                "Unsupported sequence type.",
                {"sequence_type": requested_type, "supported": sorted(SEQUENCE_ALPHABETS)},
            )

        records = _records_from_payload(payload)
        if len(records) < 3:
            raise ToolInputError("IQ-TREE requires at least three aligned sequences.")
        _ensure_unique_names(records)
        _ensure_same_alignment_length(records)
        sequence_type = _resolve_sequence_type(records, requested_type)
        _validate_characters(records, sequence_type, bool(payload.get("strict", False)))

        model_mode = str(payload.get("model_mode", "auto")).strip().lower()
        if model_mode not in MODEL_MODES:
            raise ToolInputError("Unsupported model mode.", {"model_mode": model_mode, "supported": sorted(MODEL_MODES)})
        model = str(payload.get("model", "AUTO")).strip().upper()
        iqtree_model = _resolve_model(model_mode, model, sequence_type)

        thread_mode = str(payload.get("thread_mode", "auto")).strip().lower()
        if thread_mode not in THREAD_MODES:
            raise ToolInputError("Unsupported thread mode.", {"thread_mode": thread_mode, "supported": sorted(THREAD_MODES)})
        thread_count = _bounded_int(payload.get("thread_count", 1), 1, 32, "thread_count")

        return cls(
            records=records,
            sequence_type=sequence_type,
            model_mode=model_mode,
            model=model,
            iqtree_model=iqtree_model,
            bootstrap_enabled=bool(payload.get("bootstrap_enabled", True)),
            bootstrap_replicates=_bounded_int(payload.get("bootstrap_replicates", 1000), 100, 10000, "bootstrap_replicates"),
            alrt_enabled=bool(payload.get("alrt_enabled", True)),
            alrt_replicates=_bounded_int(payload.get("alrt_replicates", 1000), 100, 10000, "alrt_replicates"),
            thread_mode=thread_mode,
            thread_count=thread_count,
            random_seed=_optional_bounded_int(payload.get("random_seed"), 1, 2147483647, "random_seed"),
        )


def _records_from_payload(payload: dict[str, Any]) -> list[IqtreeRecordInput]:
    if "aligned_fasta" in payload:
        return parse_fasta(payload["aligned_fasta"])
    if "fasta" in payload:
        return parse_fasta(payload["fasta"])
    raise ToolInputError("Missing aligned FASTA input.", {"required": ["aligned_fasta"]})


def parse_fasta(value: object) -> list[IqtreeRecordInput]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[IqtreeRecordInput] = []
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


def _record(name: str, sequence: str, index: int) -> IqtreeRecordInput:
    cleaned_name = _clean_name(name, index)
    cleaned_sequence = "".join(str(sequence).split()).upper()
    if not cleaned_sequence:
        raise ToolInputError("Alignment record has an empty sequence.", {"name": cleaned_name})
    return IqtreeRecordInput(name=cleaned_name, sequence=cleaned_sequence)


def _clean_name(value: str, index: int) -> str:
    name = "_".join(str(value).strip().split())
    allowed = []
    for char in name:
        if char.isalnum() or char in {"_", "-", ".", ":"}:
            allowed.append(char)
        else:
            allowed.append("_")
    return "".join(allowed).strip("_") or f"sequence_{index}"


def _ensure_unique_names(records: list[IqtreeRecordInput]) -> None:
    names = [record.name for record in records]
    duplicates = sorted({name for name in names if names.count(name) > 1})
    if duplicates:
        raise ToolInputError("Alignment record names must be unique.", {"duplicates": duplicates})


def _ensure_same_alignment_length(records: list[IqtreeRecordInput]) -> None:
    lengths = {len(record.sequence) for record in records}
    if len(lengths) != 1:
        raise ToolInputError("IQ-TREE input must already be aligned to the same length.", {"lengths": sorted(lengths)})


def _resolve_sequence_type(records: list[IqtreeRecordInput], sequence_type: str) -> str:
    if sequence_type != "auto":
        return sequence_type
    observed = {char for record in records for char in record.sequence}
    if observed <= SEQUENCE_ALPHABETS["dna"]:
        return "dna"
    if observed <= SEQUENCE_ALPHABETS["rna"]:
        return "rna"
    return "protein"


def _validate_characters(records: list[IqtreeRecordInput], sequence_type: str, strict: bool) -> None:
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


def _resolve_model(model_mode: str, model: str, sequence_type: str) -> str:
    if model_mode == "auto":
        return "MFP"
    allowed = PROTEIN_MODELS if sequence_type == "protein" else DNA_MODELS
    if model not in allowed:
        raise ToolInputError(
            "Selected model is not compatible with the detected sequence type.",
            {"model": model, "sequence_type": sequence_type, "supported": sorted(allowed)},
        )
    return model


def _bounded_int(value: object, min_value: int, max_value: int, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be an integer.", {field_name: value}) from exc
    if parsed < min_value or parsed > max_value:
        raise ToolInputError(
            f"{field_name} is out of range.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed


def _optional_bounded_int(value: object, min_value: int, max_value: int, field_name: str) -> int | None:
    if value in (None, ""):
        return None
    return _bounded_int(value, min_value, max_value, field_name)
