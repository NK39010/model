# Computes visualization-ready quality metrics for multiple sequence alignments.
from __future__ import annotations

from collections import Counter
from math import log2
from typing import Any

from app.tools.msa_quality.schemas import MsaQualityInput, MsaRecordInput


GAP = "-"
LOW_IDENTITY_THRESHOLD = 0.85
OUTLIER_DELTA = 0.15


def analyze_msa_quality(data: MsaQualityInput) -> dict[str, Any]:
    records = data.records
    sequence_count = len(records)
    alignment_length = len(records[0].sequence)
    ungapped_lengths = [len(record.sequence.replace(GAP, "")) for record in records]

    position_quality = _position_quality(data)
    sequence_quality = _sequence_quality(records, alignment_length)
    identity_matrix, pairwise_rows, average_identity = _identity_matrix(records)
    consensus = _consensus(position_quality)
    problematic_regions = _problematic_regions(data, position_quality)

    variable_sites = sum(1 for row in position_quality if row["is_variable"])
    conserved_sites = sum(1 for row in position_quality if row["is_conserved"])
    high_gap_columns = sum(1 for row in position_quality if row["gap_fraction"] >= data.high_gap_threshold)
    total_gaps = sum(row["gap_count"] for row in position_quality)
    total_cells = sequence_count * alignment_length
    gap_ratio = total_gaps / total_cells if total_cells else 0.0
    average_entropy = _mean([row["entropy"] for row in position_quality])
    average_normalized_entropy = _mean([row["normalized_entropy"] for row in position_quality])
    mean_conservation = _mean([row["conservation"] for row in position_quality])
    mean_consensus_support = _mean([row["consensus_support"] for row in position_quality])
    conserved_ratio = conserved_sites / alignment_length if alignment_length else 0.0

    quality_score = _quality_score(
        average_identity=average_identity,
        gap_ratio=gap_ratio,
        conserved_ratio=conserved_ratio,
        high_gap_columns=high_gap_columns,
        alignment_length=alignment_length,
        average_normalized_entropy=average_normalized_entropy,
    )

    summary = {
        "sequence_count": sequence_count,
        "min_ungapped_length": min(ungapped_lengths),
        "max_ungapped_length": max(ungapped_lengths),
        "mean_ungapped_length": round(_mean(ungapped_lengths), 3),
        "alignment_length": alignment_length,
        "total_gaps": total_gaps,
        "gap_ratio": round(gap_ratio, 6),
        "average_identity": round(average_identity, 6),
        "mean_conservation": round(mean_conservation, 6),
        "variable_sites": variable_sites,
        "conserved_sites": conserved_sites,
        "conserved_ratio": round(conserved_ratio, 6),
        "average_entropy": round(average_entropy, 6),
        "average_normalized_entropy": round(average_normalized_entropy, 6),
        "mean_consensus_support": round(mean_consensus_support, 6),
        "high_gap_columns": high_gap_columns,
        "problematic_region_count": len(problematic_regions),
        "quality_score": quality_score["score"],
        "quality_label": quality_score["label"],
        "quality_status": quality_score["status"],
    }

    recommendations = _recommendations(
        summary=summary,
        sequence_quality=sequence_quality,
        problematic_regions=problematic_regions,
    )
    aligned_records = [
        {
            "name": record.name,
            "sequence": record.sequence,
            "ungapped_length": len(record.sequence.replace(GAP, "")),
        }
        for record in records
    ]
    sections = _sections(
        summary=summary,
        quality_score=quality_score,
        aligned_records=aligned_records,
        sequence_quality=sequence_quality,
        position_quality=position_quality,
        identity_matrix=identity_matrix,
        pairwise_rows=pairwise_rows,
        average_identity=average_identity,
        consensus=consensus,
        problematic_regions=problematic_regions,
        recommendations=recommendations,
    )

    return {
        "tool": "MSA_quality",
        "sequence_type": data.sequence_type,
        "aligned_records": aligned_records,
        "summary": summary,
        "quality_score": quality_score,
        "sections": sections,
        "sequence_quality": sequence_quality,
        "position_quality": position_quality,
        "identity_matrix": identity_matrix,
        "pairwise_identity": pairwise_rows,
        "consensus": consensus,
        "problematic_regions": problematic_regions,
        "recommendations": recommendations,
        "tracks": {
            "gap_fraction": [row["gap_fraction"] for row in position_quality],
            "conservation": [row["conservation"] for row in position_quality],
            "entropy": [row["entropy"] for row in position_quality],
            "normalized_entropy": [row["normalized_entropy"] for row in position_quality],
            "consensus_support": [row["consensus_support"] for row in position_quality],
        },
    }


