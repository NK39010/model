# Verifies promoter selection by host, strength, and regulation.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.promoter_selection.runner import PromoterSelectionRunner


class PromoterSelectionRunnerTest(unittest.TestCase):
    def test_selects_ecoli_inducible_promoters(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = PromoterSelectionRunner()
            result = runner.run(
                {
                    "host": "ecoli",
                    "function": "high expression iptg",
                    "strength": "high",
                    "regulation": "inducible",
                    "max_results": 3,
                },
                Path(tempdir),
            )

            self.assertGreaterEqual(result["candidate_count"], 1)
            self.assertEqual(result["candidates"][0]["host"], "ecoli")
            self.assertTrue(result["candidates"][0]["sequence"])
            self.assertTrue((Path(tempdir) / "promoters.csv").exists())
            self.assertTrue((Path(tempdir) / "promoters.fasta").exists())

    def test_selects_cho_mammalian_promoters(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = PromoterSelectionRunner()
            result = runner.run(
                {
                    "host": "cho",
                    "function": "stable expression",
                    "strength": "high",
                    "regulation": "constitutive",
                },
                Path(tempdir),
            )

            self.assertGreaterEqual(result["candidate_count"], 1)
            self.assertIn(result["candidates"][0]["host"], {"mammalian", "cho"})

    def test_job_service_runs_registered_promoter_selection_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "promoter_selection",
                {
                    "host": "saccharomyces_cerevisiae",
                    "function": "constitutive expression",
                    "strength": "high",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertGreaterEqual(job.result["candidate_count"], 1)

    @patch("app.tools.promoter_selection.runner.search_ncbi_elements")
    def test_promoter_selection_can_include_ncbi_candidates(self, mock_search) -> None:
        mock_search.return_value = [
            {
                "name": "mock promoter",
                "record_id": "MOCK0001.1",
                "organism": "Escherichia coli",
                "feature_type": "promoter",
                "location": "[0:20](+)",
                "sequence": "TAATACGACTCACTATAGGG",
                "length": 20,
                "gc_content": 0.45,
                "matched_fields": ["promoter", "mock"],
                "qualifiers": {"note": ["mock promoter"]},
            }
        ]
        with tempfile.TemporaryDirectory() as tempdir:
            runner = PromoterSelectionRunner()
            result = runner.run(
                {
                    "host": "Escherichia coli",
                    "function": "mock",
                    "email": "test@example.com",
                    "max_results": 5,
                },
                Path(tempdir),
            )

            self.assertTrue(any(candidate["source"] == "ncbi" for candidate in result["candidates"]))


if __name__ == "__main__":
    unittest.main()
