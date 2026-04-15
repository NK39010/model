# Registers available tool modules so the job service can execute them by name.
from __future__ import annotations

from app.tools.alignment.runner import (
    PairwiseSimilarityMatrixRunner,
    ReferenceSimilarityTableRunner,
)
from app.tools.base import ToolRunner
from app.tools.errors import ToolInputError
from app.tools.ncbi.runner import NCBIRefSeqLookupRunner
from app.tools.sequence_parts.runner import SequencePartsParseRunner


TOOL_REGISTRY: dict[str, ToolRunner] = {
    ReferenceSimilarityTableRunner.name: ReferenceSimilarityTableRunner(),
    PairwiseSimilarityMatrixRunner.name: PairwiseSimilarityMatrixRunner(),
    NCBIRefSeqLookupRunner.name: NCBIRefSeqLookupRunner(),
    SequencePartsParseRunner.name: SequencePartsParseRunner(),
}


def get_tool_runner(tool_name: str) -> ToolRunner:
    """Return a registered runner by its public tool name."""
    try:
        return TOOL_REGISTRY[tool_name]
    except KeyError as exc:
        raise ToolInputError(
            f"Unknown tool: {tool_name}",
            details={"available_tools": sorted(TOOL_REGISTRY)},
        ) from exc


def list_tools() -> list[dict[str, str]]:
    """Return a small machine-readable catalog of registered tools."""
    return [
        {
            "name": runner.name,
            "version": runner.version,
        }
        for runner in TOOL_REGISTRY.values()
    ]
