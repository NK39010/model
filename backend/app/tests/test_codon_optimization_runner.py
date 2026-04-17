# Verifies codon optimization workflows for supported expression hosts.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.codon_optimization.runner import CodonOptimizationRunner, translate_cds
from app.tools.errors import ToolInputError


CDS = "ATGGCTGCTGACTTTGAAGGTAAACTG"
PROTEIN = "MAADFEGKL"


class CodonOptimizationRunnerTest(unittest.TestCase):
    def test_optimizes_cds_for_ecoli(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = CodonOptimizationRunner()
            payload = {
                "input_type": "cds",
                "sequence": CDS,
                "host": "ecoli",
                "avoid_sites": ["GAATTC"],
            }

            runner.validate_input(payload)
            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["host"], "ecoli")
            self.assertEqual(result["protein_sequence"], translate_cds(CDS))
            self.assertEqual(len(result["optimized_sequence"]), len(CDS))
            self.assertGreater(result["metrics"]["cai_like"], 0)
            self.assertTrue((Path(tempdir) / "optimized_sequence.fasta").exists())
            self.assertTrue((Path(tempdir) / "codon_usage.csv").exists())
            self.assertTrue((Path(tempdir) / "replacements.csv").exists())

    def test_optimizes_protein_for_yarrowia(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = CodonOptimizationRunner()
            result = runner.run(
                {
                    "input_type": "protein",
                    "sequence": PROTEIN,
                    "host": "yarrowia_lipolytica",
                    "min_gc": 0.35,
                    "max_gc": 0.65,
                },
                Path(tempdir),
            )

            self.assertEqual(result["host"], "yarrowia_lipolytica")
            self.assertEqual(result["protein_sequence"], PROTEIN)
            self.assertEqual(len(result["optimized_sequence"]), len(PROTEIN) * 3)
            self.assertIsNone(result["metrics"]["input_gc"])

    def test_rejects_invalid_cds_length(self) -> None:
        runner = CodonOptimizationRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "input_type": "cds",
                    "sequence": "ATGG",
                    "host": "cho",
                }
            )

    def test_job_service_runs_registered_codon_optimization_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "codon_optimization",
                {
                    "input_type": "protein",
                    "sequence": PROTEIN,
                    "host": "saccharomyces_cerevisiae",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["host"], "saccharomyces_cerevisiae")


if __name__ == "__main__":
    unittest.main()
