"""Build a stable, serializable tree model for the ggtree web editor."""
from __future__ import annotations

from dataclasses import dataclass, field
from hashlib import sha256
import re
from typing import Any

from app.tools.errors import ToolInputError


@dataclass
class _Node:
    label: str = ""
    length: float | None = None
    children: list["_Node"] = field(default_factory=list)
    node_id: str = ""
    parent_id: str | None = None
    descendants: list[str] = field(default_factory=list)
    descendant_labels: list[str] = field(default_factory=list)


def build_tree_model(newick: str) -> dict[str, Any]:
    root = _NewickParser(newick).parse()
    tips: list[str] = []
    _collect_tip_labels(root, tips)
    duplicates = sorted({name for name in tips if tips.count(name) > 1})
    if duplicates:
        raise ToolInputError("The ggtree input contains duplicate tip labels.", {"duplicates": duplicates})
    _assign_ids(root)
    nodes: list[dict[str, Any]] = []
    _serialize(root, nodes)
    tree_hash = sha256(newick.strip().encode("utf-8")).hexdigest()[:16]
    return {
        "version": 1, "tree_id": f"tree:{tree_hash}", "root_id": root.node_id,
        "rooted": len(root.children) == 2, "tip_count": len(tips),
        "internal_node_count": sum(1 for node in nodes if not node["is_tip"]),
        "has_branch_lengths": any(node["branch_length"] is not None for node in nodes),
        "nodes": nodes, "warnings": [],
    }


def _collect_tip_labels(node: _Node, output: list[str]) -> None:
    if not node.children:
        if not node.label:
            raise ToolInputError("Every ggtree tip must have a label.")
        output.append(node.label)
    for child in node.children:
        _collect_tip_labels(child, output)


def _assign_ids(node: _Node) -> list[str]:
    if not node.children:
        node.node_id = f"tip:{sha256(node.label.encode()).hexdigest()[:16]}"
        node.descendants = [node.node_id]
        node.descendant_labels = [node.label]
        return node.descendants
    descendants = [tip for child in node.children for tip in _assign_ids(child)]
    node.descendants = sorted(descendants)
    node.descendant_labels = sorted(label for child in node.children for label in child.descendant_labels)
    node.node_id = f"clade:{'|'.join(node.descendant_labels)}"
    for child in node.children:
        child.parent_id = node.node_id
    return node.descendants


def _serialize(node: _Node, output: list[dict[str, Any]]) -> None:
    support_match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*", node.label) if node.children else None
    output.append({
        "id": node.node_id, "parent_id": node.parent_id,
        "children": [child.node_id for child in node.children], "is_tip": not node.children,
        "original_label": node.label, "display_label": node.label,
        "branch_length": node.length,
        "support": float(support_match.group(1)) if support_match else None,
        "descendant_tip_ids": node.descendants,
        "descendant_labels": node.descendant_labels,
    })
    for child in node.children:
        _serialize(child, output)


class _NewickParser:
    def __init__(self, source: str): self.source, self.index = source.strip(), 0

    def parse(self) -> _Node:
        try:
            node = self._subtree(); self._space()
            if self._peek() == ";": self.index += 1
            self._space()
            if self.index != len(self.source): raise ValueError("trailing content")
            return node
        except (ValueError, IndexError) as exc:
            raise ToolInputError("The ggtree input is not valid Newick.", {"offset": self.index}) from exc

    def _subtree(self) -> _Node:
        self._space(); children: list[_Node] = []
        if self._peek() == "(":
            self.index += 1; children.append(self._subtree())
            while True:
                self._space()
                if self._peek() != ",": break
                self.index += 1; children.append(self._subtree())
            self._expect(")")
        label = self._label(); length = None; self._space()
        if self._peek() == ":":
            self.index += 1; token = self._until(",();").strip(); length = float(token)
            if length < 0: raise ValueError("negative branch length")
        return _Node(label=label, length=length, children=children)

    def _label(self) -> str:
        self._space()
        if self._peek() in {"'", '"'}:
            quote = self._peek(); self.index += 1; start = self.index
            while self._peek() and self._peek() != quote: self.index += 1
            value = self.source[start:self.index]; self._expect(quote); return value
        return self._until(":,();").strip()

    def _until(self, stops: str) -> str:
        start = self.index
        while self._peek() and self._peek() not in stops: self.index += 1
        return self.source[start:self.index]

    def _expect(self, value: str) -> None:
        self._space()
        if self._peek() != value: raise ValueError(f"expected {value}")
        self.index += 1

    def _space(self) -> None:
        while self._peek() and self._peek().isspace(): self.index += 1

    def _peek(self) -> str: return self.source[self.index] if self.index < len(self.source) else ""
