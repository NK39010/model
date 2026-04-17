# Defines input models for promoter selection.
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.tools.errors import ToolInputError


SUPPORTED_HOSTS = {"ecoli", "saccharomyces_cerevisiae", "yarrowia_lipolytica", "cho", "mammalian"}
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
    "mammalian general": "mammalian",
    "any organism": "mammalian",
}
SUPPORTED_STRENGTHS = {"any", "low", "medium", "high"}
SUPPORTED_REGULATION = {"any", "constitutive", "inducible"}


@dataclass(frozen=True)
class PromoterSelectionInput:
    host: str
    function: str | None = None
    strength: str = "any"
    regulation: str = "any"
    max_results: int = 5
    email: str | None = None
    use_ncbi: bool = True
    ncbi_max_records: int = 10

    @classmethod
    def from_payload(cls, payload: dict[str, Any]) -> "PromoterSelectionInput":
        if not isinstance(payload, dict):
            raise ToolInputError("Payload must be an object.")

        host = _normalize_host(payload.get("host", "ecoli"))
        if host not in SUPPORTED_HOSTS:
            raise ToolInputError(
                "Unsupported promoter host.",
                {"host": host, "supported": sorted(SUPPORTED_HOSTS)},
            )

        strength = str(payload.get("strength", "any")).strip().lower()
        if strength not in SUPPORTED_STRENGTHS:
            raise ToolInputError(
                "Unsupported promoter strength.",
                {"strength": strength, "supported": sorted(SUPPORTED_STRENGTHS)},
            )

        regulation = str(payload.get("regulation", "any")).strip().lower()
        if regulation not in SUPPORTED_REGULATION:
            raise ToolInputError(
                "Unsupported promoter regulation.",
                {"regulation": regulation, "supported": sorted(SUPPORTED_REGULATION)},
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

        function = payload.get("function")
        if function is not None and not isinstance(function, str):
            raise ToolInputError("function must be a string when provided.")

        return cls(
            host=host,
            function=function.strip().lower() if isinstance(function, str) and function.strip() else None,
            strength=strength,
            regulation=regulation,
            max_results=max_results,
            email=_optional_text(payload.get("email")),
            use_ncbi=bool(payload.get("use_ncbi", True)),
            ncbi_max_records=ncbi_max_records,
        )


def _normalize_host(value: object) -> str:
    host = str(value).strip().lower().replace("-", " ").replace("_", " ")
    return HOST_ALIASES.get(host, host.replace(" ", "_"))


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ToolInputError("Optional text fields must be strings.")
    stripped = value.strip()
    return stripped or None
