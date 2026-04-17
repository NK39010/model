# Parses resistance marker selection result files.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_resistance_marker_selection_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ToolParseError("Resistance marker selection result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("Resistance marker selection result file is not valid JSON.", {"path": str(path)}) from exc

    required_fields = {"query", "candidate_count", "candidates"}
    missing = sorted(required_fields - data.keys())
    if missing:
        raise ToolParseError("Resistance marker selection result is missing fields.", {"missing": missing})

    return data
