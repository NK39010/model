"""Topology operations used by the interactive ggtree editor."""
from __future__ import annotations

from io import StringIO

from Bio import Phylo

from app.tools.errors import ToolInputError


def apply_tree_operations(newick: str, reroot_node_id: str = "", midpoint_root: bool = False) -> str:
    if not reroot_node_id and not midpoint_root:
        return newick
    try:
        tree = Phylo.read(StringIO(newick), "newick")
        if midpoint_root:
            tree.root_at_midpoint()
        elif reroot_node_id:
            labels = _clade_labels(reroot_node_id)
            terminals = {terminal.name: terminal for terminal in tree.get_terminals()}
            missing = [label for label in labels if label not in terminals]
            if missing:
                raise ToolInputError("The requested root clade no longer exists in the tree.", {"missing": missing})
            outgroup = tree.common_ancestor([terminals[label] for label in labels])
            tree.root_with_outgroup(outgroup)
        output = StringIO()
        Phylo.write(tree, output, "newick")
        return output.getvalue().strip()
    except ToolInputError:
        raise
    except Exception as exc:
        raise ToolInputError("Could not apply the requested tree rooting operation.") from exc


def _clade_labels(node_id: str) -> list[str]:
    if not node_id.startswith("clade:"):
        raise ToolInputError("Rerooting requires an internal clade node.")
    labels = [label for label in node_id.removeprefix("clade:").split("|") if label]
    if not labels:
        raise ToolInputError("The selected clade has no descendant tips.")
    return labels
