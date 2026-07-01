# Resolves the Rscript executable used by the ggtree module.
from __future__ import annotations

import os
import shutil
from pathlib import Path

from app.tools.errors import ToolExecutionError


def resolve_rscript_binary() -> Path:
    configured = os.environ.get("RSCRIPT_BINARY", "").strip()
    if configured:
        path = Path(configured).expanduser()
        if path.exists() and os.access(path, os.X_OK):
            return path
        raise ToolExecutionError(
            "Configured Rscript executable was not found or is not executable.",
            {"RSCRIPT_BINARY": configured},
        )

    found = shutil.which("Rscript")
    if found:
        return Path(found)

    raise ToolExecutionError(
        "Rscript was not found. Install R or set RSCRIPT_BINARY.",
        {"searched": ["RSCRIPT_BINARY", "Rscript"]},
    )
