# Loads frontend page assets served by the backend root route.
from __future__ import annotations

from app.core.config import FRONTEND_INDEX


def load_index_html() -> str:
    return FRONTEND_INDEX.read_text(encoding="utf-8")
