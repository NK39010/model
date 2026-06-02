# Runs safe, preset PyMOL operations from backend jobs.
from __future__ import annotations

import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolDependencyError, ToolExecutionError
from app.tools.pymol_control.parser import parse_pymol_control_result
from app.tools.pymol_control.schemas import PyMOLControlInput


class PyMOLControlRunner(ToolRunner):
    """Render and analyze structures through a restricted PyMOL command surface."""

    name = "pymol_control"
    version = "0.1.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        PyMOLControlInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = PyMOLControlInput.from_payload(payload)
        pymol_bin = _pymol_binary()
        if pymol_bin is None:
            raise ToolDependencyError(
                "PyMOL is not configured. Install PyMOL or set PYMOL_BIN to the PyMOL executable.",
                {"expected_binary": "pymol", "env_var": "PYMOL_BIN"},
            )

        structure_path = workdir / data.structure_file_name
        write_text(structure_path, data.structure_text + "\n")
        ligand_path = None
        if data.ligand_text is not None:
            ligand_path = workdir / data.ligand_file_name
            write_text(ligand_path, data.ligand_text + "\n")

        script_path = workdir / "pymol_script.pml"
        image_path = workdir / "pymol_render.png"
        log_path = workdir / "pymol.log"
        write_text(script_path, _build_script(data, structure_path, ligand_path, image_path))

        process = subprocess.run(
            [pymol_bin, "-cq", str(script_path)],
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=90,
            check=False,
        )
        write_text(log_path, (process.stdout or "") + "\n" + (process.stderr or ""))

        if process.returncode != 0:
            raise ToolExecutionError(
                "PyMOL failed while running the generated script.",
                {"returncode": process.returncode, "log_file": "pymol.log"},
            )
        if not image_path.exists():
            raise ToolExecutionError("PyMOL did not create the expected PNG render.", {"image_file": image_path.name})

        result = {
            "operation": data.operation,
            "style": data.style,
            "background": data.background,
            "width": data.width,
            "height": data.height,
            "pymol_binary": pymol_bin,
            "files": {
                "image": image_path.name,
                "script": script_path.name,
                "log": log_path.name,
                "json": "result.json",
            },
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_pymol_control_result(workdir / "result.json")


def _pymol_binary() -> str | None:
    configured = os.environ.get("PYMOL_BIN")
    if configured:
        return configured
    return shutil.which("pymol")


def _build_script(data: PyMOLControlInput, structure_path: Path, ligand_path: Path | None, image_path: Path) -> str:
    lines = [
        "reinitialize",
        "set suspend_updates, on",
        "set ray_opaque_background, off" if data.background == "transparent" else "set ray_opaque_background, on",
        f"bg_color {_background_color(data.background)}",
        f"load {_pml_path(structure_path)}, receptor",
    ]
    if ligand_path is not None:
        lines.append(f"load {_pml_path(ligand_path)}, ligand")

    lines.extend(_style_commands(data))
    lines.extend(_operation_commands(data, ligand_path is not None))
    lines.extend(
        [
            "set antialias, 2",
            "set ambient, 0.35",
            "set specular, 0.25",
            "set ray_trace_mode, 1",
            "zoom all, 2",
            "orient all",
            "set suspend_updates, off",
            f"png {_pml_path(image_path)}, width={data.width}, height={data.height}, dpi=150, ray=1",
            "quit",
        ]
    )
    return "\n".join(lines) + "\n"


def _style_commands(data: PyMOLControlInput) -> list[str]:
    base = ["hide everything, all"]
    if data.style == "sticks":
        return base + ["show sticks, all", "util.cbag all"]
    if data.style == "ball_stick":
        return base + ["show sticks, all", "show spheres, all", "set sphere_scale, 0.25", "util.cbag all"]
    if data.style == "surface":
        return base + ["show cartoon, receptor", "show surface, receptor", "set transparency, 0.45, receptor", "show sticks, ligand"]
    if data.style == "pocket":
        return base + ["show cartoon, receptor", "show sticks, ligand", "color slate, receptor", "color tv_green, ligand"]
    return base + ["show cartoon, receptor", "show sticks, ligand", "color slate, receptor", "color tv_green, ligand"]


def _operation_commands(data: PyMOLControlInput, has_ligand: bool) -> list[str]:
    if data.operation == "color_chains":
        return ["util.chainbow receptor", "color tv_green, ligand"] if has_ligand else ["util.chainbow receptor"]
    if data.operation == "highlight_ligand_pocket" and has_ligand:
        return [
            f"select ligand_pocket, byres (receptor within {data.pocket_distance:.2f} of ligand)",
            "show sticks, ligand_pocket",
            "color orange, ligand_pocket",
            "color tv_green, ligand",
            "show spheres, ligand",
            "set sphere_scale, 0.22, ligand",
        ]
    return []


def _background_color(background: str) -> str:
    if background == "black":
        return "black"
    return "white"


def _pml_path(path: Path) -> str:
    return str(path).replace("\\", "/")
