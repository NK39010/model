# Implements GenBank-to-parts parsing with automatic linker detection.
from __future__ import annotations

from io import StringIO
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.tools.base import ToolRunner
from app.tools.errors import ToolDependencyError, ToolExecutionError
from app.tools.sequence_parts.parser import parse_sequence_parts_result
from app.tools.sequence_parts.schemas import SequencePartsParseInput


class SequencePartsParseRunner(ToolRunner):
    """Parse a GenBank record into ordered parts and inferred linkers."""

    name = "sequence_parts_parse"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        SequencePartsParseInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = SequencePartsParseInput.from_payload(payload)
        seqio = _get_seqio()

        try:
            record = seqio.read(StringIO(data.file_text), data.file_format)
        except Exception as exc:
            raise ToolExecutionError(
                "Failed to parse GenBank text.",
                {"format": data.file_format, "reason": str(exc)},
            ) from exc

        sequence = str(record.seq)
        topology = _topology(record)
        feature_parts = _feature_parts(record, sequence)
        parts = _with_linkers(feature_parts, sequence, topology, data.min_linker_length)

        result = {
            "record_id": record.id,
            "name": record.name,
            "description": record.description,
            "topology": topology,
            "sequence_length": len(sequence),
            "part_count": len(parts),
            "parts": parts,
            "files": {
                "json": "result.json",
                "parts": "parts.json",
                "source": "source.gb",
            },
        }

        write_text(workdir / "source.gb", data.file_text)
        write_json(workdir / "parts.json", {"parts": parts})
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_sequence_parts_result(workdir / "result.json")


def _get_seqio():
    try:
        from Bio import SeqIO
    except ModuleNotFoundError as exc:
        raise ToolDependencyError(
            "Biopython is required for GenBank parsing.",
            {"install": "uv sync or pip install biopython"},
        ) from exc
    return SeqIO


def _topology(record: Any) -> str:
    topology = str(record.annotations.get("topology", "linear")).lower()
    return "circular" if topology == "circular" else "linear"


def _feature_parts(record: Any, sequence: str) -> list[dict[str, Any]]:
    parts: list[dict[str, Any]] = []
    occupied: list[tuple[int, int]] = []

    for feature in record.features:
        if feature.type == "source":
            continue

        start, end, is_complex = _feature_bounds(feature)
        if start >= end:
            continue
        if _overlaps_existing(start, end, occupied):
            continue

        occupied.append((start, end))
        part_index = len(parts) + 1
        parts.append(
            {
                "id": f"part_{part_index:04d}",
                "kind": "feature",
                "type": _normalize_part_type(feature),
                "label": _feature_label(feature, feature.type, part_index),
                "start": start,
                "end": end,
                "length": end - start,
                "strand": feature.location.strand,
                "sequence": sequence[start:end],
                "source_feature_type": feature.type,
                "qualifiers": {
                    key: [str(item) for item in value]
                    for key, value in feature.qualifiers.items()
                },
                "is_complex": is_complex,
            }
        )

    return sorted(parts, key=lambda part: (part["start"], part["end"]))


def _feature_bounds(feature: Any) -> tuple[int, int, bool]:
    location = feature.location
    start = int(location.start)
    end = int(location.end)
    is_complex = location.__class__.__name__ != "SimpleLocation"
    return start, end, is_complex


def _overlaps_existing(start: int, end: int, occupied: list[tuple[int, int]]) -> bool:
    return any(start < used_end and end > used_start for used_start, used_end in occupied)


def _feature_label(feature: Any, fallback: str, index: int) -> str:
    qualifiers = feature.qualifiers
    for key in ["label", "gene", "product", "note", "locus_tag"]:
        values = qualifiers.get(key)
        if values:
            return str(values[0])
    return f"{fallback}_{index}"


def _normalize_part_type(feature: Any) -> str:
    feature_type = feature.type.lower()
    text = " ".join(
        str(item).lower()
        for key in ["label", "gene", "product", "note"]
        for item in feature.qualifiers.get(key, [])
    )

    if feature_type in {"promoter", "terminator", "rep_origin", "cds", "gene"}:
        if feature_type == "rep_origin":
            return "origin"
        return "cds" if feature_type == "gene" else feature_type
    if "promoter" in text:
        return "promoter"
    if "terminator" in text:
        return "terminator"
    if "origin" in text or "ori" in text:
        return "origin"
    if "resistance" in text or "ampr" in text or "kanr" in text:
        return "resistance"
    if "orf" in text:
        return "orf"
    return "feature"


def _with_linkers(
    feature_parts: list[dict[str, Any]],
    sequence: str,
    topology: str,
    min_linker_length: int,
) -> list[dict[str, Any]]:
    if not feature_parts:
        return [
            _linker_part(
                part_id="part_0001",
                start=0,
                end=len(sequence),
                sequence=sequence,
                label="Unannotated sequence",
            )
        ]

    parts: list[dict[str, Any]] = []
    cursor = 0
    next_index = 1

    for feature_part in feature_parts:
        if feature_part["start"] - cursor >= min_linker_length:
            parts.append(
                _linker_part(
                    part_id=f"part_{next_index:04d}",
                    start=cursor,
                    end=feature_part["start"],
                    sequence=sequence[cursor:feature_part["start"]],
                )
            )
            next_index += 1

        feature_part = dict(feature_part)
        feature_part["id"] = f"part_{next_index:04d}"
        parts.append(feature_part)
        next_index += 1
        cursor = max(cursor, int(feature_part["end"]))

    if len(sequence) - cursor >= min_linker_length:
        parts.append(
            _linker_part(
                part_id=f"part_{next_index:04d}",
                start=cursor,
                end=len(sequence),
                sequence=sequence[cursor:],
            )
        )
    elif topology == "circular" and parts:
        parts[0]["circular_start"] = True
        parts[-1]["circular_end"] = True

    return parts


def _linker_part(
    part_id: str,
    start: int,
    end: int,
    sequence: str,
    label: str | None = None,
) -> dict[str, Any]:
    return {
        "id": part_id,
        "kind": "linker",
        "type": "linker",
        "label": label or f"Linker {start + 1}-{end}",
        "start": start,
        "end": end,
        "length": end - start,
        "strand": 1,
        "sequence": sequence,
        "source_feature_type": None,
        "qualifiers": {},
        "is_complex": False,
    }
