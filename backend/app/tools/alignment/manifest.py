# Describes alignment tool modules for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "reference_similarity_table",
        "display_name": "Reference Similarity Table",
        "version": "1.0.0",
        "description": "Compare one reference sequence against one or more target sequences.",
        "category": "alignment",
        "runner": "app.tools.alignment.runner.ReferenceSimilarityTableRunner",
        "input_schema": "ReferenceSimilarityInput",
        "output_schema": "ReferenceSimilarityOutput",
        "result_files": ["result.json", "similarity_table.csv"],
    },
    {
        "name": "pairwise_similarity_matrix",
        "display_name": "Pairwise Similarity Matrix",
        "version": "1.0.0",
        "description": "Compare multiple JSON or FASTA sequences pairwise and emit heatmap-ready data.",
        "category": "alignment",
        "runner": "app.tools.alignment.runner.PairwiseSimilarityMatrixRunner",
        "input_schema": "PairwiseMatrixInput",
        "output_schema": "PairwiseMatrixOutput",
        "result_files": ["result.json", "similarity_matrix.csv", "pairwise_table.csv"],
    },
]
