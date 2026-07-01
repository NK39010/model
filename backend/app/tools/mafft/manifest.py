# Describes the MAFFT multiple sequence alignment tool.
from __future__ import annotations

from app.tools.mafft.modes import DEFAULT_MODE, MAFFT_MODES


TOOL_MANIFESTS = [
    {
        "name": "mafft_alignment",
        "display_name": "MAFFT 多序列比对",
        "version": "1.0.0",
        "description": "Use MAFFT to perform multiple sequence alignment.",
        "category": "alignment",
        "runner": "app.tools.mafft.runner.MafftAlignmentRunner",
        "input_schema": "MafftAlignmentInput",
        "output_schema": "MafftAlignmentOutput",
        "result_files": ["result.json", "input.fasta", "aligned.fasta"],
        "default_mode": DEFAULT_MODE,
        "modes": MAFFT_MODES,
    },
]

