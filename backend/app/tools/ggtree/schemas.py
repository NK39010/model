# Defines input parsing for R/ggtree visualization jobs.
from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any

from app.tools.errors import ToolInputError


LAYOUTS = {"rectangular", "circular", "fan"}
SUPPORT_MODES = {"none", "text", "low", "dots"}
TREE_THEMES = {"clean", "axis", "publication"}


@dataclass(frozen=True)
class GgtreeInput:
    newick: str
    layout: str
    show_tip_labels: bool
    show_support: bool
    show_nodes: bool
    show_branch_length: bool
    align_tip_labels: bool
    tip_font_size: float
    tip_label_offset: float
    tip_label_angle: float
    branch_width: float
    branch_color: str
    tip_label_color: str
    support_mode: str
    support_font_size: float
    support_color: str
    background_color: str
    support_threshold: float
    tree_theme: str
    x_expand: float
    right_margin: float
    open_angle: float
    auto_size: bool
    dpi: int
    width: float
    height: float
    label_overrides: dict[str, Any]
    support_overrides: dict[str, Any]
    node_overrides: dict[str, Any]
    reroot_node_id: str
    midpoint_root: bool
    preview_only: bool
    tip_metadata: dict[str, Any]
    show_species_labels: bool
    species_font_size: float
    species_label_color: str
    species_label_offset: float

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
        support_mode = str(payload.get("support_mode", "text")).strip().lower()
        if support_mode not in SUPPORT_MODES:
            raise ToolInputError("Unsupported ggtree support mode.", {"support_mode": support_mode, "allowed": sorted(SUPPORT_MODES)})
        tree_theme = str(payload.get("tree_theme", "publication")).strip().lower()
        if tree_theme not in TREE_THEMES:
            raise ToolInputError("Unsupported ggtree theme.", {"tree_theme": tree_theme, "allowed": sorted(TREE_THEMES)})

        return cls(
            newick=newick,
            layout=layout,
            show_tip_labels=_as_bool(payload.get("show_tip_labels"), True),
            show_support=_as_bool(payload.get("show_support"), True),
            show_nodes=_as_bool(payload.get("show_nodes"), True),
            show_branch_length=_as_bool(payload.get("show_branch_length"), True),
            align_tip_labels=_as_bool(payload.get("align_tip_labels"), False),
            tip_font_size=_bounded_float(payload.get("tip_font_size"), 2.6, 0.8, 30.0, "tip_font_size"),
            tip_label_offset=_bounded_float(payload.get("tip_label_offset"), 0.015, 0.0, 5.0, "tip_label_offset"),
            tip_label_angle=_bounded_float(payload.get("tip_label_angle"), 0.0, -180.0, 180.0, "tip_label_angle"),
            branch_width=_bounded_float(payload.get("branch_width"), 0.45, 0.1, 4.0, "branch_width"),
            branch_color=_hex_color(payload.get("branch_color"), "#303633", "branch_color"),
            tip_label_color=_hex_color(payload.get("tip_label_color"), "#171b19", "tip_label_color"),
            support_mode=support_mode,
            support_font_size=_bounded_float(payload.get("support_font_size"), 2.0, 0.8, 24.0, "support_font_size"),
            support_color=_hex_color(payload.get("support_color"), "#6e4d3a", "support_color"),
            background_color=_hex_color(payload.get("background_color"), "#ffffff", "background_color"),
            support_threshold=_bounded_float(payload.get("support_threshold"), 70.0, 0.0, 100.0, "support_threshold"),
            tree_theme=tree_theme,
            x_expand=_bounded_float(payload.get("x_expand"), 0.14, 0.0, 1.0, "x_expand"),
            right_margin=_bounded_float(payload.get("right_margin"), 14.0, 0.0, 80.0, "right_margin"),
            open_angle=_bounded_float(payload.get("open_angle"), 10.0, 0.0, 330.0, "open_angle"),
            auto_size=_as_bool(payload.get("auto_size"), True),
            dpi=int(_bounded_float(payload.get("dpi"), 300.0, 72.0, 600.0, "dpi")),
            width=_bounded_float(payload.get("width"), 11.0, 4.0, 30.0, "width"),
            height=_bounded_float(payload.get("height"), 8.0, 4.0, 40.0, "height"),
            label_overrides=_as_dict(payload.get("label_overrides")),
            support_overrides=_as_dict(payload.get("support_overrides")),
            node_overrides=_as_dict(payload.get("node_overrides")),
            reroot_node_id=str(payload.get("reroot_node_id", "")).strip(),
            midpoint_root=_as_bool(payload.get("midpoint_root"), False),
            preview_only=_as_bool(payload.get("preview_only"), False),
            tip_metadata=_as_dict(payload.get("tip_metadata")),
            show_species_labels=_as_bool(payload.get("show_species_labels"), True),
            species_font_size=_bounded_float(payload.get("species_font_size"), 1.5, 0.8, 30.0, "species_font_size"),
            species_label_color=_hex_color(payload.get("species_label_color"), "#52675b", "species_label_color"),
            species_label_offset=_bounded_float(payload.get("species_label_offset"), 0.06, 0.0, 5.0, "species_label_offset"),
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


def _as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}
