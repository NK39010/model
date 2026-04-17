# Describes the resistance marker selection tool.
TOOL_MANIFESTS = [
    {
        "name": "resistance_marker_selection",
        "display_name": "Resistance Gene Selection",
        "version": "1.0.0",
        "description": "Search NCBI for antibiotic or drug resistance gene sequences by host and selection pressure.",
        "category": "sequence_design",
        "runner": "app.tools.resistance_marker_selection.runner.ResistanceMarkerSelectionRunner",
        "input_schema": "ResistanceMarkerSelectionInput",
        "output_schema": "ResistanceMarkerSelectionOutput",
        "result_files": ["result.json", "markers.csv", "markers.fasta"],
    },
]
