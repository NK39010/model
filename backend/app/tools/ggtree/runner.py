# Runs R/ggtree phylogenetic tree visualization jobs.
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.services.process_service import run_process
from app.tools.base import ToolRunner
from app.tools.errors import ToolExecutionError
from app.tools.ggtree.parser import parse_ggtree_result
from app.tools.ggtree.resolver import resolve_rscript_binary
from app.tools.ggtree.schemas import GgtreeInput


class GgtreeVisualizationRunner(ToolRunner):
    """Render a Newick tree through R and ggtree."""

    name = "ggtree_visualization"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        GgtreeInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = GgtreeInput.from_payload(payload)
        rscript = resolve_rscript_binary()
        input_path = workdir / "input.treefile"
        output_prefix = workdir / "ggtree_tree"
        script_path = Path(__file__).with_name("plot_tree.R")
        write_text(input_path, data.newick + "\n")
        tip_count = _count_tips(data.newick)
        effective = _effective_plot_settings(data.width, data.height, data.tip_font_size, data.support_mode, tip_count, data.auto_size)
        style_path = workdir / "ggtree_style.json"
        style_spec = {
            "style_spec_version": 1,
            "units": {
                "text_size": "ggplot2_mm",
                "line_width": "ggplot2_mm",
                "plot_size": "inch",
                "tip_offset": "tree_coordinate",
            },
            "width": effective["width"],
            "height": effective["height"],
            "dpi": data.dpi,
            "layout": data.layout,
            "show_tip_labels": data.show_tip_labels,
            "show_support": data.show_support,
            "show_nodes": data.show_nodes,
            "show_branch_length": data.show_branch_length,
            "align_tip_labels": data.align_tip_labels,
            "tip_font_size": effective["tip_font_size"],
            "tip_label_offset": data.tip_label_offset,
            "tip_label_angle": data.tip_label_angle,
            "branch_width": data.branch_width,
            "branch_color": data.branch_color,
            "tip_label_color": data.tip_label_color,
            "support_mode": effective["support_mode"],
            "support_font_size": data.support_font_size,
            "support_color": data.support_color,
            "background_color": data.background_color,
            "support_threshold": data.support_threshold,
            "tree_theme": data.tree_theme,
            "x_expand": data.x_expand,
            "right_margin": data.right_margin,
            "open_angle": data.open_angle,
            "label_overrides": data.label_overrides,
            "support_overrides": data.support_overrides,
            "node_overrides": data.node_overrides,
        }
        write_json(style_path, style_spec)

        command = [
            str(rscript),
            str(script_path),
            str(input_path),
            str(output_prefix),
            data.layout,
            _r_bool(data.show_tip_labels),
            _r_bool(data.show_support),
            _r_bool(data.show_branch_length),
            str(effective["tip_font_size"]),
            str(effective["width"]),
            str(effective["height"]),
            str(data.branch_width),
            data.branch_color,
            data.tip_label_color,
            data.support_color,
            data.background_color,
            str(data.support_threshold),
            str(data.dpi),
            _r_bool(data.align_tip_labels),
            str(data.tip_label_offset),
            str(data.tip_label_angle),
            str(effective["support_mode"]),
            str(data.support_font_size),
            data.tree_theme,
            str(data.x_expand),
            str(data.right_margin),
            str(data.open_angle),
            str(style_path),
        ]
        try:
            completed = run_process(
                command,
                cwd=workdir,
                text=True,
                capture_output=True,
                timeout=300,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolExecutionError("R/ggtree execution failed.", {"reason": str(exc)}) from exc

        write_text(workdir / "ggtree.stdout.txt", completed.stdout or "")
        write_text(workdir / "ggtree.stderr.txt", completed.stderr or "")
        if completed.returncode != 0:
            raise ToolExecutionError(
                "R/ggtree returned a non-zero exit code.",
                {
                    "returncode": completed.returncode,
                    "stderr": (completed.stderr or "")[-2000:],
                    "hint": "Install R packages ape, ggplot2, ggtree, and optionally svglite.",
                },
            )

        png_path = workdir / "ggtree_tree.png"
        if not png_path.exists():
            raise ToolExecutionError("R/ggtree did not produce ggtree_tree.png.")

        files = {
            "json": "result.json",
            "input_tree": "input.treefile",
            "style": "ggtree_style.json",
            "png": "ggtree_tree.png",
            "stdout": "ggtree.stdout.txt",
            "stderr": "ggtree.stderr.txt",
        }
        for label, file_name in {"pdf": "ggtree_tree.pdf", "svg": "ggtree_tree.svg"}.items():
            if (workdir / file_name).exists():
                files[label] = file_name

        result = {
            "tool": self.name,
            "layout": data.layout,
            "show_tip_labels": data.show_tip_labels,
            "show_support": data.show_support,
            "show_nodes": data.show_nodes,
            "show_branch_length": data.show_branch_length,
            "align_tip_labels": data.align_tip_labels,
            "tip_font_size": data.tip_font_size,
            "tip_label_offset": data.tip_label_offset,
            "tip_label_angle": data.tip_label_angle,
            "branch_width": data.branch_width,
            "branch_color": data.branch_color,
            "tip_label_color": data.tip_label_color,
            "support_mode": data.support_mode,
            "effective_support_mode": effective["support_mode"],
            "support_font_size": data.support_font_size,
            "support_color": data.support_color,
            "background_color": data.background_color,
            "support_threshold": data.support_threshold,
            "tree_theme": data.tree_theme,
            "x_expand": data.x_expand,
            "right_margin": data.right_margin,
            "open_angle": data.open_angle,
            "auto_size": data.auto_size,
            "dpi": data.dpi,
            "width": data.width,
            "height": data.height,
            "effective_width": effective["width"],
            "effective_height": effective["height"],
            "effective_tip_font_size": effective["tip_font_size"],
            "label_overrides": data.label_overrides,
            "support_overrides": data.support_overrides,
            "node_overrides": data.node_overrides,
            "tip_count": tip_count,
            "command": command,
            "rscript_binary": str(rscript),
            "files": files,
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_ggtree_result(workdir / "result.json")


def _r_bool(value: bool) -> str:
    return "true" if value else "false"


def _count_tips(newick: str) -> int:
    body = newick.rstrip(";").strip()
    if not body:
        return 0
    return body.count(",") + 1


def _effective_plot_settings(width: float, height: float, tip_font_size: float, support_mode: str, tip_count: int, auto_size: bool) -> dict[str, float | str]:
    if not auto_size:
        return {"width": width, "height": height, "tip_font_size": tip_font_size, "support_mode": support_mode}

    if tip_count <= 30:
        return {
            "width": max(width, 9.0),
            "height": max(height, 6.0),
            "tip_font_size": tip_font_size,
            "support_mode": support_mode,
        }
    if tip_count <= 120:
        return {
            "width": max(width, 11.0),
            "height": max(height, min(18.0, 4.0 + tip_count * 0.08)),
            "tip_font_size": tip_font_size,
            "support_mode": support_mode,
        }
    return {
        "width": max(width, 13.0),
        "height": max(height, min(36.0, 5.0 + tip_count * 0.055)),
        "tip_font_size": tip_font_size,
        "support_mode": support_mode,
    }
