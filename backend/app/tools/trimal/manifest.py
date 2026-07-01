# Describes the trimAl-style alignment trimming tool.
from __future__ import annotations


TOOL_MANIFESTS = [
    {
        "name": "trimal_alignment_trimming",
        "display_name": "trimAl Alignment Trimming",
        "version": "1.0.0",
        "description": "Trim noisy columns from an existing multiple sequence alignment and report retained/deleted regions.",
        "category": "alignment",
        "runner": "app.tools.trimal.runner.TrimalAlignmentTrimmingRunner",
        "input_schema": "TrimalInput",
        "output_schema": "TrimalOutput",
        "result_files": [
            "result.json",
            "summary.json",
            "input_aligned.fasta",
            "trimmed.fasta",
            "removed_columns.csv",
            "retained_columns.csv",
        ],
    },
]
