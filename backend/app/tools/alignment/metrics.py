# Calculates reusable alignment metrics such as identity, similarity, gaps, and mismatches.
from __future__ import annotations

from collections.abc import Callable


def calculate_alignment_metrics(
    aligned_a: str,
    aligned_b: str,
    is_similar: Callable[[str, str], bool] | None = None,
) -> dict[str, float | int]:
    if len(aligned_a) != len(aligned_b):
        raise ValueError("Aligned sequences must have the same length.")

    alignment_length = len(aligned_a)
    match_count = 0
    similar_count = 0
    mismatch_count = 0
    gap_count = 0

    for char_a, char_b in zip(aligned_a, aligned_b, strict=True):
        if char_a == "-" or char_b == "-":
            gap_count += 1
        elif char_a == char_b:
            match_count += 1
            similar_count += 1
        elif is_similar and is_similar(char_a, char_b):
            similar_count += 1
            mismatch_count += 1
        else:
            mismatch_count += 1

    identity = match_count / alignment_length if alignment_length else 0.0
    similarity = similar_count / alignment_length if alignment_length else 0.0

    return {
        "alignment_length": alignment_length,
        "match_count": match_count,
        "mismatch_count": mismatch_count,
        "gap_count": gap_count,
        "identity": round(identity, 4),
        "similarity": round(similarity, 4),
    }
