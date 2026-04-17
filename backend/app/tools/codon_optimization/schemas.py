# Defines input models for host-specific codon optimization.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_HOSTS = {
    "ecoli",
    "saccharomyces_cerevisiae",
    "yarrowia_lipolytica",
    "cho",
}
HOST_ALIASES = {
    "e coli": "ecoli",
    "e. coli": "ecoli",
    "escherichia coli": "ecoli",
    "s cerevisiae": "saccharomyces_cerevisiae",
    "s. cerevisiae": "saccharomyces_cerevisiae",
    "saccharomyces cerevisiae": "saccharomyces_cerevisiae",
    "y lipolytica": "yarrowia_lipolytica",
    "y. lipolytica": "yarrowia_lipolytica",
    "yarrowia lipolytica": "yarrowia_lipolytica",
    "cricetulus griseus": "cho",
    "chinese hamster ovary": "cho",
    "mammalian general": "cho",
}
SUPPORTED_INPUT_TYPES = {"cds", "protein"}


@dataclass(frozen=True)
class CodonOptimizationInput:
    input_type: str
    sequence: str
    host: str
    min_gc: float = 0.4
    max_gc: float = 0.6
    avoid_sites: list[str] | None = None
    keep_start_codon: bool = True

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "CodonOptimizationInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        input_type = str(payload.get("input_type", "cds")).strip().lower()
        if input_type not in SUPPORTED_INPUT_TYPES:
            raise ToolInputError(
                "Unsupported codon optimization input type.",
                {"input_type": input_type, "supported": sorted(SUPPORTED_INPUT_TYPES)},
            )

        host = _normalize_host(payload.get("host", "ecoli"))
        if host not in SUPPORTED_HOSTS:
            raise ToolInputError(
                "Unsupported codon optimization host.",
                {"host": host, "supported": sorted(SUPPORTED_HOSTS)},
            )

        sequence = _sequence_from_payload(payload, input_type)
        min_gc = _bounded_float(payload.get("min_gc", 0.4), 0.2, 0.8, "min_gc")
        max_gc = _bounded_float(payload.get("max_gc", 0.6), min_gc, 0.8, "max_gc")
        avoid_sites = _avoid_sites(payload.get("avoid_sites", []))

        return cls(
            input_type=input_type,
            sequence=sequence,
            host=host,
            min_gc=min_gc,
            max_gc=max_gc,
            avoid_sites=avoid_sites,
            keep_start_codon=bool(payload.get("keep_start_codon", True)),
        )


def _sequence_from_payload(payload: dict[str, Any], input_type: str) -> str:
    if "sequence" in payload:
        return _normalize_sequence(payload["sequence"], input_type, "sequence")
    if "fasta" in payload:
        records = parse_fasta(payload["fasta"])
        if len(records) != 1:
            raise ToolInputError("FASTA input must contain exactly one record.")
        return _normalize_sequence(records[0]["sequence"], input_type, "fasta")
    raise ToolInputError("Codon optimization requires sequence or fasta.")


def _normalize_host(value: object) -> str:
    host = str(value).strip().lower().replace("-", " ").replace("_", " ")
    return HOST_ALIASES.get(host, host.replace(" ", "_"))


def parse_fasta(value: object) -> list[dict[str, str]]:
    if not isinstance(value, str):
        raise ToolInputError("FASTA input must be a string.")

    records: list[dict[str, str]] = []
    current_id: str | None = None
    current_lines: list[str] = []

    for raw_line in value.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith(">"):
            if current_id is not None:
                records.append({"id": current_id, "sequence": "".join(current_lines)})
            current_id = line[1:].strip().split()[0] or "sequence"
            current_lines = []
        else:
            current_lines.append(line)

    if current_id is not None:
        records.append({"id": current_id, "sequence": "".join(current_lines)})

    if not records:
        raise ToolInputError("FASTA input did not contain any records.")
    return records


def _normalize_sequence(value: object, input_type: str, field_name: str) -> str:
    if not isinstance(value, str):
        raise ToolInputError(f"{field_name} must be a string.")
    sequence = "".join(value.split()).upper()
    if not sequence:
        raise ToolInputError(f"{field_name} must not be empty.")

    if input_type == "cds":
        invalid = sorted({base for base in sequence if base not in "ACGT"})
        if invalid:
            raise ToolInputError(
                "CDS sequence must contain DNA bases only.",
                {"invalid_bases": invalid, "allowed": ["A", "C", "G", "T"]},
            )
        if len(sequence) % 3 != 0:
            raise ToolInputError("CDS sequence length must be divisible by 3.")
        return sequence

    invalid = sorted({aa for aa in sequence if aa not in "ACDEFGHIKLMNPQRSTVWY"})
    if invalid:
        raise ToolInputError(
            "Protein sequence contains unsupported amino acid symbols.",
            {"invalid_symbols": invalid},
        )
    return sequence


def _avoid_sites(value: object) -> list[str]:
    if value is None:
        return []
    if isinstance(value, str):
        items = [item.strip() for item in value.split(",")]
    elif isinstance(value, list):
        items = [str(item).strip() for item in value]
    else:
        raise ToolInputError("avoid_sites must be a list or comma-separated string.")
    sites = ["".join(item.split()).upper() for item in items if item]
    invalid = sorted({base for site in sites for base in site if base not in "ACGT"})
    if invalid:
        raise ToolInputError("Restriction sites must contain DNA bases only.", {"invalid_bases": invalid})
    return sites


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
