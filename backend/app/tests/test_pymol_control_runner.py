# Verifies safe PyMOL backend integration behavior.
from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from app.tools.errors import ToolDependencyError, ToolInputError
from app.tools.pymol_control.runner import PyMOLControlRunner


class PyMOLControlRunnerTest(unittest.TestCase):
    def test_validate_input_rejects_unknown_operation(self) -> None:
        runner = PyMOLControlRunner()

        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "structure_text": "ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N",
                    "structure_file_name": "demo.pdb",
                    "operation": "delete_everything",
                }
            )

    @patch("app.tools.pymol_control.runner.shutil.which", return_value=None)
    @patch.dict("app.tools.pymol_control.runner.os.environ", {}, clear=True)
    def test_missing_pymol_returns_dependency_error(self, _mock_which) -> None:
        runner = PyMOLControlRunner()

        with TemporaryDirectory() as temp_dir:
            with self.assertRaises(ToolDependencyError):
                runner.run(
                    {
                        "structure_text": "ATOM      1  N   GLY A   1       0.000   0.000   0.000  1.00  0.00           N",
                        "structure_file_name": "demo.pdb",
                    },
                    workdir=Path(temp_dir),
                )


if __name__ == "__main__":
    unittest.main()
