# Runs MSA quality analysis and writes visualization-ready outputs.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.msa_quality.metrics import analyze_msa_quality
from app.tools.msa_quality.parser import parse_msa_quality_result
from app.tools.msa_quality.schemas import MsaQualityInput


class MsaQualityRunner(ToolRunner):
    """Analyze aligned FASTA records for MSA quality metrics."""

    name = "MSA_quality"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        MsaQualityInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = MsaQualityInput.from_payload(payload)
        result = analyze_msa_quality(data)
        result["files"] = {
            "json": "result.json",
            "quality_json": "msa_quality.json",
            "position_quality_csv": "position_quality.csv",
            "sequence_quality_csv": "sequence_quality.csv",
            "identity_matrix_csv": "identity_matrix.csv",
            "pairwise_identity_csv": "pairwise_identity.csv",
            "consensus_fasta": "consensus.fasta",
            "consensus_csv": "consensus.csv",
            "problematic_regions_csv": "problematic_regions.csv",
        }

        write_json(workdir / "result.json", result)
        write_json(workdir / "msa_quality.json", result)
        write_csv(workdir / "position_quality.csv", _position_rows_for_csv(result["position_quality"]))
        write_csv(workdir / "sequence_quality.csv", result["sequence_quality"])
        write_csv(workdir / "identity_matrix.csv", _identity_matrix_rows(result["identity_matrix"]))
        write_csv(workdir / "pairwise_identity.csv", result["pairwise_identity"])
        write_csv(workdir / "consensus.csv", _consensus_rows_for_csv(result["consensus"]["records"]))
        write_csv(workdir / "problematic_regions.csv", _problematic_region_rows(result["problematic_regions"]))
        write_text(workdir / "consensus.fasta", _consensus_fasta(result["consensus"]["sequence"]))

        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_msa_quality_result(workdir / "result.json")


def _position_rows_for_csv(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            **row,
            "counts": json.dumps(row["counts"], ensure_ascii=False, sort_keys=True),
        }
        for row in rows
    ]


def _consensus_rows_for_csv(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            **row,
            "counts": json.dumps(row["counts"], ensure_ascii=False, sort_keys=True),
        }
        for row in rows
    ]


def _problematic_region_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            **row,
            "reasons": ",".join(row["reasons"]),
        }
        for row in rows
    ]


def _identity_matrix_rows(identity_matrix: dict[str, Any]) -> list[dict[str, Any]]:
    labels = identity_matrix["labels"]
    rows = []
    for label, values in zip(labels, identity_matrix["matrix"], strict=True):
        rows.append({"sequence": label, **{col: value for col, value in zip(labels, values, strict=True)}})
    return rows


def _consensus_fasta(sequence: str) -> str:
    lines = [">consensus"]
    for start in range(0, len(sequence), 80):
        lines.append(sequence[start : start + 80])
    return "\n".join(lines) + "\n"

