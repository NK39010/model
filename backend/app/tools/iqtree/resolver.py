# Resolves an IQ-TREE executable.
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from app.tools.errors import ToolExecutionError


@dataclass(frozen=True)
class IqtreeBinary:
    path: Path
    source: str


def resolve_iqtree_binary() -> IqtreeBinary:
    env_value = os.environ.get("IQTREE_BINARY")
    if env_value:
        path = Path(env_value).expanduser()
        if path.exists() and os.access(path, os.X_OK):
            return IqtreeBinary(path=path, source="IQTREE_BINARY")
        raise ToolExecutionError(
            "IQ-TREE executable was not found or is not executable.",
            {"IQTREE_BINARY": str(path)},
        )

    for candidate in ("iqtree3", "iqtree2", "iqtree"):
        resolved = shutil.which(candidate)
        if resolved:
            return IqtreeBinary(path=Path(resolved), source="PATH")

    raise ToolExecutionError(
        "IQ-TREE executable was not found. Install iqtree3/iqtree2 or set IQTREE_BINARY.",
        {"searched": ["IQTREE_BINARY", "iqtree3", "iqtree2", "iqtree"]},
    )
