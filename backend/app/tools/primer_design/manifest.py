# Describes the primer design tool for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "primer_design",
        "display_name": "Primer Design",
        "version": "1.0.0",
        "description": "Design primers for vector construction or site-directed mutagenesis.",
        "category": "primer",
        "runner": "app.tools.primer_design.runner.PrimerDesignRunner",
        "input_schema": "PrimerDesignInput",
        "output_schema": "PrimerDesignOutput",
        "result_files": ["result.json", "primers.csv", "primers.fasta"],
    },
]
