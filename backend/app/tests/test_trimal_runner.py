# Verifies trimAl-style alignment trimming outputs and registration.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolExecutionError
from app.tools.registry import list_tools
from app.tools.trimal.runner import TrimalAlignmentTrimmingRunner


class TrimalRunnerTest(unittest.TestCase):
    def test_trimal_trims_gappy_columns_and_writes_files(self) -> None:
        runner = TrimalAlignmentTrimmingRunner()
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            result = runner.run(
                {
                    "aligned_fasta": ">seq1\nATG-C\n>seq2\nATGAC\n>seq3\nAT--T\n",
                    "sequence_type": "dna",
                    "mode": "gappyout",
                },
                workdir,
            )

            self.assertEqual(result["tool"], "trimal_alignment_trimming")
            self.assertEqual(result["original_length"], 5)
            self.assertEqual(result["trimmed_length"], 4)
            self.assertEqual(result["removed_columns"], [4])
            self.assertEqual(result["retained_columns"], [1, 2, 3, 5])
            self.assertEqual(result["trimmed_records"][0]["sequence"], "ATGC")
            self.assertEqual(result["removed_regions"][0]["start"], 4)
            self.assertIn("high_gap", result["removed_regions"][0]["reasons"])
            self.assertTrue((workdir / "trimmed.fasta").exists())
            self.assertTrue((workdir / "removed_columns.csv").exists())
            self.assertIn(">seq1\nATGC\n", (workdir / "trimmed.fasta").read_text(encoding="utf-8"))

    def test_trimal_raises_when_thresholds_remove_all_columns(self) -> None:
        runner = TrimalAlignmentTrimmingRunner()
        with tempfile.TemporaryDirectory() as tempdir:
            with self.assertRaises(ToolExecutionError):
                runner.run(
                    {
                        "aligned_fasta": ">seq1\nAAA\n>seq2\nCCC\n>seq3\nGGG\n",
                        "mode": "manual",
                        "gap_threshold": 0.0,
                        "conservation_threshold": 1.0,
                    },
                    Path(tempdir),
                )

    def test_job_service_runs_registered_trimal_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "trimal_alignment_trimming",
                {
                    "aligned_fasta": ">seq1\nATG-C\n>seq2\nATGAC\n>seq3\nAT--T\n",
                    "sequence_type": "auto",
                    "mode": "gappyout",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["sequence_type"], "dna")
            self.assertEqual(job.result["trimmed_length"], 4)

    def test_trimal_is_listed(self) -> None:
        self.assertIn("trimal_alignment_trimming", {tool["name"] for tool in list_tools()})


if __name__ == "__main__":
    unittest.main()
