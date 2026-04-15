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

        required = ["sequence_a", "sequence_b"]
        missing = [key for key in required if key not in payload]
        if missing:
            raise ToolInputError("Missing required alignment fields.", {"missing": missing})

        sequence_a = _normalize_sequence(payload["sequence_a"])
        sequence_b = _normalize_sequence(payload["sequence_b"])

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

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ReferenceSimilarityInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")
        if "reference" not in payload:
            raise ToolInputError("Missing reference sequence.")
        if "targets" not in payload:
            raise ToolInputError("Missing target sequences.")
        if not isinstance(payload["targets"], list) or not payload["targets"]:
            raise ToolInputError("Targets must be a non-empty list.")

        reference = SequenceRecord.from_payload(payload["reference"], "reference")
        targets = [
            SequenceRecord.from_payload(record, f"target_{index + 1}")
            for index, record in enumerate(payload["targets"])
        ]
        _ensure_unique_ids([reference, *targets])

        return cls(
            reference=reference,
            targets=targets,
            scoring=ScoringConfig.from_payload(payload),
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
        if "sequences" not in payload:
            raise ToolInputError("Missing sequences.")
        if not isinstance(payload["sequences"], list) or len(payload["sequences"]) < 2:
            raise ToolInputError("Sequences must contain at least two records.")

        metric = payload.get("metric", "identity")
        if metric not in {"identity", "similarity", "score"}:
            raise ToolInputError(
                "Unsupported matrix metric.",
                {"metric": metric, "supported": ["identity", "similarity", "score"]},
            )

        sequences = [
            SequenceRecord.from_payload(record, f"seq_{index + 1}")
            for index, record in enumerate(payload["sequences"])
        ]
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


def _ensure_unique_ids(records: list[SequenceRecord]) -> None:
    ids = [record.id for record in records]
    duplicates = sorted({record_id for record_id in ids if ids.count(record_id) > 1})
    if duplicates:
        raise ToolInputError("Sequence ids must be unique.", {"duplicates": duplicates})
