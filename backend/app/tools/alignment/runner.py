# Implements sequence alignment task runners for pairwise, table, and matrix outputs.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_matrix_csv, write_text
from app.tools.alignment.algorithms import biopython_global_alignment
from app.tools.alignment.parser import parse_alignment_result
from app.tools.alignment.schemas import (
    PairwiseAlignmentInput,
    PairwiseMatrixInput,
    ReferenceSimilarityInput,
)
from app.tools.base import ToolRunner


class PairwiseAlignmentRunner(ToolRunner):
    """Run Biopython global pairwise alignment."""

    name = "pairwise_alignment"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        PairwiseAlignmentInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = PairwiseAlignmentInput.from_payload(payload)
        output = biopython_global_alignment(data)

        write_json(workdir / "result.json", output.to_dict())
        write_text(
            workdir / "alignment.txt",
            "\n".join(
                [
                    output.aligned_sequence_a,
                    _match_line(output.aligned_sequence_a, output.aligned_sequence_b),
                    output.aligned_sequence_b,
                    f"score={output.score}",
                    f"identity={output.identity:.4f}",
                ]
            )
            + "\n",
        )

        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_alignment_result(
            workdir / "result.json",
            required_fields={
                "aligned_sequence_a",
                "aligned_sequence_b",
                "score",
                "identity",
                "alignment_length",
            },
        )


class ReferenceSimilarityTableRunner(ToolRunner):
    """Compare one reference sequence against many target sequences."""

    name = "reference_similarity_table"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        ReferenceSimilarityInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = ReferenceSimilarityInput.from_payload(payload)
        rows: list[dict[str, Any]] = []

        for target in data.targets:
            alignment = biopython_global_alignment(
                PairwiseAlignmentInput(
                    sequence_a=data.reference.sequence,
                    sequence_b=target.sequence,
                    match_score=data.scoring.match_score,
                    mismatch_score=data.scoring.mismatch_score,
                    gap_score=data.scoring.gap_score,
                    sequence_type=data.scoring.sequence_type,
                    substitution_matrix=data.scoring.substitution_matrix,
                )
            )
            row = {
                "reference_id": data.reference.id,
                "target_id": target.id,
                "score": alignment.score,
                "identity": alignment.identity,
                "similarity": alignment.similarity,
                "alignment_length": alignment.alignment_length,
                "match_count": alignment.match_count,
                "mismatch_count": alignment.mismatch_count,
                "gap_count": alignment.gap_count,
            }
            if data.include_alignments:
                row["aligned_reference"] = alignment.aligned_sequence_a
                row["aligned_target"] = alignment.aligned_sequence_b
                row["alignment_match_line"] = _match_line(
                    alignment.aligned_sequence_a,
                    alignment.aligned_sequence_b,
                )
            rows.append(row)

        result = {
            "reference_id": data.reference.id,
            "target_count": len(data.targets),
            "include_alignments": data.include_alignments,
            "rows": rows,
            "files": {
                "json": "result.json",
                "csv": "similarity_table.csv",
            },
        }

        write_json(workdir / "result.json", result)
        write_csv(workdir / "similarity_table.csv", rows)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_alignment_result(
            workdir / "result.json",
            required_fields={"reference_id", "target_count", "rows"},
        )


class PairwiseSimilarityMatrixRunner(ToolRunner):
    """Compare many sequences pairwise and return heatmap-ready matrix data."""

    name = "pairwise_similarity_matrix"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        PairwiseMatrixInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = PairwiseMatrixInput.from_payload(payload)
        sequence_ids = [record.id for record in data.sequences]
        size = len(data.sequences)
        matrix: list[list[float | int]] = [[0.0 for _ in range(size)] for _ in range(size)]
        long_table: list[dict[str, Any]] = []

        for index in range(size):
            matrix[index][index] = 1.0 if data.metric in {"identity", "similarity"} else 0

        for row_index in range(size):
            for col_index in range(row_index + 1, size):
                sequence_a = data.sequences[row_index]
                sequence_b = data.sequences[col_index]
                alignment = biopython_global_alignment(
                    PairwiseAlignmentInput(
                        sequence_a=sequence_a.sequence,
                        sequence_b=sequence_b.sequence,
                        match_score=data.scoring.match_score,
                        mismatch_score=data.scoring.mismatch_score,
                        gap_score=data.scoring.gap_score,
                        sequence_type=data.scoring.sequence_type,
                        substitution_matrix=data.scoring.substitution_matrix,
                    )
                )
                value = getattr(alignment, data.metric)
                matrix[row_index][col_index] = value
                matrix[col_index][row_index] = value
                long_table.append(
                    {
                        "sequence_a": sequence_a.id,
                        "sequence_b": sequence_b.id,
                        "value": value,
                        "score": alignment.score,
                        "identity": alignment.identity,
                        "similarity": alignment.similarity,
                        "alignment_length": alignment.alignment_length,
                        "gap_count": alignment.gap_count,
                        "mismatch_count": alignment.mismatch_count,
                    }
                )

        result = {
            "sequence_ids": sequence_ids,
            "metric": data.metric,
            "matrix": matrix,
            "long_table": long_table,
            "heatmap": {
                "x_labels": sequence_ids,
                "y_labels": sequence_ids,
                "values": matrix,
            },
            "files": {
                "json": "result.json",
                "matrix_csv": "similarity_matrix.csv",
                "long_csv": "pairwise_table.csv",
            },
        }

        write_json(workdir / "result.json", result)
        write_matrix_csv(workdir / "similarity_matrix.csv", sequence_ids, matrix)
        write_csv(workdir / "pairwise_table.csv", long_table)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_alignment_result(
            workdir / "result.json",
            required_fields={"sequence_ids", "metric", "matrix", "heatmap", "long_table"},
        )


def _match_line(sequence_a: str, sequence_b: str) -> str:
    return "".join("|" if a == b else " " for a, b in zip(sequence_a, sequence_b, strict=True))
