# Describes the NCBI BLAST lookup tool for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "ncbi_blast_lookup",
        "display_name": "NCBI BLAST Lookup",
        "version": "1.0.0",
        "description": "Run NCBI BLAST for a query sequence and return top hit summaries.",
        "category": "ncbi",
        "runner": "app.tools.blast.runner.NCBIBlastLookupRunner",
        "input_schema": "NCBIBlastLookupInput",
        "output_schema": "NCBIBlastLookupOutput",
        "result_files": ["result.json", "blast.xml"],
    },
]
