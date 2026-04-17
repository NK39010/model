# Describes the codon optimization tool for discovery and documentation.
TOOL_MANIFESTS = [
    {
        "name": "codon_optimization",
        "display_name": "Codon Optimization",
        "version": "1.0.0",
        "description": "Optimize CDS codons for E. coli, S. cerevisiae, Y. lipolytica, or CHO expression.",
        "category": "sequence_design",
        "runner": "app.tools.codon_optimization.runner.CodonOptimizationRunner",
        "input_schema": "CodonOptimizationInput",
        "output_schema": "CodonOptimizationOutput",
        "result_files": ["result.json", "optimized_sequence.fasta", "codon_usage.csv", "replacements.csv"],
    },
]
