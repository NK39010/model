# Parses primer design result files into standard result dictionaries.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_primer_design_result(path: Path) -> dict[str, Any]:
    if not path.exists():
        raise ToolParseError("Primer design result file was not created.", {"path": str(path)})

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ToolParseError("Primer design result file is not valid JSON.", {"path": str(path)}) from exc

    required_fields = {"mode", "primers", "parameters"}
    missing = sorted(required_fields - data.keys())
    if missing:
        raise ToolParseError("Primer design result is missing fields.", {"missing": missing})

    return data
