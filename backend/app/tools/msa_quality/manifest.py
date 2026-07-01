# Describes the MSA quality analysis tool.
from __future__ import annotations


TOOL_MANIFESTS = [
    {
        "name": "MSA_quality",
        "display_name": "MSA Quality",
        "version": "1.0.0",
        "description": "Evaluate multiple sequence alignment quality and emit visualization-ready metrics.",
        "category": "alignment",
        "runner": "app.tools.msa_quality.runner.MsaQualityRunner",
        "input_schema": "MsaQualityInput",
        "output_schema": "MsaQualityOutput",
        "result_files": [
            "result.json",
            "msa_quality.json",
            "position_quality.csv",
            "sequence_quality.csv",
            "identity_matrix.csv",
            "pairwise_identity.csv",
            "consensus.fasta",
            "consensus.csv",
            "problematic_regions.csv",
        ],
    },
]
