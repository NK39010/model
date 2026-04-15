# Defines input and output data models for sequence alignment task modules.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


@dataclass(frozen=True)
class SequenceRecord:
    id: str
    sequence: str

    @classmethod
    def from_payload(cls, payload: dict[str, Any], default_id: str) -> "SequenceRecord":
        if not isinstance(payload, dict):
            raise ToolInputError("Sequence record must be an object.")

        sequence = _normalize_sequence(payload.get("sequence"))
        if not sequence:
            raise ToolInputError("Sequence must not be empty.", {"record": payload})

        record_id = payload.get("id", default_id)
        if not isinstance(record_id, str) or not record_id.strip():
            raise ToolInputError("Sequence id must be a non-empty string.", {"record": payload})

        return cls(id=record_id.strip(), sequence=sequence)


@dataclass(frozen=True)
class ScoringConfig:
    match_score: int = 1
    mismatch_score: int = -1
    gap_score: int = -2
    sequence_type: str = "dna"
    substitution_matrix: str | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ScoringConfig":
        scoring = payload.get("scoring", {})
        if scoring is None:
            scoring = {}
        if not isinstance(scoring, dict):
            raise ToolInputError("Scoring config must be an object.")

        sequence_type = scoring.get("sequence_type", payload.get("sequence_type", "dna"))
        if sequence_type not in {"dna", "protein"}:
            raise ToolInputError(
                "Unsupported sequence type.",
                {"sequence_type": sequence_type, "supported": ["dna", "protein"]},
            )

        return cls(
            match_score=int(scoring.get("match_score", payload.get("match_score", 1))),
            mismatch_score=int(scoring.get("mismatch_score", payload.get("mismatch_score", -1))),
            gap_score=int(scoring.get("gap_score", payload.get("gap_score", -2))),
            sequence_type=sequence_type,
            substitution_matrix=scoring.get(
                "substitution_matrix",
                payload.get("substitution_matrix", "BLOSUM62" if sequence_type == "protein" else None),
            ),
        )


@dataclass(frozen=True)
class PairwiseAlignmentInput:
    sequence_a: str
    sequence_b: str
    match_score: int = 1
    mismatch_score: int = -1
    gap_score: int = -2
    sequence_type: str = "dna"
    substitution_matrix: str | None = None

    @classmethod
    def from_payload(cls, payload: dict) -> "PairwiseAlignmentInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        sequence_a, sequence_b = _pairwise_sequences_from_payload(payload)

        if not sequence_a or not sequence_b:
            raise ToolInputError("Sequences must not be empty.")

        scoring = ScoringConfig.from_payload(payload)

        return cls(
            sequence_a=sequence_a,
            sequence_b=sequence_b,
            match_score=scoring.match_score,
            mismatch_score=scoring.mismatch_score,
            gap_score=scoring.gap_score,
            sequence_type=scoring.sequence_type,
            substitution_matrix=scoring.substitution_matrix,
        )


@dataclass(frozen=True)
class PairwiseAlignmentOutput:
    aligned_sequence_a: str
    aligned_sequence_b: str
    score: float
    identity: float
    alignment_length: int
    similarity: float
    match_count: int
    mismatch_count: int
    gap_count: int

    def to_dict(self) -> dict:
        return {
            "aligned_sequence_a": self.aligned_sequence_a,
            "aligned_sequence_b": self.aligned_sequence_b,
            "score": self.score,
            "identity": self.identity,
            "alignment_length": self.alignment_length,
            "similarity": self.similarity,
            "match_count": self.match_count,
            "mismatch_count": self.mismatch_count,
            "gap_count": self.gap_count,
        }


@dataclass(frozen=True)
class ReferenceSimilarityInput:
    reference: SequenceRecord
    targets: list[SequenceRecord]
    scoring: ScoringConfig
    include_alignments: bool = False

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ReferenceSimilarityInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        reference, targets = _reference_sequences_from_payload(payload)
        _ensure_unique_ids([reference, *targets])

        return cls(
            reference=reference,
            targets=targets,
            scoring=ScoringConfig.from_payload(payload),
            include_alignments=bool(payload.get("include_alignments", False)),
        )


