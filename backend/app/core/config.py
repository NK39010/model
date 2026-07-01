# Defines shared runtime configuration for the backend application.
from __future__ import annotations

import os
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


def load_runtime_env(env_file: Path | None = None) -> None:
    """Load simple KEY=VALUE lines from the project-local .env file."""
    path = env_file or project_root() / ".env"
    if not path.exists():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue
        os.environ[key] = _clean_env_value(value)


def _clean_env_value(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) >= 2 and cleaned[0] == cleaned[-1] and cleaned[0] in {"'", '"'}:
        return cleaned[1:-1]
    return cleaned


RESULTS_ROOT = writable_data_path("data/results")
FRONTEND_DIST = resource_path("frontend/dist")
FRONTEND_DIST_INDEX = FRONTEND_DIST / "index.html"
FRONTEND_INDEX = FRONTEND_DIST_INDEX if FRONTEND_DIST_INDEX.exists() else resource_path("frontend/index.html")
