# Defines shared exception types used by all tool modules and the job service.
from __future__ import annotations

from typing import Any


class ToolError(Exception):
    """Base error returned by tool modules."""

    code = "TOOL_ERROR"

    def __init__(self, message: str, details: dict[str, Any] | None = None):
        self.message = message
        self.details = details or {}
        super().__init__(message)

    def to_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


class ToolInputError(ToolError):
    """Raised when the payload is invalid."""

    code = "TOOL_INPUT_ERROR"


class ToolExecutionError(ToolError):
    """Raised when a tool fails during execution."""

    code = "TOOL_EXECUTION_ERROR"


class ToolParseError(ToolError):
    """Raised when generated output cannot be parsed."""

    code = "TOOL_PARSE_ERROR"


class ToolDependencyError(ToolError):
    """Raised when a required external dependency is missing."""

    code = "TOOL_DEPENDENCY_ERROR"
