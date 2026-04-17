# Describes the promoter selection tool for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "promoter_selection",
        "display_name": "Promoter Selection",
        "version": "1.0.0",
        "description": "Select host-compatible promoters by function, strength, and regulation mode.",
        "category": "sequence_design",
        "runner": "app.tools.promoter_selection.runner.PromoterSelectionRunner",
        "input_schema": "PromoterSelectionInput",
        "output_schema": "PromoterSelectionOutput",
        "result_files": ["result.json", "promoters.csv", "promoters.fasta"],
    },
]
