# Describes the NCBI Entrez RefSeq lookup tool for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "ncbi_refseq_lookup",
        "display_name": "NCBI RefSeq Lookup",
        "version": "1.0.0",
        "description": "Fetch complete GenBank records by RefSeq or accession identifiers.",
        "category": "ncbi",
        "runner": "app.tools.ncbi.runner.NCBIRefSeqLookupRunner",
        "input_schema": "NCBIRefSeqLookupInput",
        "output_schema": "NCBIRefSeqLookupOutput",
        "result_files": ["result.json", "nucleotide_records.gb", "protein_records.gb"],
    },
]
