# Verifies IQ-TREE command construction, parsing, and registration with a fake binary.
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.iqtree.runner import IqtreePhylogenyRunner
from app.tools.registry import list_tools


class IqtreeRunnerTest(unittest.TestCase):
    def test_iqtree_runner_executes_binary_and_parses_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            fake_binary = _fake_iqtree_binary(temp_path)
            workdir = temp_path / "work"
            workdir.mkdir()

            with patch.dict(os.environ, {"IQTREE_BINARY": str(fake_binary)}):
                result = IqtreePhylogenyRunner().run(
                    {
                        "aligned_fasta": ">seq1\nATGC\n>seq2\nATGA\n>seq3\nATGT\n",
                        "sequence_type": "dna",
                        "model_mode": "auto",
                        "bootstrap_enabled": True,
                        "bootstrap_replicates": 1000,
                        "alrt_enabled": True,
                        "alrt_replicates": 1000,
                        "thread_mode": "auto",
                    },
                    workdir,
                )

            self.assertEqual(result["tool"], "iqtree_phylogeny")
            self.assertEqual(result["sequence_type"], "dna")
            self.assertEqual(result["iqtree_model"], "MFP")
            self.assertEqual(result["best_model"], "GTR+G4")
            self.assertAlmostEqual(result["log_likelihood"], -123.45)
            self.assertEqual(result["sequence_count"], 3)
            self.assertEqual(result["alignment_length"], 4)
            self.assertIn("-B", result["command"])
            self.assertIn("-alrt", result["command"])
            self.assertIn("(seq1:0.1,seq2:0.2,seq3:0.3);", result["newick"])
            self.assertTrue((workdir / "input.fasta").exists())
            self.assertTrue((workdir / "result.treefile").exists())

    def test_iqtree_rejects_incompatible_fixed_model(self) -> None:
        with self.assertRaises(ToolInputError):
            IqtreePhylogenyRunner().validate_input(
                {
                    "aligned_fasta": ">seq1\nATGC\n>seq2\nATGA\n>seq3\nATGT\n",
                    "sequence_type": "dna",
                    "model_mode": "fixed",
                    "model": "LG+G",
                }
            )

    def test_job_service_runs_registered_iqtree_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            fake_binary = _fake_iqtree_binary(temp_path)
            service = JobService(results_root=temp_path / "jobs")

            with patch.dict(os.environ, {"IQTREE_BINARY": str(fake_binary)}):
                job = service.submit_and_run(
                    "iqtree_phylogeny",
                    {
                        "aligned_fasta": ">seq1\nATGC\n>seq2\nATGA\n>seq3\nATGT\n",
                        "sequence_type": "auto",
                    },
                )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["tree_summary"]["tip_count"], 3)

    def test_job_service_reports_missing_iqtree_binary(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))

            with patch.dict(os.environ, {"PATH": "", "IQTREE_BINARY": ""}, clear=False):
                job = service.submit_and_run(
                    "iqtree_phylogeny",
                    {
                        "aligned_fasta": ">seq1\nATGC\n>seq2\nATGA\n>seq3\nATGT\n",
                        "sequence_type": "auto",
                    },
                )

            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertIsNotNone(job.error)
            assert job.error is not None
            self.assertEqual(job.error["code"], "TOOL_EXECUTION_ERROR")
            self.assertIn("IQ-TREE executable was not found", job.error["message"])

    def test_single_core_iqtree_forces_one_thread(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            temp_path = Path(tempdir)
            fake_binary = _fake_iqtree_binary(temp_path, single_core=True)
            workdir = temp_path / "work"
            workdir.mkdir()

            with patch.dict(os.environ, {"IQTREE_BINARY": str(fake_binary)}):
                result = IqtreePhylogenyRunner().run(
                    {
                        "aligned_fasta": ">seq1\nATGC\n>seq2\nATGA\n>seq3\nATGT\n",
                        "sequence_type": "dna",
                        "thread_mode": "auto",
                    },
                    workdir,
                )

            thread_flag_index = result["command"].index("-T")
            self.assertEqual(result["command"][thread_flag_index + 1], "1")
            self.assertEqual(result["thread_count"], 1)

    def test_iqtree_is_listed(self) -> None:
        self.assertIn("iqtree_phylogeny", {tool["name"] for tool in list_tools()})


def _fake_iqtree_binary(directory: Path, single_core: bool = False) -> Path:
    binary = directory / "fake_iqtree2.py"
    binary.write_text(
        f"""#!/usr/bin/env python3
from pathlib import Path
import sys

if "--version" in sys.argv:
    print("{'IQ-TREE single-core version 3.1.2' if single_core else 'IQ-TREE multicore version 3.1.2'}")
    raise SystemExit(0)

prefix = "result"
for index, arg in enumerate(sys.argv):
    if arg == "-pre" and index + 1 < len(sys.argv):
        prefix = sys.argv[index + 1]

Path(prefix + ".treefile").write_text("(seq1:0.1,seq2:0.2,seq3:0.3);\\n", encoding="utf-8")
Path(prefix + ".contree").write_text("(seq1:0.1,seq2:0.2,seq3:0.3);\\n", encoding="utf-8")
Path(prefix + ".iqtree").write_text("Best-fit model according to BIC: GTR+G4\\nLog-likelihood of the tree: -123.45\\n", encoding="utf-8")
Path(prefix + ".log").write_text("Fake IQ-TREE log\\n", encoding="utf-8")
print("fake iqtree ok")
""",
        encoding="utf-8",
    )
    binary.chmod(0o755)
    return binary


if __name__ == "__main__":
    unittest.main()
