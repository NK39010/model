# Defines the common interface that every bioinformatics tool module must implement.
from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any


class ToolRunner(ABC):
    """Base class for all pluggable tool modules."""

    name: str
    version: str

    @abstractmethod
    def validate_input(self, payload: dict[str, Any]) -> None:
        """Validate raw user input before execution starts."""

    @abstractmethod
    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        """Run the tool inside the given work directory and return structured output."""

    @abstractmethod
    def parse_result(self, workdir: Path) -> dict[str, Any]:
        """Parse files in the work directory into the standard output shape."""
