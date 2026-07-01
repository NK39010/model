# Verifies MAFFT input validation, mode selection, and runner outputs.
from __future__ import annotations

import subprocess
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import Mock, patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.mafft.resolver import MafftBinary
from app.tools.mafft.runner import MafftAlignmentRunner
from app.tools.mafft.schemas import MafftAlignmentInput
from app.tools.registry import list_tools


class MafftAlignmentRunnerTest(unittest.TestCase):
    def test_default_mode_is_auto(self) -> None:
        data = MafftAlignmentInput.from_payload(
            {
                "records": [
                    {"name": "seq1", "sequence": "ATGC"},
                    {"name": "seq2", "sequence": "ATGA"},
                ]
            }
        )

        self.assertEqual(data.mode, "auto")

    def test_mode_aliases_are_supported(self) -> None:
        data = MafftAlignmentInput.from_payload(
            {
                "mode": "G-INS-i",
                "records": [
                    {"name": "seq1", "sequence": "ATGC"},
                    {"name": "seq2", "sequence": "ATGA"},
                ],
            }
        )

        self.assertEqual(data.mode, "ginsi")

    def test_invalid_mode_is_rejected(self) -> None:
        runner = MafftAlignmentRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "mode": "unknown",
                    "records": [
                        {"name": "seq1", "sequence": "ATGC"},
                        {"name": "seq2", "sequence": "ATGA"},
                    ],
                }
            )

    def test_runner_executes_auto_mode_and_writes_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = MafftAlignmentRunner()

            with _mock_mafft(">seq1\nATG-C\n>seq2\nAT-AC\n") as run_mock:
                result = runner.run(
                    {
                        "records": [
                            {"name": "seq1", "sequence": "ATGC"},
                            {"name": "seq2", "sequence": "ATAC"},
                        ]
                    },
                    workdir,
                )

            command = run_mock.call_args.args[0]
            self.assertIn("--auto", command)
            self.assertEqual(result["mode"], "auto")
            self.assertEqual(result["mode_label"], "Auto")
            self.assertEqual(result["sequence_count"], 2)
            self.assertEqual(result["alignment_length"], 5)
            self.assertTrue((workdir / "input.fasta").exists())
            self.assertTrue((workdir / "aligned.fasta").exists())
            self.assertTrue((workdir / "result.json").exists())

    def test_runner_executes_ginsi_mode(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = MafftAlignmentRunner()

            with _mock_mafft(">seq1\nATGC\n>seq2\nATGA\n") as run_mock:
                result = runner.run(
                    {
                        "mode": "ginsi",
                        "records": [
                            {"name": "seq1", "sequence": "ATGC"},
                            {"name": "seq2", "sequence": "ATGA"},
                        ],
                    },
                    Path(tempdir),
                )

            command = run_mock.call_args.args[0]
            self.assertIn("--globalpair", command)
            self.assertIn("--maxiterate", command)
            self.assertEqual(result["mode_label"], "G-INS-i")

    def test_job_service_runs_registered_mafft_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))

            with _mock_mafft(">seq1\nATGC\n>seq2\nATGA\n"):
                job = service.submit_and_run(
                    "mafft_alignment",
                    {
                        "records": [
                            {"name": "seq1", "sequence": "ATGC"},
                            {"name": "seq2", "sequence": "ATGA"},
                        ]
                    },
                )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["mode"], "auto")

    def test_mafft_alignment_is_listed(self) -> None:
        self.assertIn("mafft_alignment", {tool["name"] for tool in list_tools()})


@contextmanager
def _mock_mafft(stdout: str):
    binary = MafftBinary(path=Path("/usr/bin/mafft"), version="7.526", source="system")
    completed = subprocess.CompletedProcess(args=["mafft"], returncode=0, stdout=stdout, stderr="")
    run_mock = Mock(return_value=completed)
    subprocess_mock = Mock(run=run_mock, TimeoutExpired=subprocess.TimeoutExpired)
    with patch("app.tools.mafft.runner.resolve_mafft_binary", Mock(return_value=binary)):
        with patch("app.tools.mafft.runner.subprocess", subprocess_mock):
            yield run_mock


if __name__ == "__main__":
    unittest.main()
