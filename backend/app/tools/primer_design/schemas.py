# Defines input models for primer design workflows.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_MODES = {"vector_construction", "site_mutagenesis"}


@dataclass(frozen=True)
class MutationSpec:
    position: int
    ref: str | None
    alt: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "MutationSpec":
        raw = payload.get("mutation", payload)
        if not isinstance(raw, dict):
            raise ToolInputError("Mutation must be an object.")

        try:
            position = int(raw["position"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ToolInputError("Mutation requires a 1-based integer position.") from exc
        if position < 1:
            raise ToolInputError("Mutation position must be 1-based.", {"position": position})

        ref = _optional_sequence(raw.get("ref"))
        alt = _required_sequence(raw.get("alt"), "mutation.alt")
        return cls(position=position, ref=ref, alt=alt)


@dataclass(frozen=True)
class PrimerDesignInput:
    mode: str
    vector_sequence: str | None = None
    insert_sequence: str | None = None
    gene_sequence: str | None = None
    mutation: MutationSpec | None = None
    homology_length: int = 20
    min_binding_length: int = 18
    max_binding_length: int = 25
    target_tm: float = 60.0

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "PrimerDesignInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        mode = str(payload.get("mode", "vector_construction")).strip()
        if mode not in SUPPORTED_MODES:
            raise ToolInputError(
                "Unsupported primer design mode.",
                {"mode": mode, "supported": sorted(SUPPORTED_MODES)},
            )

        homology_length = _bounded_int(payload.get("homology_length", 20), 12, 40, "homology_length")
        min_binding_length = _bounded_int(payload.get("min_binding_length", 18), 12, 35, "min_binding_length")
        max_binding_length = _bounded_int(payload.get("max_binding_length", 25), min_binding_length, 45, "max_binding_length")
        target_tm = _bounded_float(payload.get("target_tm", 60.0), 45.0, 75.0, "target_tm")

        if mode == "vector_construction":
            vector_sequence = _sequence_from_payload(payload, "vector")
            insert_sequence = _sequence_from_payload(payload, "insert")
            _ensure_min_length(vector_sequence, homology_length + min_binding_length, "vector")
            _ensure_min_length(insert_sequence, homology_length + min_binding_length, "insert")
            return cls(
                mode=mode,
                vector_sequence=vector_sequence,
                insert_sequence=insert_sequence,
                homology_length=homology_length,
                min_binding_length=min_binding_length,
                max_binding_length=max_binding_length,
                target_tm=target_tm,
            )

        gene_sequence = _sequence_from_payload(payload, "gene")
        mutation = MutationSpec.from_payload(payload)
        _validate_mutation(gene_sequence, mutation)
        return cls(
            mode=mode,
            gene_sequence=gene_sequence,
            mutation=mutation,
            homology_length=homology_length,
            min_binding_length=min_binding_length,
            max_binding_length=max_binding_length,
            target_tm=target_tm,
        )


def _sequence_from_payload(payload: dict[str, Any], name: str) -> str:
    for key in (f"{name}_sequence", name):
        if key in payload:
            return _required_sequence(payload[key], key)
    fasta_key = f"{name}_fasta"
    if fasta_key in payload:
        records = parse_fasta(payload[fasta_key])
        if len(records) != 1:
            raise ToolInputError(f"{fasta_key} must contain exactly one FASTA record.")
        return records[0]["sequence"]
    raise ToolInputError(f"Primer design requires {name}_sequence or {name}_fasta.")


def parse_fasta(value: object) -> list[dict[str, str]]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[dict[str, str]] = []
    current_id: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_id is not None:
                records.append(_fasta_record(current_id, current_lines))
            current_id = line[1:].strip().split()[0] or "sequence"
            current_lines = []
        else:
            current_lines.append(line)

    if current_id is not None:
        records.append(_fasta_record(current_id, current_lines))

    if not records:
        raise ToolInputError("FASTA input did not contain any records.")
    return records


def _fasta_record(record_id: str, sequence_lines: list[str]) -> dict[str, str]:
    return {"id": record_id, "sequence": _required_sequence("".join(sequence_lines), "FASTA sequence")}


def _required_sequence(value: object, field_name: str) -> str:
    if not isinstance(value, str):
        raise ToolInputError(f"{field_name} must be a string.")
    sequence = "".join(value.split()).upper()
    if not sequence:
        raise ToolInputError(f"{field_name} must not be empty.")
    invalid = sorted({base for base in sequence if base not in "ACGT"})
    if invalid:
        raise ToolInputError(
            f"{field_name} must contain DNA bases only.",
            {"invalid_bases": invalid, "allowed": ["A", "C", "G", "T"]},
        )
    return sequence


def _optional_sequence(value: object) -> str | None:
    if value is None:
        return None
    return _required_sequence(value, "mutation.ref")


def _validate_mutation(gene_sequence: str, mutation: MutationSpec) -> None:
    if mutation.position > len(gene_sequence):
        raise ToolInputError(
            "Mutation position is outside the gene sequence.",
            {"position": mutation.position, "sequence_length": len(gene_sequence)},
        )
    if mutation.ref:
        start = mutation.position - 1
        observed = gene_sequence[start : start + len(mutation.ref)]
        if observed != mutation.ref:
            raise ToolInputError(
                "Mutation reference does not match the gene sequence.",
                {"expected": mutation.ref, "observed": observed, "position": mutation.position},
            )


def _ensure_min_length(sequence: str, min_length: int, name: str) -> None:
    if len(sequence) < min_length:
        raise ToolInputError(
            f"{name} sequence is too short for the requested design.",
            {"sequence_length": len(sequence), "min_length": min_length},
        )


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