def _sections(
    *,
    summary: dict[str, Any],
    quality_score: dict[str, Any],
    aligned_records: list[dict[str, Any]],
    sequence_quality: list[dict[str, Any]],
    position_quality: list[dict[str, Any]],
    identity_matrix: dict[str, Any],
    pairwise_rows: list[dict[str, Any]],
    average_identity: float,
    consensus: dict[str, Any],
    problematic_regions: list[dict[str, Any]],
    recommendations: list[str],
) -> dict[str, Any]:
    high_gap_regions = _regions_with_reason(problematic_regions, "high_gap")
    low_conservation_regions = _regions_with_reason(problematic_regions, "low_conservation")
    high_entropy_regions = _regions_with_reason(problematic_regions, "high_entropy")
    return {
        "overview": {
            "summary": summary,
            "quality_score": quality_score,
            "recommendations": recommendations,
        },
        "gap_quality": {
            "overall_gap_ratio": summary["gap_ratio"],
            "high_gap_columns": summary["high_gap_columns"],
            "sequence_gap_rows": sequence_quality,
            "position_gap_track": [
                {"position": row["position"], "gap_fraction": row["gap_fraction"]}
                for row in position_quality
            ],
            "gap_regions": high_gap_regions,
        },
        "conservation_variation": {
            "mean_conservation": summary["mean_conservation"],
            "average_entropy": summary["average_entropy"],
            "variable_sites": summary["variable_sites"],
            "conserved_sites": summary["conserved_sites"],
            "conservation_track": [
                {"position": row["position"], "conservation": row["conservation"]}
                for row in position_quality
            ],
            "entropy_track": [
                {"position": row["position"], "entropy": row["entropy"], "normalized_entropy": row["normalized_entropy"]}
                for row in position_quality
            ],
            "low_conservation_regions": low_conservation_regions,
            "high_entropy_regions": high_entropy_regions,
        },
        "similarity": {
            "average_identity": round(average_identity, 6),
            "identity_matrix": identity_matrix,
            "pairwise_identity": pairwise_rows,
            "low_identity_threshold": LOW_IDENTITY_THRESHOLD,
            "low_identity_pairs": _low_identity_pairs(pairwise_rows),
            "outlier_delta": OUTLIER_DELTA,
            "outlier_sequences": _outlier_sequences(identity_matrix, average_identity),
        },
        "consensus": {
            **consensus,
            "support_track": [
                {"position": row["position"], "support": row["support"]}
                for row in consensus["records"]
            ],
            "ambiguous_positions": [
                row["position"]
                for row in consensus["records"]
                if row["consensus"] in {"N", "X"}
            ],
            "gap_consensus_positions": [
                row["position"]
                for row in consensus["records"]
                if row["consensus"] == GAP
            ],
        },
        "alignment_browser": {
            "records": aligned_records,
            "position_annotations": [
                {
                    "position": row["position"],
                    "consensus": row["consensus"],
                    "gap_fraction": row["gap_fraction"],
                    "conservation": row["conservation"],
                    "entropy": row["entropy"],
                    "is_high_gap": row["is_high_gap"],
                    "is_low_conservation": row["is_low_conservation"],
                    "is_high_entropy": row["is_high_entropy"],
                }
                for row in position_quality
            ],
        },
    }


def _regions_with_reason(regions: list[dict[str, Any]], reason: str) -> list[dict[str, Any]]:
    return [region for region in regions if reason in region["reasons"]]


def _low_identity_pairs(pairwise_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        row
        for row in sorted(pairwise_rows, key=lambda item: item["identity"])
        if row["identity"] < LOW_IDENTITY_THRESHOLD
    ]


def _outlier_sequences(identity_matrix: dict[str, Any], average_identity: float) -> list[dict[str, Any]]:
    labels = identity_matrix["labels"]
    matrix = identity_matrix["matrix"]
    rows: list[dict[str, Any]] = []
    for index, label in enumerate(labels):
        identities = [value for col_index, value in enumerate(matrix[index]) if col_index != index]
        mean_identity = _mean(identities)
        if mean_identity <= average_identity - OUTLIER_DELTA:
            rows.append(
                {
                    "name": label,
                    "mean_identity": round(mean_identity, 6),
                    "delta_from_average": round(mean_identity - average_identity, 6),
                }
            )
    return sorted(rows, key=lambda row: row["mean_identity"])


