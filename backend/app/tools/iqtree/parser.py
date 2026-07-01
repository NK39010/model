# Parses IQ-TREE result files.
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.tools.errors import ToolParseError


def parse_iqtree_result(path: Path) -> dict[str, Any]:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ToolParseError("Could not parse IQ-TREE result.", {"path": str(path)}) from exc


def parse_iqtree_report(text: str) -> dict[str, Any]:
    best_model = _first_match(
        text,
        [
            r"Best-fit model(?: according to BIC)?:\s*([^\s]+)",
            r"Model of substitution:\s*([^\s]+)",
            r"Model:\s*([^\s]+)",
        ],
    )
    log_likelihood = _float_match(
        text,
        [
            r"Log-likelihood of the tree:\s*(-?\d+(?:\.\d+)?)",
            r"Log-likelihood:\s*(-?\d+(?:\.\d+)?)",
        ],
    )
    return {
        "best_model": best_model,
        "log_likelihood": log_likelihood,
    }


def summarize_newick(newick: str) -> dict[str, Any]:
    labels = sorted(set(re.findall(r"(?<=[(,])([^():,;\s]+)(?=[:),;])", newick)))
    support_values = re.findall(r"\)([0-9]+(?:\.[0-9]+)?)(?=[:),;])", newick)
    return {
        "tip_count": len(labels),
        "tip_labels": labels,
        "has_support_values": bool(support_values),
        "support_count": len(support_values),
    }


def _first_match(text: str, patterns: list[str]) -> str | None:
    for pattern in patterns:
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return match.group(1).strip()
    return None


def _float_match(text: str, patterns: list[str]) -> float | None:
    value = _first_match(text, patterns)
    if value is None:
        return None
    try:
        return float(value)
    except ValueError:
        return None
