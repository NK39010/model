# Registers available tool modules so the job service can execute them by name.
from __future__ import annotations

from app.tools.alignment.runner import (
    PairwiseSimilarityMatrixRunner,
    ReferenceSimilarityTableRunner,
)
from app.tools.base import ToolRunner
from app.tools.blast.runner import NCBIBlastLookupRunner
from app.tools.codon_optimization.runner import CodonOptimizationRunner
from app.tools.errors import ToolInputError
from app.tools.ncbi.runner import NCBIRefSeqLookupRunner
from app.tools.primer_design.runner import PrimerDesignRunner
from app.tools.promoter_selection.runner import PromoterSelectionRunner
from app.tools.resistance_marker_selection.runner import ResistanceMarkerSelectionRunner
from app.tools.sequence_parts.runner import SequencePartsParseRunner


TOOL_REGISTRY: dict[str, ToolRunner] = {
    ReferenceSimilarityTableRunner.name: ReferenceSimilarityTableRunner(),
    PairwiseSimilarityMatrixRunner.name: PairwiseSimilarityMatrixRunner(),
    NCBIRefSeqLookupRunner.name: NCBIRefSeqLookupRunner(),
    NCBIBlastLookupRunner.name: NCBIBlastLookupRunner(),
    CodonOptimizationRunner.name: CodonOptimizationRunner(),
    PrimerDesignRunner.name: PrimerDesignRunner(),
    PromoterSelectionRunner.name: PromoterSelectionRunner(),
    ResistanceMarkerSelectionRunner.name: ResistanceMarkerSelectionRunner(),
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