def _position_quality(data: MsaQualityInput) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    records = data.records
    sequence_count = len(records)
    alignment_length = len(records[0].sequence)
    ambiguous = "X" if data.sequence_type == "protein" else "N"

    for position in range(alignment_length):
        chars = [record.sequence[position] for record in records]
        gap_count = chars.count(GAP)
        non_gap = [char for char in chars if char != GAP]
        counts = Counter(non_gap)
        gap_fraction = gap_count / sequence_count if sequence_count else 0.0
        top_symbol, top_count = _top_count(counts)
        non_gap_count = len(non_gap)
        support = top_count / non_gap_count if non_gap_count else 0.0
        support_all = top_count / sequence_count if sequence_count else 0.0
        entropy = _entropy(counts)
        normalized_entropy = _normalized_entropy(counts)

        if gap_fraction >= data.gap_consensus_threshold:
            consensus_char = GAP
        elif top_symbol and support >= data.majority_threshold:
            consensus_char = top_symbol
        else:
            consensus_char = ambiguous

        unique_non_gap = len(counts)
        rows.append(
            {
                "position": position + 1,
                "gap_count": gap_count,
                "gap_fraction": round(gap_fraction, 6),
                "non_gap_count": non_gap_count,
                "counts": dict(sorted(counts.items())),
                "major_symbol": top_symbol,
                "major_count": top_count,
                "major_fraction_non_gap": round(support, 6),
                "major_fraction_all": round(support_all, 6),
                "consensus": consensus_char,
                "consensus_support": round(support if consensus_char != GAP else gap_fraction, 6),
                "conservation": round(support, 6),
                "entropy": round(entropy, 6),
                "normalized_entropy": round(normalized_entropy, 6),
                "is_variable": unique_non_gap > 1,
                "is_conserved": unique_non_gap == 1 and gap_count == 0,
                "is_high_gap": gap_fraction >= data.high_gap_threshold,
                "is_low_conservation": non_gap_count > 0 and support <= data.low_conservation_threshold,
                "is_high_entropy": entropy >= data.high_entropy_threshold,
            }
        )
    return rows


def _sequence_quality(records: list[MsaRecordInput], alignment_length: int) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in records:
        gap_count = record.sequence.count(GAP)
        ungapped_length = len(record.sequence.replace(GAP, ""))
        rows.append(
            {
                "name": record.name,
                "alignment_length": alignment_length,
                "ungapped_length": ungapped_length,
                "gap_count": gap_count,
                "gap_fraction": round(gap_count / alignment_length if alignment_length else 0.0, 6),
                "leading_gaps": len(record.sequence) - len(record.sequence.lstrip(GAP)),
                "trailing_gaps": len(record.sequence) - len(record.sequence.rstrip(GAP)),
            }
        )
    return rows


def _identity_matrix(records: list[MsaRecordInput]) -> tuple[dict[str, Any], list[dict[str, Any]], float]:
    labels = [record.name for record in records]
    matrix: list[list[float]] = []
    pairwise_rows: list[dict[str, Any]] = []
    off_diagonal: list[float] = []

    for row_record in records:
        row: list[float] = []
        for col_record in records:
            identity, comparable, matches = _pair_identity(row_record.sequence, col_record.sequence)
            row.append(round(identity, 6))
            if row_record.name < col_record.name:
                pairwise_rows.append(
                    {
                        "sequence_a": row_record.name,
                        "sequence_b": col_record.name,
                        "identity": round(identity, 6),
                        "comparable_columns": comparable,
                        "match_count": matches,
                    }
                )
                off_diagonal.append(identity)
        matrix.append(row)

    return (
        {
            "labels": labels,
            "matrix": matrix,
        },
        pairwise_rows,
        _mean(off_diagonal) if off_diagonal else 1.0,
    )


def _pair_identity(sequence_a: str, sequence_b: str) -> tuple[float, int, int]:
    comparable = 0
    matches = 0
    for char_a, char_b in zip(sequence_a, sequence_b, strict=True):
        if char_a == GAP or char_b == GAP:
            continue
        comparable += 1
        if char_a == char_b:
            matches += 1
    return (matches / comparable if comparable else 0.0, comparable, matches)


def _consensus(position_quality: list[dict[str, Any]]) -> dict[str, Any]:
    sequence = "".join(row["consensus"] for row in position_quality)
    rows = [
        {
            "position": row["position"],
            "consensus": row["consensus"],
            "support": row["consensus_support"],
            "gap_fraction": row["gap_fraction"],
            "conservation": row["conservation"],
            "entropy": row["entropy"],
            "counts": row["counts"],
        }
        for row in position_quality
    ]
    return {
        "sequence": sequence,
        "length": len(sequence),
        "ungapped_length": len(sequence.replace(GAP, "")),
        "mean_support": round(_mean([row["support"] for row in rows]), 6),
        "records": rows,
    }


