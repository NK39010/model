# Parses MAFFT alignment output files.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_mafft_result(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolParseError("Could not parse MAFFT result.", {"path": str(path)}) from exc


def parse_aligned_fasta(value: str) -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    current_name: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_name is not None:
                records.append(_record(current_name, current_lines))
            current_name = line[1:].strip().split()[0]
            current_lines = []
        else:
            current_lines.append(line)

    if current_name is not None:
        records.append(_record(current_name, current_lines))

    if not records:
        raise ToolParseError("MAFFT output did not contain FASTA records.")
    return records


def _record(name: str, lines: list[str]) -> dict[str, str]:
    sequence = "".join(lines).upper()
    if not name:
        raise ToolParseError("MAFFT output contains a FASTA record without a name.")
    if not sequence:
        raise ToolParseError("MAFFT output contains an empty sequence.", {"name": name})
    return {"name": name, "sequence": sequence}

