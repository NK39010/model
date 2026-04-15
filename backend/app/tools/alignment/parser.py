# Parses alignment result files into standard module output structures.
from __future__ import annotations

import json
from pathlib import Path
from collections.abc import Iterable

from app.tools.errors import ToolParseError


def parse_alignment_result(path: Path, required_fields: Iterable[str] | None = None) -> dict:
    """Load and validate the JSON result produced by the alignment runner."""
    if not path.exists():
        raise ToolParseError("Alignment result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("Alignment result file is not valid JSON.", {"path": str(path)}) from exc

    required = set(required_fields or [])
    missing = sorted(required - data.keys())
    if missing:
        raise ToolParseError("Alignment result is missing fields.", {"missing": missing})

    return data
