# Verifies the independent R/ggtree visualization module.
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.tools.errors import ToolExecutionError, ToolInputError
from app.tools.ggtree.runner import GgtreeVisualizationRunner
from app.tools.registry import list_tools


class GgtreeRunnerTest(unittest.TestCase):
    def test_ggtree_runner_executes_rscript_and_collects_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            fake_rscript = _fake_rscript_binary(temp_path)
            workdir = temp_path / "work"
            workdir.mkdir()

            with patch.dict(os.environ, {"RSCRIPT_BINARY": str(fake_rscript)}):
                result = GgtreeVisualizationRunner().run(
                    {
                        "newick": "(seq1:0.1,seq2:0.2,seq3:0.3);",
                        "layout": "circular",
                        "show_tip_labels": True,
                        "show_support": False,
                        "show_branch_length": True,
                        "tip_font_size": 4,
                        "branch_width": 1.2,
                        "branch_color": "#123456",
                        "tip_label_color": "#234567",
                        "support_color": "#345678",
                        "background_color": "#f5f5f5",
                        "support_threshold": 70,
                        "dpi": 600,
                        "width": 12,
                        "height": 10,
                    },
                    workdir,
                )

            self.assertEqual(result["tool"], "ggtree_visualization")
            self.assertEqual(result["layout"], "circular")
            self.assertEqual(result["tip_count"], 3)
            self.assertEqual(result["branch_color"], "#123456")
            self.assertEqual(result["support_threshold"], 70)
            self.assertEqual(result["dpi"], 600)
            self.assertEqual(result["files"]["png"], "ggtree_tree.png")
            self.assertEqual(result["files"]["pdf"], "ggtree_tree.pdf")
            self.assertTrue((workdir / "input.treefile").exists())
            self.assertTrue((workdir / "ggtree_tree.png").exists())

    def test_ggtree_rejects_invalid_newick(self) -> None:
        with self.assertRaises(ToolInputError):
            GgtreeVisualizationRunner().validate_input({"newick": "not-a-tree"})

    def test_ggtree_rejects_invalid_style(self) -> None:
        with self.assertRaises(ToolInputError):
            GgtreeVisualizationRunner().validate_input(
                {"newick": "(seq1:0.1,seq2:0.2);", "branch_color": "green"}
            )

    def test_ggtree_reports_missing_configured_rscript(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            with patch.dict(os.environ, {"RSCRIPT_BINARY": str(Path(tempdir) / "missing-rscript")}):
                with self.assertRaises(ToolExecutionError):
                    GgtreeVisualizationRunner().run(
                        {"newick": "(seq1:0.1,seq2:0.2,seq3:0.3);"},
                        Path(tempdir),
                    )

    def test_ggtree_is_listed(self) -> None:
        self.assertIn("ggtree_visualization", {tool["name"] for tool in list_tools()})


def _fake_rscript_binary(directory: Path) -> Path:
    binary = directory / "fake_rscript.py"
    binary.write_text(
        """#!/usr/bin/env python3
from pathlib import Path
import sys

prefix = Path(sys.argv[3])
Path(str(prefix) + ".png").write_bytes(b"fake png")
Path(str(prefix) + ".pdf").write_bytes(b"fake pdf")
print("fake ggtree ok")
""",
        encoding="utf-8",
    )
    binary.chmod(0o755)
    return binary


if __name__ == "__main__":
    unittest.main()
