# Parses codon optimization result files.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_codon_optimization_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ToolParseError("Codon optimization result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("Codon optimization result file is not valid JSON.", {"path": str(path)}) from exc

    required_fields = {"host", "input_type", "optimized_sequence", "protein_sequence", "metrics"}
    missing = sorted(required_fields - data.keys())
    if missing:
        raise ToolParseError("Codon optimization result is missing fields.", {"missing": missing})

    return data
