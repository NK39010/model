# Defines input validation and image decoding for colony counting.
from __future__ import annotations

import base64
import binascii
from dataclasses import dataclass
from io import BytesIO
from typing import Any

from PIL import Image, UnidentifiedImageError

from app.tools.errors import ToolInputError


SUPPORTED_THRESHOLD_MODES = {"otsu", "adaptive"}


@dataclass(frozen=True)
class ColonyCountInput:
    image_bytes: bytes
    min_area: int = 20
    max_area: int = 5000
    circularity_threshold: float = 0.35
    threshold_mode: str = "otsu"
    invert: bool = False
    split_touching: bool = True
    split_sensitivity: float = 0.45
    edge_margin_ratio: float = 0.03
    color_mode: str = "auto"
    target_color: tuple[int, int, int] | None = None
    color_tolerance: float = 38.0
    sample_image_bytes: bytes | None = None

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ColonyCountInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        image_bytes = _decode_image_data_url(payload.get("image_data_url"))
        _validate_image_bytes(image_bytes)

        min_area = _bounded_int(payload.get("min_area", 20), 1, 1_000_000, "min_area")
        max_area = _bounded_int(payload.get("max_area", 5000), min_area, 10_000_000, "max_area")
        circularity_threshold = _bounded_float(
            payload.get("circularity_threshold", 0.35),
            0.0,
            1.0,
            "circularity_threshold",
        )
        threshold_mode = str(payload.get("threshold_mode", "otsu")).strip().lower()
        if threshold_mode not in SUPPORTED_THRESHOLD_MODES:
            raise ToolInputError(
                "Unsupported threshold mode.",
                {"threshold_mode": threshold_mode, "supported": sorted(SUPPORTED_THRESHOLD_MODES)},
            )
        color_mode = str(payload.get("color_mode", "auto")).strip().lower()
        if color_mode not in {"auto", "target", "sample"}:
            raise ToolInputError(
                "Unsupported color mode.",
                {"color_mode": color_mode, "supported": ["auto", "target", "sample"]},
            )
        target_color = _optional_rgb(payload.get("target_color"))
        sample_image_bytes = _optional_image_data_url(payload.get("sample_image_data_url"))
        if sample_image_bytes is not None:
            _validate_image_bytes(sample_image_bytes)
        if color_mode == "target" and target_color is None:
            raise ToolInputError("target color mode requires target_color.")
        if color_mode == "sample" and sample_image_bytes is None:
            raise ToolInputError("sample color mode requires sample_image_data_url.")

        return cls(
            image_bytes=image_bytes,
            min_area=min_area,
            max_area=max_area,
            circularity_threshold=circularity_threshold,
            threshold_mode=threshold_mode,
            invert=bool(payload.get("invert", False)),
            split_touching=bool(payload.get("split_touching", True)),
            split_sensitivity=_bounded_float(payload.get("split_sensitivity", 0.45), 0.05, 0.95, "split_sensitivity"),
            edge_margin_ratio=_bounded_float(payload.get("edge_margin_ratio", 0.03), 0.0, 0.25, "edge_margin_ratio"),
            color_mode=color_mode,
            target_color=target_color,
            color_tolerance=_bounded_float(payload.get("color_tolerance", 38.0), 1.0, 120.0, "color_tolerance"),
            sample_image_bytes=sample_image_bytes,
        )

    def parameters(self) -> dict[str, Any]:
        return {
            "min_area": self.min_area,
            "max_area": self.max_area,
            "circularity_threshold": self.circularity_threshold,
            "threshold_mode": self.threshold_mode,
            "invert": self.invert,
            "split_touching": self.split_touching,
            "split_sensitivity": self.split_sensitivity,
            "edge_margin_ratio": self.edge_margin_ratio,
            "color_mode": self.color_mode,
            "target_color": self.target_color,
            "color_tolerance": self.color_tolerance,
        }


def _decode_image_data_url(value: object) -> bytes:
    if not isinstance(value, str) or not value.strip():
        raise ToolInputError("Colony counting requires image_data_url.")

    text = value.strip()
    if not text.startswith("data:image/"):
        raise ToolInputError("image_data_url must be a data:image/* base64 URL.")
    try:
        header, encoded = text.split(",", 1)
    except ValueError as exc:
        raise ToolInputError("image_data_url is missing the base64 separator.") from exc
    if ";base64" not in header:
        raise ToolInputError("image_data_url must be base64 encoded.")

    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ToolInputError("image_data_url contains invalid base64.") from exc


def _optional_image_data_url(value: object) -> bytes | None:
    if value in (None, ""):
        return None
    return _decode_image_data_url(value)


def _optional_rgb(value: object) -> tuple[int, int, int] | None:
    if value in (None, ""):
        return None
    if isinstance(value, str):
        text = value.strip()
        if text.startswith("#") and len(text) == 7:
            try:
                return (int(text[1:3], 16), int(text[3:5], 16), int(text[5:7], 16))
            except ValueError as exc:
                raise ToolInputError("target_color must be a valid #RRGGBB color.") from exc
    if isinstance(value, list) and len(value) == 3:
        try:
            rgb = tuple(int(channel) for channel in value)
        except (TypeError, ValueError) as exc:
            raise ToolInputError("target_color channels must be integers.") from exc
        if all(0 <= channel <= 255 for channel in rgb):
            return rgb
    raise ToolInputError("target_color must be #RRGGBB or [r, g, b].")


def _validate_image_bytes(image_bytes: bytes) -> None:
    try:
        with Image.open(BytesIO(image_bytes)) as image:
            image.verify()
    except (UnidentifiedImageError, OSError) as exc:
        raise ToolInputError("image_data_url does not contain a readable image.") from exc


def _bounded_int(value: object, min_value: int, max_value: int, field_name: str) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be an integer.") from exc
    if not (min_value <= parsed <= max_value):
        raise ToolInputError(
            f"{field_name} must be between {min_value} and {max_value}.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed


def _bounded_float(value: object, min_value: float, max_value: float, field_name: str) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError) as exc:
        raise ToolInputError(f"{field_name} must be a number.") from exc
    if not (min_value <= parsed <= max_value):
        raise ToolInputError(
            f"{field_name} must be between {min_value} and {max_value}.",
            {field_name: parsed, "min": min_value, "max": max_value},
        )
    return parsed
