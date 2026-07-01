# Runs BMGE-style entropy-based multiple sequence alignment trimming jobs.
from __future__ import annotations

from collections import Counter
from math import log2
from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.bmge.parser import parse_bmge_result
from app.tools.bmge.schemas import BmgeInput, BmgeRecordInput
from app.tools.errors import ToolExecutionError


GAP = "-"


class BmgeAlignmentTrimmingRunner(ToolRunner):
    """Select phylogenetically informative alignment columns using gap and entropy filters."""

    name = "BMGE"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        BmgeInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = BmgeInput.from_payload(payload)
        write_text(workdir / "input_aligned.fasta", _records_to_fasta(data.records))

        columns = _column_stats(data)
        retained_columns = [row["position"] for row in columns if _keep_column(row, data)]
        removed_columns = [row["position"] for row in columns if row["position"] not in set(retained_columns)]
        if not retained_columns:
            raise ToolExecutionError(
                "BMGE removed all columns; relax the entropy or gap thresholds.",
                {"entropy_threshold": data.entropy_threshold, "gap_rate_cutoff": data.gap_rate_cutoff},
            )

        trimmed_records = _trim_records(data.records, retained_columns)
        original_gap_ratio = _alignment_gap_ratio(data.records)
        trimmed_gap_ratio = _alignment_gap_ratio(trimmed_records)
        alignment_length = len(data.records[0].sequence)
        trimmed_length = len(trimmed_records[0].sequence)

        result = {
            "tool": self.name,
            "sequence_type": data.sequence_type,
            "input_sequence_count": len(data.records),
            "original_length": alignment_length,
            "trimmed_length": trimmed_length,
            "removed_column_count": len(removed_columns),
            "retained_column_count": len(retained_columns),
            "retained_fraction": round(trimmed_length / alignment_length if alignment_length else 0.0, 6),
            "original_gap_ratio": round(original_gap_ratio, 6),
            "trimmed_gap_ratio": round(trimmed_gap_ratio, 6),
            "gap_ratio_delta": round(trimmed_gap_ratio - original_gap_ratio, 6),
            "entropy_threshold": data.entropy_threshold,
            "gap_rate_cutoff": data.gap_rate_cutoff,
            "mean_entropy": round(_mean([row["entropy"] for row in columns]), 6),
            "mean_normalized_entropy": round(_mean([row["normalized_entropy"] for row in columns]), 6),
            "retained_columns": retained_columns,
            "removed_columns": removed_columns,
            "retained_regions": _simple_regions(retained_columns),
            "removed_regions": _regions(removed_columns, columns),
            "trimmed_records": [
                {"name": record.name, "sequence": record.sequence, "ungapped_length": len(record.sequence.replace(GAP, ""))}
                for record in trimmed_records
            ],
            "files": {
                "json": "result.json",
                "summary_json": "summary.json",
                "input_aligned_fasta": "input_aligned.fasta",
                "trimmed_fasta": "trimmed.fasta",
                "removed_columns_csv": "removed_columns.csv",
                "retained_columns_csv": "retained_columns.csv",
                "column_entropy_csv": "column_entropy.csv",
            },
        }

        write_text(workdir / "trimmed.fasta", _records_to_fasta(trimmed_records))
        write_json(workdir / "result.json", result)
        write_json(workdir / "summary.json", {key: value for key, value in result.items() if key not in {"trimmed_records"}})
        write_csv(workdir / "removed_columns.csv", _column_rows(columns, removed_columns))
        write_csv(workdir / "retained_columns.csv", _column_rows(columns, retained_columns))
        write_csv(workdir / "column_entropy.csv", columns)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_bmge_result(workdir / "result.json")


def _column_stats(data: BmgeInput) -> list[dict[str, Any]]:
    sequence_count = len(data.records)
    alignment_length = len(data.records[0].sequence)
    rows = []
    for index in range(alignment_length):
        chars = [record.sequence[index] for record in data.records]
        gap_count = chars.count(GAP)
        non_gap = [char for char in chars if char != GAP]
        counts = Counter(non_gap)
        gap_fraction = gap_count / sequence_count if sequence_count else 0.0
        entropy = _entropy(counts)
        normalized_entropy = _normalized_entropy(counts)
        rows.append(
            {
                "position": index + 1,
                "gap_count": gap_count,
                "gap_fraction": round(gap_fraction, 6),
                "non_gap_count": len(non_gap),
                "entropy": round(entropy, 6),
                "normalized_entropy": round(normalized_entropy, 6),
                "reason": _column_reason(gap_fraction, normalized_entropy, data),
            }
        )
    return rows


def _keep_column(row: dict[str, Any], data: BmgeInput) -> bool:
    return row["gap_fraction"] <= data.gap_rate_cutoff and row["normalized_entropy"] <= data.entropy_threshold


def _column_reason(gap_fraction: float, normalized_entropy: float, data: BmgeInput) -> str:
    if gap_fraction > data.gap_rate_cutoff:
        return "high_gap"
    if normalized_entropy > data.entropy_threshold:
        return "high_entropy"
    return "retained"


def _trim_records(records: list[BmgeRecordInput], retained_columns: list[int]) -> list[BmgeRecordInput]:
    indices = [position - 1 for position in retained_columns]
    return [
        BmgeRecordInput(name=record.name, sequence="".join(record.sequence[index] for index in indices))
        for record in records
    ]


def _regions(removed_columns: list[int], columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    column_by_position = {row["position"]: row for row in columns}
    regions = []
    for region in _simple_regions(removed_columns):
        positions = range(region["start"], region["end"] + 1)
        reasons = sorted({column_by_position[position]["reason"] for position in positions})
        gap_values = [column_by_position[position]["gap_fraction"] for position in range(region["start"], region["end"] + 1)]
        entropy_values = [column_by_position[position]["normalized_entropy"] for position in range(region["start"], region["end"] + 1)]
        regions.append(
            {
                **region,
                "reasons": reasons,
                "mean_gap_fraction": round(_mean(gap_values), 6),
                "mean_normalized_entropy": round(_mean(entropy_values), 6),
            }
        )
    return regions


def _simple_regions(columns: list[int]) -> list[dict[str, int]]:
    if not columns:
        return []
    regions = []
    start = previous = columns[0]
    for position in columns[1:]:
        if position == previous + 1:
            previous = position
            continue
        regions.append({"start": start, "end": previous, "length": previous - start + 1})
        start = previous = position
    regions.append({"start": start, "end": previous, "length": previous - start + 1})
    return regions


def _alignment_gap_ratio(records: list[BmgeRecordInput]) -> float:
    total = sum(len(record.sequence) for record in records)
    gaps = sum(record.sequence.count(GAP) for record in records)
    return gaps / total if total else 0.0


def _column_rows(columns: list[dict[str, Any]], selected_columns: list[int]) -> list[dict[str, Any]]:
    selected = set(selected_columns)
    return [row for row in columns if row["position"] in selected]


def _records_to_fasta(records: list[BmgeRecordInput]) -> str:
    lines: list[str] = []
    for record in records:
        lines.append(f">{record.name}")
        for start in range(0, len(record.sequence), 80):
            lines.append(record.sequence[start : start + 80])
    return "\n".join(lines) + "\n"


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
