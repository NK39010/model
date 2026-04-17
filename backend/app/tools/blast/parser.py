# Parses BLAST result JSON files produced by the NCBI BLAST runner.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_blast_json_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ToolParseError("BLAST result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("BLAST result file is not valid JSON.", {"path": str(path)}) from exc

    required_fields = {"query", "program", "database", "hit_count", "hits"}
    missing = sorted(required_fields - data.keys())
    if missing:
        raise ToolParseError("BLAST result is missing fields.", {"missing": missing})

    return data
