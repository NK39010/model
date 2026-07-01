# Describes the R/ggtree visualization tool.
from __future__ import annotations


TOOL_MANIFESTS = [
    {
        "name": "ggtree_visualization",
        "display_name": "R / ggtree Visualization",
        "version": "1.0.0",
        "description": "Render Newick phylogenetic trees with R and ggtree.",
        "category": "phylogeny",
        "runner": "app.tools.ggtree.runner.GgtreeVisualizationRunner",
        "input_schema": "GgtreeInput",
        "output_schema": "GgtreeOutput",
        "result_files": [
            "result.json",
            "input.treefile",
            "ggtree_tree.png",
            "ggtree_tree.pdf",
            "ggtree_tree.svg",
            "ggtree.stdout.txt",
            "ggtree.stderr.txt",
        ],
    },
]
