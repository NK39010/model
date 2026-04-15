# Provides shared helpers for writing and listing result files.
from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any


def write_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.write_text(text, encoding="utf-8")


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    if not rows:
        write_text(path, "")
        return

    with path.open("w", newline="", encoding="utf-8") as file_obj:
        writer = csv.DictWriter(file_obj, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def write_matrix_csv(path: Path, labels: list[str], matrix: list[list[float | int]]) -> None:
    with path.open("w", newline="", encoding="utf-8") as file_obj:
        writer = csv.writer(file_obj)
        writer.writerow(["sequence_id", *labels])
        for label, row in zip(labels, matrix, strict=True):
            writer.writerow([label, *row])


def list_file_names(path: Path) -> list[str]:
    return sorted(item.name for item in path.iterdir() if item.is_file())
