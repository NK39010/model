# Defines input parsing for R/ggtree visualization jobs.
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from app.tools.errors import ToolInputError


LAYOUTS = {"rectangular", "circular", "fan"}


@dataclass(frozen=True)
class GgtreeInput:
    newick: str
    layout: str
    show_tip_labels: bool
    show_support: bool
    show_branch_length: bool
    tip_font_size: float
    branch_width: float
    branch_color: str
    tip_label_color: str
    support_color: str
    background_color: str
    support_threshold: float
    dpi: int
    width: float
    height: float

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "GgtreeInput":
        newick = str(payload.get("newick", "")).strip()
        if not newick:
            raise ToolInputError("ggtree requires a Newick tree.")
        if "(" not in newick or ")" not in newick:
            raise ToolInputError("The ggtree input does not look like a Newick tree.")
        if not newick.endswith(";"):
            newick += ";"

        layout = str(payload.get("layout", "rectangular")).strip().lower()
        if layout not in LAYOUTS:
            raise ToolInputError("Unsupported ggtree layout.", {"layout": layout, "allowed": sorted(LAYOUTS)})

        return cls(
            newick=newick,
            layout=layout,
            show_tip_labels=_as_bool(payload.get("show_tip_labels"), True),
            show_support=_as_bool(payload.get("show_support"), True),
            show_branch_length=_as_bool(payload.get("show_branch_length"), True),
            tip_font_size=_bounded_float(payload.get("tip_font_size"), 3.0, 1.0, 12.0, "tip_font_size"),
            branch_width=_bounded_float(payload.get("branch_width"), 0.7, 0.1, 4.0, "branch_width"),
            branch_color=_hex_color(payload.get("branch_color"), "#52675b", "branch_color"),
            tip_label_color=_hex_color(payload.get("tip_label_color"), "#17211c", "tip_label_color"),
            support_color=_hex_color(payload.get("support_color"), "#9a5a35", "support_color"),
            background_color=_hex_color(payload.get("background_color"), "#ffffff", "background_color"),
            support_threshold=_bounded_float(payload.get("support_threshold"), 0.0, 0.0, 100.0, "support_threshold"),
            dpi=int(_bounded_float(payload.get("dpi"), 300.0, 72.0, 600.0, "dpi")),
            width=_bounded_float(payload.get("width"), 11.0, 4.0, 30.0, "width"),
            height=_bounded_float(payload.get("height"), 8.0, 4.0, 40.0, "height"),
        )


def _as_bool(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _bounded_float(value: Any, default: float, minimum: float, maximum: float, field: str) -> float:
    if value in (None, ""):
        return default
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field} must be numeric.") from exc
    if number < minimum or number > maximum:
        raise ToolInputError(f"{field} is outside the allowed range.", {"min": minimum, "max": maximum})
    return number


def _hex_color(value: Any, default: str, field: str) -> str:
    color = str(value or default).strip().lower()
    if re.fullmatch(r"#[0-9a-f]{6}", color) is None:
        raise ToolInputError(f"{field} must be a six-digit hex color.")
    return color
