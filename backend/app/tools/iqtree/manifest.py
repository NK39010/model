# Describes the IQ-TREE phylogenetic inference tool.
from __future__ import annotations


TOOL_MANIFESTS = [
    {
        "name": "iqtree_phylogeny",
        "display_name": "IQ-TREE Phylogeny",
        "version": "1.0.0",
        "description": "Infer a maximum-likelihood phylogenetic tree from an aligned FASTA using IQ-TREE.",
        "category": "alignment",
        "runner": "app.tools.iqtree.runner.IqtreePhylogenyRunner",
        "input_schema": "IqtreeInput",
        "output_schema": "IqtreeOutput",
        "result_files": [
            "result.json",
            "input.fasta",
            "result.treefile",
            "result.iqtree",
            "result.log",
            "iqtree.stdout.txt",
            "iqtree.stderr.txt",
        ],
    },
]
