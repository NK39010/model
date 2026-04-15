# Defines input data models for sequence part parsing.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_FORMATS = {"genbank"}


@dataclass(frozen=True)
class SequencePartsParseInput:
    file_text: str
    file_format: str = "genbank"
    min_linker_length: int = 1

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "SequencePartsParseInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        file_text = payload.get("file_text")
        if not isinstance(file_text, str) or not file_text.strip():
            raise ToolInputError("file_text must be a non-empty GenBank string.")

        file_format = str(payload.get("format", payload.get("file_format", "genbank"))).lower()
        if file_format in {"gb", "gbk"}:
            file_format = "genbank"
        if file_format not in SUPPORTED_FORMATS:
            raise ToolInputError(
                "Unsupported sequence file format.",
                {"format": file_format, "supported": sorted(SUPPORTED_FORMATS)},
            )

        min_linker_length = int(payload.get("min_linker_length", 1))
        if min_linker_length < 1:
            raise ToolInputError("min_linker_length must be at least 1.")

        return cls(
            file_text=file_text,
            file_format=file_format,
            min_linker_length=min_linker_length,
        )
