# Defines input validation for safe PyMOL-backed rendering operations.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_OPERATIONS = {"render_basic", "highlight_ligand_pocket", "color_chains"}
SUPPORTED_STYLES = {"cartoon", "sticks", "ball_stick", "surface", "pocket"}
SUPPORTED_BACKGROUNDS = {"white", "black", "transparent"}
SUPPORTED_SUFFIXES = {".pdb", ".pdbqt", ".cif", ".mmcif", ".mol2", ".sdf"}


@dataclass(frozen=True)
class PyMOLControlInput:
    structure_text: str
    structure_file_name: str = "structure.pdb"
    ligand_text: str | None = None
    ligand_file_name: str = "ligand.sdf"
    operation: str = "render_basic"
    style: str = "cartoon"
    background: str = "white"
    width: int = 1200
    height: int = 900
    pocket_distance: float = 5.0

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "PyMOLControlInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        structure_text = _required_text(payload.get("structure_text"), "structure_text")
        structure_file_name = _safe_file_name(payload.get("structure_file_name") or "structure.pdb", "structure_file_name")

        ligand_text = _optional_text(payload.get("ligand_text"))
        ligand_file_name = _safe_file_name(payload.get("ligand_file_name") or "ligand.sdf", "ligand_file_name")

        operation = str(payload.get("operation", "render_basic")).strip().lower()
        if operation not in SUPPORTED_OPERATIONS:
            raise ToolInputError(
                "Unsupported PyMOL operation.",
                {"operation": operation, "supported": sorted(SUPPORTED_OPERATIONS)},
            )
        if operation == "highlight_ligand_pocket" and ligand_text is None:
            raise ToolInputError("highlight_ligand_pocket requires ligand_text.")

        style = str(payload.get("style", "cartoon")).strip().lower()
        if style not in SUPPORTED_STYLES:
            raise ToolInputError("Unsupported PyMOL style.", {"style": style, "supported": sorted(SUPPORTED_STYLES)})

        background = str(payload.get("background", "white")).strip().lower()
        if background not in SUPPORTED_BACKGROUNDS:
            raise ToolInputError(
                "Unsupported PyMOL background.",
                {"background": background, "supported": sorted(SUPPORTED_BACKGROUNDS)},
            )

        return cls(
            structure_text=structure_text,
            structure_file_name=structure_file_name,
            ligand_text=ligand_text,
            ligand_file_name=ligand_file_name,
            operation=operation,
            style=style,
            background=background,
            width=_bounded_int(payload.get("width", 1200), 320, 4000, "width"),
            height=_bounded_int(payload.get("height", 900), 240, 4000, "height"),
            pocket_distance=_bounded_float(payload.get("pocket_distance", 5.0), 1.0, 12.0, "pocket_distance"),
        )


def _required_text(value: object, field_name: str) -> str:
    text = _optional_text(value)
    if text is None:
        raise ToolInputError(f"{field_name} is required.")
    return text


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("Structure content must be text.")
    text = value.strip()
    if not text:
        return None
    if len(text) > 20_000_000:
        raise ToolInputError("Structure content is too large for this demo backend.")
    return text


def _safe_file_name(value: object, field_name: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ToolInputError(f"{field_name} must be a file name.")
    file_name = value.strip().replace("\\", "/").rsplit("/", 1)[-1]
    suffix = "." + file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if suffix not in SUPPORTED_SUFFIXES:
        raise ToolInputError(
            f"{field_name} has an unsupported structure file extension.",
            {"file_name": file_name, "supported": sorted(SUPPORTED_SUFFIXES)},
        )
    return file_name


def _bounded_int(value: object, minimum: int, maximum: int, field_name: str) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be an integer.") from exc
    if number < minimum or number > maximum:
        raise ToolInputError(f"{field_name} must be between {minimum} and {maximum}.")
    return number


def _bounded_float(value: object, minimum: float, maximum: float, field_name: str) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be a number.") from exc
    if number < minimum or number > maximum:
        raise ToolInputError(f"{field_name} must be between {minimum} and {maximum}.")
    return number
