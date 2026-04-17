# Verifies primer design workflows for vector construction and mutation design.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.primer_design.runner import PrimerDesignRunner


VECTOR = "ATGCGTACGTTAGCTAGCTAGGATCCGGAATTCGCTAGCTAGCTAGCATCGATCGATCG"
INSERT = "TTGACCGTACCGTTAACCGGTTAACTGACTGACTGACCGTAGCTAGCTAGGCTTAAC"
GENE = "ATGGCTGCTGCTTTCGAACTGACTGGTGGTGGTAACTACGCTGCTGCTGCTTAA"


class PrimerDesignRunnerTest(unittest.TestCase):
    def test_vector_construction_designs_four_primers(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = PrimerDesignRunner()
            payload = {
                "mode": "vector_construction",
                "vector_sequence": VECTOR,
                "insert_sequence": INSERT,
                "homology_length": 18,
            }

            runner.validate_input(payload)
            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["mode"], "vector_construction")
            self.assertEqual(result["primer_count"], 4)
            self.assertEqual({primer["name"] for primer in result["primers"]}, {
                "vector_forward",
                "vector_reverse",
                "insert_forward",
                "insert_reverse",
            })
            self.assertTrue(all(primer["tm"] > 0 for primer in result["primers"]))
            self.assertTrue((Path(tempdir) / "result.json").exists())
            self.assertTrue((Path(tempdir) / "primers.csv").exists())
            self.assertTrue((Path(tempdir) / "primers.fasta").exists())

    def test_site_mutagenesis_designs_forward_and_reverse_primers(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = PrimerDesignRunner()
            payload = {
                "mode": "site_mutagenesis",
                "gene_sequence": GENE,
                "mutation": {
                    "position": 10,
                    "ref": "G",
                    "alt": "A",
                },
            }

            result = runner.run(payload, Path(tempdir))

            self.assertEqual(result["mode"], "site_mutagenesis")
            self.assertEqual(result["primer_count"], 2)
            self.assertEqual(result["primers"][0]["name"], "mutation_forward")
            self.assertEqual(result["primers"][1]["name"], "mutation_reverse")
            self.assertIn("A", result["primers"][0]["sequence"])

    def test_site_mutagenesis_rejects_mismatched_reference(self) -> None:
        runner = PrimerDesignRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "mode": "site_mutagenesis",
                    "gene_sequence": GENE,
                    "mutation": {
                        "position": 10,
                        "ref": "T",
                        "alt": "A",
                    },
                }
            )

    def test_job_service_runs_registered_primer_design_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "primer_design",
                {
                    "mode": "vector_construction",
                    "vector_sequence": VECTOR,
                    "insert_sequence": INSERT,
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["primer_count"], 4)


if __name__ == "__main__":
    unittest.main()
