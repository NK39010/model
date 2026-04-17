# Verifies NCBI-backed resistance marker selection behavior.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.resistance_marker_selection.runner import ResistanceMarkerSelectionRunner


MOCK_MARKER = {
    "name": "bla",
    "record_id": "MOCK0002.1",
    "organism": "synthetic construct",
    "feature_type": "cds",
    "location": "[0:861](+)",
    "sequence": "ATG" + "GCT" * 20 + "TAA",
    "length": 66,
    "gc_content": 0.52,
    "matched_fields": ["cds", "bla", "ampicillin resistance"],
    "qualifiers": {"gene": ["bla"], "product": ["beta-lactamase"]},
}


class ResistanceMarkerSelectionRunnerTest(unittest.TestCase):
    @patch("app.tools.resistance_marker_selection.runner.search_ncbi_elements")
    def test_selects_marker_from_ncbi(self, mock_search) -> None:
        mock_search.return_value = [MOCK_MARKER]
        with tempfile.TemporaryDirectory() as tempdir:
            runner = ResistanceMarkerSelectionRunner()
            result = runner.run(
                {
                    "host": "Escherichia coli",
                    "selection": "ampicillin",
                    "marker_type": "antibiotic",
                    "email": "test@example.com",
                },
                Path(tempdir),
            )

            self.assertEqual(result["candidate_count"], 1)
            self.assertEqual(result["candidates"][0]["name"], "bla")
            self.assertEqual(result["candidates"][0]["source"], "ncbi")
            self.assertTrue((Path(tempdir) / "markers.csv").exists())
            self.assertTrue((Path(tempdir) / "markers.fasta").exists())

    @patch("app.tools.resistance_marker_selection.runner.search_ncbi_elements")
    def test_job_service_runs_registered_marker_tool(self, mock_search) -> None:
        mock_search.return_value = [MOCK_MARKER]
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "resistance_marker_selection",
                {
                    "host": "ecoli",
                    "selection": "ampicillin",
                    "marker_type": "antibiotic",
                    "email": "test@example.com",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["candidate_count"], 1)


if __name__ == "__main__":
    unittest.main()
