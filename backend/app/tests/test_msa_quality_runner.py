# Verifies MSA quality metrics, consensus outputs, and standard result files.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.msa_quality.runner import MsaQualityRunner
from app.tools.registry import list_tools


class MsaQualityRunnerTest(unittest.TestCase):
    def test_msa_quality_metrics_and_files(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = MsaQualityRunner()
            result = runner.run(
                {
                    "fasta": ">seq1\nATG-C\n>seq2\nATGAC\n>seq3\nAT--T\n",
                    "sequence_type": "dna",
                    "high_gap_threshold": 0.6,
                },
                workdir,
            )

            summary = result["summary"]
            self.assertEqual(summary["sequence_count"], 3)
            self.assertEqual(summary["alignment_length"], 5)
            self.assertEqual(summary["min_ungapped_length"], 3)
            self.assertEqual(summary["max_ungapped_length"], 5)
            self.assertEqual(summary["total_gaps"], 3)
            self.assertAlmostEqual(summary["gap_ratio"], 0.2)
            self.assertEqual(summary["variable_sites"], 1)
            self.assertEqual(summary["conserved_sites"], 2)
            self.assertEqual(result["consensus"]["sequence"], "ATG-C")
            self.assertEqual(result["consensus"]["ungapped_length"], 4)

            position_4 = result["position_quality"][3]
            self.assertEqual(position_4["position"], 4)
            self.assertEqual(position_4["consensus"], "-")
            self.assertAlmostEqual(position_4["gap_fraction"], 0.666667)

            matrix = result["identity_matrix"]
            self.assertEqual(matrix["labels"], ["seq1", "seq2", "seq3"])
            self.assertEqual(matrix["matrix"][0][1], 1.0)
            self.assertAlmostEqual(matrix["matrix"][0][2], 0.666667)
            self.assertEqual(result["problematic_regions"][0]["start"], 4)
            self.assertIn("high_gap", result["problematic_regions"][0]["reasons"])
            self.assertIn("sections", result)
            self.assertEqual(result["sections"]["overview"]["summary"]["alignment_length"], 5)
            self.assertEqual(result["sections"]["gap_quality"]["high_gap_columns"], 1)
            self.assertEqual(result["sections"]["similarity"]["identity_matrix"]["labels"], ["seq1", "seq2", "seq3"])
            self.assertEqual(result["sections"]["alignment_browser"]["records"][0]["name"], "seq1")

            low_identity_pairs = result["sections"]["similarity"]["low_identity_pairs"]
            self.assertEqual(low_identity_pairs[0]["sequence_a"], "seq1")
            self.assertEqual(low_identity_pairs[0]["sequence_b"], "seq3")

            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "position_quality.csv").exists())
            self.assertTrue((workdir / "sequence_quality.csv").exists())
            self.assertTrue((workdir / "identity_matrix.csv").exists())
            self.assertTrue((workdir / "consensus.fasta").exists())
            self.assertIn(">consensus\nATG-C\n", (workdir / "consensus.fasta").read_text(encoding="utf-8"))

    def test_records_must_have_equal_alignment_length(self) -> None:
        runner = MsaQualityRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "records": [
                        {"name": "seq1", "sequence": "ATGC"},
                        {"name": "seq2", "sequence": "ATG-C"},
                    ]
                }
            )

    def test_job_service_runs_registered_msa_quality_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "MSA_quality",
                {
                    "fasta": ">seq1\nATGC\n>seq2\nATGA\n",
                    "sequence_type": "dna",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["tool"], "MSA_quality")
            self.assertEqual(job.result["summary"]["alignment_length"], 4)

    def test_msa_quality_is_listed(self) -> None:
        self.assertIn("MSA_quality", {tool["name"] for tool in list_tools()})


if __name__ == "__main__":
    unittest.main()
