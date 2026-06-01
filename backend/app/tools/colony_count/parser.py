# Parses colony counting result files.
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_colony_count_result(path: Path) -> dict[str, Any]:
    """Load the standard colony counting result JSON."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolParseError("Could not parse colony count result.", {"path": str(path)}) from exc
