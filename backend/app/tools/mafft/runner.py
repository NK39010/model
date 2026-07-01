# Runs MAFFT multiple sequence alignment jobs.
from __future__ import annotations

import subprocess
import os
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolExecutionError
from app.tools.mafft.modes import MAFFT_MODES
from app.tools.mafft.parser import parse_aligned_fasta, parse_mafft_result
from app.tools.mafft.resolver import resolve_mafft_binary
from app.tools.mafft.schemas import MafftAlignmentInput


class MafftAlignmentRunner(ToolRunner):
    """Run MAFFT multiple sequence alignment with a selectable mode."""

    name = "mafft_alignment"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        MafftAlignmentInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = MafftAlignmentInput.from_payload(payload)
        binary = resolve_mafft_binary(data.mafft_version)
        input_fasta = _records_to_fasta(data)
        input_path = workdir / "input.fasta"
        aligned_path = workdir / "aligned.fasta"
        write_text(input_path, input_fasta)

        mode_config = MAFFT_MODES[data.mode]
        command = [
            str(binary.path),
            *mode_config["args"],
            "--thread",
            str(data.thread_count),
            str(input_path),
        ]

        env = os.environ.copy()
        if binary.binaries_dir is not None:
            env["MAFFT_BINARIES"] = str(binary.binaries_dir)

        try:
            completed = subprocess.run(
                command,
                cwd=workdir,
                env=env,
                text=True,
                capture_output=True,
                timeout=600,
                check=False,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolExecutionError("MAFFT execution failed.", {"reason": str(exc)}) from exc

        write_text(workdir / "mafft.stderr.txt", completed.stderr or "")
        if completed.returncode != 0:
            raise ToolExecutionError(
                "MAFFT returned a non-zero exit code.",
                {"returncode": completed.returncode, "stderr": completed.stderr[-2000:]},
            )

        aligned_fasta = completed.stdout
        write_text(aligned_path, aligned_fasta)
        aligned_records = parse_aligned_fasta(aligned_fasta)
        alignment_length = len(aligned_records[0]["sequence"]) if aligned_records else 0
        if any(len(record["sequence"]) != alignment_length for record in aligned_records):
            raise ToolExecutionError("MAFFT output sequences have inconsistent alignment lengths.")

        result = {
            "tool": self.name,
            "mode": data.mode,
            "mode_label": mode_config["label"],
            "mode_description": mode_config["description"],
            "mafft_version": binary.version,
            "mafft_source": binary.source,
            "sequence_type": data.sequence_type,
            "sequence_count": len(data.records),
            "alignment_length": alignment_length,
            "thread_count": data.thread_count,
            "aligned_records": aligned_records,
            "files": {
                "json": "result.json",
                "input_fasta": "input.fasta",
                "aligned_fasta": "aligned.fasta",
                "stderr": "mafft.stderr.txt",
            },
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_mafft_result(workdir / "result.json")


def _records_to_fasta(data: MafftAlignmentInput) -> str:
    lines: list[str] = []
    for record in data.records:
        lines.append(f">{record.name}")
        lines.append(record.sequence)
    return "\n".join(lines) + "\n"
