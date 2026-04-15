# Verifies that the job service can execute registered tool modules through one path.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService


class JobServiceTest(unittest.TestCase):
    def test_job_service_runs_registered_alignment_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            results_root = Path(tempdir)
            service = JobService(results_root=results_root)

            job = service.submit_and_run(
                "reference_similarity_table",
                {
                    "reference": {"id": "ref", "sequence": "ACGT"},
                    "targets": [{"id": "target", "sequence": "ACCT"}],
                    "include_alignments": True,
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            self.assertEqual(job.result["target_count"], 1)
            self.assertEqual(job.result["rows"][0]["alignment_length"], 4)
            self.assertIn("aligned_reference", job.result["rows"][0])
            self.assertTrue((results_root / job.id / "job.json").exists())
            self.assertTrue((results_root / job.id / "input.json").exists())
            self.assertTrue((results_root / job.id / "result.json").exists())

    def test_job_service_runs_registered_matrix_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))

            job = service.submit_and_run(
                "pairwise_similarity_matrix",
                {
                    "sequences": [
                        {"id": "seq1", "sequence": "ACGT"},
                        {"id": "seq2", "sequence": "ACCT"},
                    ],
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            self.assertEqual(job.result["sequence_ids"], ["seq1", "seq2"])
            self.assertEqual(len(job.result["matrix"]), 2)

    def test_job_service_returns_standard_error_for_bad_payload(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))

            job = service.submit_and_run(
                "reference_similarity_table",
                {
                    "reference": {"id": "ref", "sequence": "ACGT"},
                },
            )

            self.assertEqual(job.status, JobStatus.FAILED)
            self.assertIsNotNone(job.error)
            self.assertEqual(job.error["code"], "TOOL_INPUT_ERROR")


if __name__ == "__main__":
    unittest.main()
