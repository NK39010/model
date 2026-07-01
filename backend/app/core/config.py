# Defines shared runtime configuration for the backend application.
from __future__ import annotations

import sys
from pathlib import Path


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT_SEARCH_LIMIT = 20
def project_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[3]


def resource_path(relative_path: str) -> Path:
    """Return a bundled resource path when running from PyInstaller."""
    base_path = Path(getattr(sys, "_MEIPASS", project_root()))
    return base_path / relative_path


def writable_data_path(relative_path: str) -> Path:
    """Return a writable data path in dev and packaged app modes."""
    if getattr(sys, "frozen", False):
        base_path = Path.home() / "AppData" / "Local" / "BioToolBackend"
    else:
        base_path = project_root()
    return base_path / relative_path


RESULTS_ROOT = writable_data_path("data/results")
FRONTEND_DIST = resource_path("frontend/dist")
FRONTEND_DIST_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_INDEX = FRONTEND_DIST_INDEX if FRONTEND_DIST_INDEX.exists() else resource_path("frontend/index.html")
