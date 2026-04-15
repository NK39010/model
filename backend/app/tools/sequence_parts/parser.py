# Parses result JSON files for sequence part modules.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_sequence_parts_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ToolParseError("Sequence parts result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("Sequence parts result file is not valid JSON.", {"path": str(path)}) from exc

    required = {"record_id", "topology", "sequence_length", "parts"}
    missing = sorted(required - data.keys())
    if missing:
        raise ToolParseError("Sequence parts result is missing fields.", {"missing": missing})

    return data
