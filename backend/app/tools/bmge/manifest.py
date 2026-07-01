# Describes the BMGE-style entropy-based alignment trimming tool.
from __future__ import annotations


TOOL_MANIFESTS = [
    {
        "name": "BMGE",
        "display_name": "BMGE Entropy Trimming",
        "version": "1.0.0",
        "description": "Select alignment columns with gap and entropy filters for downstream phylogenetic analysis.",
        "category": "alignment",
        "runner": "app.tools.bmge.runner.BmgeAlignmentTrimmingRunner",
        "input_schema": "BmgeInput",
        "output_schema": "BmgeOutput",
        "result_files": [
            "result.json",
            "summary.json",
            "input_aligned.fasta",
            "trimmed.fasta",
            "removed_columns.csv",
            "retained_columns.csv",
            "column_entropy.csv",
        ],
    },
]