@dataclass(frozen=True)
class PairwiseMatrixInput:
    sequences: list[SequenceRecord]
    metric: str
    scoring: ScoringConfig

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "PairwiseMatrixInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        metric = payload.get("metric", "identity")
        if metric not in {"identity", "similarity", "score"}:
            raise ToolInputError(
                "Unsupported matrix metric.",
                {"metric": metric, "supported": ["identity", "similarity", "score"]},
            )

        sequences = _matrix_sequences_from_payload(payload)
        _ensure_unique_ids(sequences)

        return cls(
            sequences=sequences,
            metric=metric,
            scoring=ScoringConfig.from_payload(payload),
        )


def _normalize_sequence(value: object) -> str:
    if not isinstance(value, str):
        raise ToolInputError("Sequence values must be strings.")
    return "".join(value.split()).upper()


def _pairwise_sequences_from_payload(payload: dict[str, Any]) -> tuple[str, str]:
    if "sequence_a" in payload and "sequence_b" in payload:
        return _normalize_sequence(payload["sequence_a"]), _normalize_sequence(payload["sequence_b"])

    if "fasta_a" in payload and "fasta_b" in payload:
        record_a = _single_fasta_record(payload["fasta_a"], "fasta_a")
        record_b = _single_fasta_record(payload["fasta_b"], "fasta_b")
        return record_a.sequence, record_b.sequence

    raise ToolInputError(
        "Missing pairwise alignment fields.",
        {"required": ["sequence_a and sequence_b", "or fasta_a and fasta_b"]},
    )


def _reference_sequences_from_payload(payload: dict[str, Any]) -> tuple[SequenceRecord, list[SequenceRecord]]:
    if "reference" in payload and "targets" in payload:
        if not isinstance(payload["targets"], list) or not payload["targets"]:
            raise ToolInputError("Targets must be a non-empty list.")

        reference = SequenceRecord.from_payload(payload["reference"], "reference")
        targets = [
            SequenceRecord.from_payload(record, f"target_{index + 1}")
            for index, record in enumerate(payload["targets"])
        ]
        return reference, targets

    if "reference_fasta" in payload and "targets_fasta" in payload:
        reference = _single_fasta_record(payload["reference_fasta"], "reference_fasta")
        targets = parse_fasta(payload["targets_fasta"])
        if not targets:
            raise ToolInputError("Target FASTA must contain at least one record.")
        return reference, targets

    raise ToolInputError(
        "Missing reference similarity fields.",
        {"required": ["reference and targets", "or reference_fasta and targets_fasta"]},
    )


def _matrix_sequences_from_payload(payload: dict[str, Any]) -> list[SequenceRecord]:
    if "sequences" in payload:
        if not isinstance(payload["sequences"], list) or len(payload["sequences"]) < 2:
            raise ToolInputError("Sequences must contain at least two records.")

        return [
            SequenceRecord.from_payload(record, f"seq_{index + 1}")
            for index, record in enumerate(payload["sequences"])
        ]

    if "fasta" in payload:
        records = parse_fasta(payload["fasta"])
        if len(records) < 2:
            raise ToolInputError("FASTA input must contain at least two records.")
        return records

    raise ToolInputError("Missing sequences or fasta.")


def _single_fasta_record(value: object, field_name: str) -> SequenceRecord:
    records = parse_fasta(value)
    if len(records) != 1:
        raise ToolInputError(
            f"{field_name} must contain exactly one FASTA record.",
            {"record_count": len(records)},
        )
    return records[0]


def parse_fasta(value: object) -> list[SequenceRecord]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[SequenceRecord] = []
    current_id: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_id is not None:
                records.append(_fasta_record(current_id, current_lines))
            current_id = line[1:].strip().split()[0]
            current_lines = []
        else:
            current_lines.append(line)

    if current_id is not None:
        records.append(_fasta_record(current_id, current_lines))

    if not records:
        raise ToolInputError("FASTA input did not contain any records.")

    return records


def _fasta_record(record_id: str, sequence_lines: list[str]) -> SequenceRecord:
    if not record_id:
        raise ToolInputError("FASTA record is missing an id.")

    sequence = _normalize_sequence("".join(sequence_lines))
    if not sequence:
        raise ToolInputError("FASTA record has an empty sequence.", {"id": record_id})

    return SequenceRecord(id=record_id, sequence=sequence)


def _ensure_unique_ids(records: list[SequenceRecord]) -> None:
    ids = [record.id for record in records]
    duplicates = sorted({record_id for record_id in ids if ids.count(record_id) > 1})
    if duplicates:
        raise ToolInputError("Sequence ids must be unique.", {"duplicates": duplicates})
