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

        command = [
            str(rscript),
            str(script_path),
            str(input_path),
            str(output_prefix),
            data.layout,
            _r_bool(data.show_tip_labels),
            _r_bool(data.show_support),
            _r_bool(data.show_branch_length),
            str(data.tip_font_size),
            str(data.width),
            str(data.height),
            str(data.branch_width),
            data.branch_color,
            data.tip_label_color,
            data.support_color,
            data.background_color,
            str(data.support_threshold),
            str(data.dpi),
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
            "show_branch_length": data.show_branch_length,
            "tip_font_size": data.tip_font_size,
            "branch_width": data.branch_width,
            "branch_color": data.branch_color,
            "tip_label_color": data.tip_label_color,
            "support_color": data.support_color,
            "background_color": data.background_color,
            "support_threshold": data.support_threshold,
            "dpi": data.dpi,
            "width": data.width,
            "height": data.height,
            "tip_count": _count_tips(data.newick),
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