def _problematic_regions(data: MsaQualityInput, position_quality: list[dict[str, Any]]) -> list[dict[str, Any]]:
    regions: list[dict[str, Any]] = []
    active: list[dict[str, Any]] = []

    def flush() -> None:
        if not active:
            return
        start = active[0]["position"]
        end = active[-1]["position"]
        reasons = sorted(
            {
                reason
                for row in active
                for reason in _problem_reasons(row)
            }
        )
        regions.append(
            {
                "start": start,
                "end": end,
                "length": end - start + 1,
                "reasons": reasons,
                "max_gap_fraction": round(max(row["gap_fraction"] for row in active), 6),
                "min_conservation": round(min(row["conservation"] for row in active), 6),
                "max_entropy": round(max(row["entropy"] for row in active), 6),
                "mean_gap_fraction": round(_mean([row["gap_fraction"] for row in active]), 6),
                "mean_conservation": round(_mean([row["conservation"] for row in active]), 6),
                "mean_entropy": round(_mean([row["entropy"] for row in active]), 6),
            }
        )
        active.clear()

    for row in position_quality:
        is_problem = (
            row["gap_fraction"] >= data.high_gap_threshold
            or row["is_low_conservation"]
            or row["entropy"] >= data.high_entropy_threshold
        )
        if is_problem:
            active.append(row)
        else:
            flush()
    flush()
    return regions


def _problem_reasons(row: dict[str, Any]) -> list[str]:
    reasons = []
    if row["is_high_gap"]:
        reasons.append("high_gap")
    if row["is_low_conservation"]:
        reasons.append("low_conservation")
    if row["is_high_entropy"]:
        reasons.append("high_entropy")
    return reasons


def _quality_score(
    *,
    average_identity: float,
    gap_ratio: float,
    conserved_ratio: float,
    high_gap_columns: int,
    alignment_length: int,
    average_normalized_entropy: float,
) -> dict[str, Any]:
    high_gap_score = 1.0 - min(1.0, high_gap_columns / alignment_length if alignment_length else 0.0)
    entropy_score = 1.0 - min(1.0, average_normalized_entropy)
    score = (
        average_identity * 30.0
        + (1.0 - gap_ratio) * 25.0
        + conserved_ratio * 20.0
        + high_gap_score * 15.0
        + entropy_score * 10.0
    )
    rounded = round(max(0.0, min(100.0, score)), 2)
    if rounded >= 85:
        label = "Excellent"
        status = "good"
    elif rounded >= 70:
        label = "Good"
        status = "good"
    elif rounded >= 50:
        label = "Warning"
        status = "warning"
    else:
        label = "Poor"
        status = "poor"
    return {
        "score": rounded,
        "label": label,
        "status": status,
        "components": {
            "average_identity": round(average_identity * 30.0, 3),
            "gap_ratio": round((1.0 - gap_ratio) * 25.0, 3),
            "conserved_ratio": round(conserved_ratio * 20.0, 3),
            "high_gap_columns": round(high_gap_score * 15.0, 3),
            "entropy": round(entropy_score * 10.0, 3),
        },
    }


def _recommendations(
    *,
    summary: dict[str, Any],
    sequence_quality: list[dict[str, Any]],
    problematic_regions: list[dict[str, Any]],
) -> list[str]:
    recommendations: list[str] = []
    if summary["gap_ratio"] >= 0.2:
        recommendations.append("Gap ratio is high; consider MAFFT L-INS-i or E-INS-i and inspect sequence homology.")
    if summary["average_identity"] < 0.7:
        recommendations.append("Average identity is low; check whether all sequences are homologous or split them into groups.")
    if problematic_regions:
        recommendations.append("Problematic regions were detected; consider trimming low-quality columns with trimAl or Gblocks.")
    high_gap_sequences = [row["name"] for row in sequence_quality if row["gap_fraction"] >= 0.3]
    if high_gap_sequences:
        recommendations.append(
            "Some sequences have high gap fractions; inspect or remove: " + ", ".join(high_gap_sequences[:8])
        )
    if not recommendations:
        recommendations.append("Alignment quality metrics look acceptable for downstream analysis.")
    return recommendations


def _top_count(counts: Counter[str]) -> tuple[str | None, int]:
    if not counts:
        return None, 0
    return max(counts.items(), key=lambda item: (item[1], item[0]))


def _entropy(counts: Counter[str]) -> float:
    total = sum(counts.values())
    if total == 0:
        return 0.0
    entropy = 0.0
    for count in counts.values():
        probability = count / total
        entropy -= probability * log2(probability)
    return entropy


def _normalized_entropy(counts: Counter[str]) -> float:
    observed = len([count for count in counts.values() if count > 0])
    if observed <= 1:
        return 0.0
    return _entropy(counts) / log2(observed)


def _mean(values: list[float | int]) -> float:
    return sum(values) / len(values) if values else 0.0
