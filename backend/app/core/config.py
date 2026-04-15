# Defines shared runtime configuration for the backend application.
from __future__ import annotations

from pathlib import Path


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8000
PORT_SEARCH_LIMIT = 20
RESULTS_ROOT = Path("data/results")
FRONTEND_INDEX = Path("frontend/index.html")
