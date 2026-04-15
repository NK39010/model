# Implements reusable Biopython-based sequence alignment algorithms.
from __future__ import annotations

from app.tools.alignment.metrics import calculate_alignment_metrics
from app.tools.alignment.schemas import PairwiseAlignmentInput, PairwiseAlignmentOutput, ScoringConfig
from app.tools.errors import ToolDependencyError, ToolInputError


def align_pair(
    sequence_a: str,
    sequence_b: str,
    scoring: ScoringConfig | None = None,
) -> PairwiseAlignmentOutput:
    scoring = scoring or ScoringConfig()
    return biopython_global_alignment(
        PairwiseAlignmentInput(
            sequence_a=sequence_a,
            sequence_b=sequence_b,
            match_score=scoring.match_score,
            mismatch_score=scoring.mismatch_score,
            gap_score=scoring.gap_score,
            sequence_type=scoring.sequence_type,
            substitution_matrix=scoring.substitution_matrix,
        )
    )


def biopython_global_alignment(data: PairwiseAlignmentInput) -> PairwiseAlignmentOutput:
    """Compute a global pairwise alignment through Biopython PairwiseAligner."""
    try:
        from Bio.Align import PairwiseAligner, substitution_matrices
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for sequence alignment.",
            {"install": "uv sync or pip install biopython"},
        ) from exc

    aligner = PairwiseAligner()
    aligner.mode = "global"
    aligner.gap_score = data.gap_score
    matrix = None

    if data.sequence_type == "protein":
        try:
            matrix = substitution_matrices.load(data.substitution_matrix or "BLOSUM62")
        except FileNotFoundError as exc:
            raise ToolInputError(
                "Unknown protein substitution matrix.",
                {"substitution_matrix": data.substitution_matrix},
            ) from exc
        aligner.substitution_matrix = matrix
    else:
        aligner.match_score = data.match_score
        aligner.mismatch_score = data.mismatch_score

    alignment = aligner.align(data.sequence_a, data.sequence_b)[0]
    final_a, final_b = _alignment_to_strings(alignment, data.sequence_a, data.sequence_b)
    metrics = calculate_alignment_metrics(
        final_a,
        final_b,
        is_similar=_positive_matrix_score(matrix) if matrix is not None else None,
    )

    return PairwiseAlignmentOutput(
        aligned_sequence_a=final_a,
        aligned_sequence_b=final_b,
        score=round(float(alignment.score), 4),
        identity=float(metrics["identity"]),
        alignment_length=int(metrics["alignment_length"]),
        similarity=float(metrics["similarity"]),
        match_count=int(metrics["match_count"]),
        mismatch_count=int(metrics["mismatch_count"]),
        gap_count=int(metrics["gap_count"]),
    )


def _alignment_to_strings(alignment: object, sequence_a: str, sequence_b: str) -> tuple[str, str]:
    coordinates = alignment.coordinates
    aligned_a: list[str] = []
    aligned_b: list[str] = []

    for index in range(coordinates.shape[1] - 1):
        start_a = int(coordinates[0, index])
        end_a = int(coordinates[0, index + 1])
        start_b = int(coordinates[1, index])
        end_b = int(coordinates[1, index + 1])
        length_a = end_a - start_a
        length_b = end_b - start_b

        if length_a == length_b:
            aligned_a.append(sequence_a[start_a:end_a])
            aligned_b.append(sequence_b[start_b:end_b])
        elif length_a == 0:
            aligned_a.append("-" * length_b)
            aligned_b.append(sequence_b[start_b:end_b])
        elif length_b == 0:
            aligned_a.append(sequence_a[start_a:end_a])
            aligned_b.append("-" * length_a)
        else:
            length = max(length_a, length_b)
            aligned_a.append(sequence_a[start_a:end_a].ljust(length, "-"))
            aligned_b.append(sequence_b[start_b:end_b].ljust(length, "-"))

    return "".join(aligned_a), "".join(aligned_b)


def _positive_matrix_score(matrix: object):
    def is_similar(char_a: str, char_b: str) -> bool:
        try:
            return matrix[char_a, char_b] > 0
        except IndexError:
            return False

    return is_similar
