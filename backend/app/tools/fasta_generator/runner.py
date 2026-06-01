# Generates FASTA files from user-provided records or two-column tables.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.file_service import write_csv, write_json, write_text
from app.tools.base import ToolRunner
from app.tools.fasta_generator.parser import parse_fasta_generator_result
from app.tools.fasta_generator.schemas import FastaGeneratorInput


class FastaGeneratorRunner(ToolRunner):
    """Generate FASTA and per-record metadata."""

    name = "fasta_generator"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        FastaGeneratorInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = FastaGeneratorInput.from_payload(payload)
        fasta_text = _records_to_fasta(data)
        rows = [
            {
                "name": record.name,
                "length": len(record.sequence),
                "sequence": record.sequence,
            }
            for record in data.records
        ]
        result = {
            "record_count": len(data.records),
            "sequence_type": data.sequence_type,
            "strict": data.strict,
            "wrap_length": data.wrap_length,
            "records": rows,
            "fasta": fasta_text,
            "files": {
                "json": "result.json",
                "fasta": "output.fasta",
                "csv": "records.csv",
            },
        }

        write_json(workdir / "result.json", result)
        write_text(workdir / "output.fasta", fasta_text)
        write_csv(workdir / "records.csv", rows)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_fasta_generator_result(workdir / "result.json")


def _records_to_fasta(data: FastaGeneratorInput) -> str:
    lines: list[str] = []
    for record in data.records:
        lines.append(f">{record.name}")
        if data.wrap_length is None:
            lines.append(record.sequence)
        else:
            for start in range(0, len(record.sequence), data.wrap_length):
                lines.append(record.sequence[start : start + data.wrap_length])
    return "\n".join(lines) + "\n"
