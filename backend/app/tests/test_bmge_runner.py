# Verifies BMGE-style entropy trimming outputs and registration.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.bmge.runner import BmgeAlignmentTrimmingRunner
from app.tools.errors import ToolExecutionError
from app.tools.registry import list_tools


class BmgeRunnerTest(unittest.TestCase):
    def test_bmge_removes_high_entropy_and_gappy_columns(self) -> None:
        runner = BmgeAlignmentTrimmingRunner()
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            result = runner.run(
                {
                    "aligned_fasta": ">seq1\nA-GC\n>seq2\nACAC\n>seq3\nAGTC\n",
                    "sequence_type": "dna",
                    "entropy_threshold": 0.6,
                    "gap_rate_cutoff": 0.2,
                },
                workdir,
            )

            self.assertEqual(result["tool"], "BMGE")
            self.assertEqual(result["original_length"], 4)
            self.assertEqual(result["trimmed_length"], 2)
            self.assertEqual(result["removed_columns"], [2, 3])
            self.assertEqual(result["retained_columns"], [1, 4])
            self.assertEqual(result["trimmed_records"][0]["sequence"], "AC")
            self.assertEqual(result["removed_regions"][0]["start"], 2)
            self.assertTrue((workdir / "trimmed.fasta").exists())
            self.assertTrue((workdir / "column_entropy.csv").exists())
            self.assertIn(">seq1\nAC\n", (workdir / "trimmed.fasta").read_text(encoding="utf-8"))

    def test_bmge_raises_when_thresholds_remove_all_columns(self) -> None:
        runner = BmgeAlignmentTrimmingRunner()
        with tempfile.TemporaryDirectory() as tempdir:
            with self.assertRaises(ToolExecutionError):
                runner.run(
                    {
                        "aligned_fasta": ">seq1\nAAA\n>seq2\nCCC\n>seq3\nGGG\n",
                        "entropy_threshold": 0.0,
                        "gap_rate_cutoff": 0.0,
                    },
                    Path(tempdir),
                )

    def test_job_service_runs_registered_bmge_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "BMGE",
                {
                    "aligned_fasta": ">seq1\nA-GC\n>seq2\nACAC\n>seq3\nAGTC\n",
                    "sequence_type": "auto",
                    "entropy_threshold": 0.6,
                    "gap_rate_cutoff": 0.2,
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["sequence_type"], "dna")
            self.assertEqual(job.result["trimmed_length"], 2)

    def test_bmge_is_listed(self) -> None:
        self.assertIn("BMGE", {tool["name"] for tool in list_tools()})


if __name__ == "__main__":
    unittest.main()
