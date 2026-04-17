# Defines input models for resistance marker selection.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_HOSTS = {"any", "ecoli", "saccharomyces_cerevisiae", "yarrowia_lipolytica", "cho", "mammalian"}
HOST_ALIASES = {
    "any organism": "any",
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
    "mammalian general": "mammalian",
}
SUPPORTED_MARKER_TYPES = {"antibiotic"}


@dataclass(frozen=True)
class ResistanceMarkerSelectionInput:
    host: str = "any"
    selection: str | None = None
    marker_type: str = "antibiotic"
    function: str | None = None
    max_results: int = 5
    email: str | None = None
    ncbi_max_records: int = 10

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "ResistanceMarkerSelectionInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        host = _normalize_host(payload.get("host", "any"))
        if host not in SUPPORTED_HOSTS:
            raise ToolInputError(
                "Unsupported marker host.",
                {"host": host, "supported": sorted(SUPPORTED_HOSTS)},
            )

        marker_type = str(payload.get("marker_type", "antibiotic")).strip().lower()
        if marker_type not in SUPPORTED_MARKER_TYPES:
            raise ToolInputError(
                "Resistance gene selection only supports antibiotic/drug resistance markers.",
                {"marker_type": marker_type, "supported": sorted(SUPPORTED_MARKER_TYPES)},
            )

        try:
            max_results = int(payload.get("max_results", 5))
        except (TypeError, ValueError) as exc:
            raise ToolInputError("max_results must be an integer.") from exc
        if not (1 <= max_results <= 20):
            raise ToolInputError("max_results must be between 1 and 20.", {"max_results": max_results})

        try:
            ncbi_max_records = int(payload.get("ncbi_max_records", 10))
        except (TypeError, ValueError) as exc:
            raise ToolInputError("ncbi_max_records must be an integer.") from exc
        if not (1 <= ncbi_max_records <= 50):
            raise ToolInputError("ncbi_max_records must be between 1 and 50.", {"ncbi_max_records": ncbi_max_records})

        return cls(
            host=host,
            selection=_optional_text(payload.get("selection")),
            marker_type=marker_type,
            function=_optional_text(payload.get("function")),
            max_results=max_results,
            email=_optional_text(payload.get("email")),
            ncbi_max_records=ncbi_max_records,
        )


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("Optional text fields must be strings.")
    stripped = value.strip().lower()
    return stripped or None


def _normalize_host(value: object) -> str:
    host = str(value).strip().lower().replace("-", " ").replace("_", " ")
    return HOST_ALIASES.get(host, host.replace(" ", "_"))
