# Verifies FASTA generation from manual records and two-column tables.
from __future__ import annotations

import base64
import tempfile
import unittest
from io import BytesIO
from pathlib import Path

from openpyxl import Workbook

from app.api.handlers import _content_type
from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.fasta_generator.runner import FastaGeneratorRunner
from app.tools.registry import list_tools


class FastaGeneratorRunnerTest(unittest.TestCase):
    def test_manual_records_generate_fasta(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = FastaGeneratorRunner()
            result = runner.run(
                {
                    "mode": "manual",
                    "records": [
                        {"name": "gene A", "sequence": "atgc gt"},
                        {"name": "gene B", "sequence": "NNNN"},
                    ],
                    "sequence_type": "dna",
                },
                Path(tempdir),
            )

            self.assertEqual(result["record_count"], 2)
            self.assertIn(">gene_A\nATGCGT", result["fasta"])
            self.assertTrue((Path(tempdir) / "output.fasta").exists())
            self.assertTrue((Path(tempdir) / "records.csv").exists())

    def test_manual_records_can_disable_wrapping(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = FastaGeneratorRunner()
            result = runner.run(
                {
                    "mode": "manual",
                    "records": [{"name": "long", "sequence": "ATGC" * 30}],
                    "sequence_type": "dna",
                    "wrap_length": None,
                },
                Path(tempdir),
            )

            self.assertEqual(result["wrap_length"], None)
            self.assertIn(">long\n" + "ATGC" * 30 + "\n", result["fasta"])

    def test_csv_table_uses_first_two_columns_and_deduplicates_names(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = FastaGeneratorRunner()
            result = runner.run(
                {
                    "mode": "table",
                    "file_name": "records.csv",
                    "file_data_url": _data_url("name,sequence\nseq1,ATGC\nseq1,ATGA\n".encode("utf-8")),
                    "sequence_type": "dna",
                },
                Path(tempdir),
            )

            self.assertEqual([record["name"] for record in result["records"]], ["seq1", "seq1_2"])
            self.assertIn(">seq1_2\nATGA", result["fasta"])

    def test_xlsx_table_generates_fasta(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = FastaGeneratorRunner()
            result = runner.run(
                {
                    "mode": "table",
                    "file_name": "records.xlsx",
                    "file_data_url": _data_url(_xlsx_bytes()),
                    "sequence_type": "protein",
                },
                Path(tempdir),
            )

            self.assertEqual(result["record_count"], 2)
            self.assertIn(">protein_1\nMEEPQSDPSV", result["fasta"])

    def test_strict_mode_rejects_invalid_characters(self) -> None:
        runner = FastaGeneratorRunner()
        with self.assertRaises(ToolInputError):
            runner.validate_input(
                {
                    "mode": "manual",
                    "records": [{"name": "bad", "sequence": "ATGB"}],
                    "sequence_type": "dna",
                    "strict": True,
                }
            )

    def test_job_service_runs_registered_fasta_generator_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "fasta_generator",
                {
                    "mode": "manual",
                    "records": [{"name": "seq", "sequence": "ATGC"}],
                    "sequence_type": "dna",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["record_count"], 1)

    def test_fasta_generator_is_listed_and_fasta_content_type_is_supported(self) -> None:
        self.assertIn("fasta_generator", {tool["name"] for tool in list_tools()})
        self.assertEqual(_content_type("output.fasta"), "text/plain; charset=utf-8")


def _data_url(file_bytes: bytes) -> str:
    encoded = base64.b64encode(file_bytes).decode("ascii")
    return f"data:application/octet-stream;base64,{encoded}"


def _xlsx_bytes() -> bytes:
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["name", "sequence"])
    sheet.append(["protein 1", "MEEPQSDPSV"])
    sheet.append(["protein 2", "MEEPQSEPSI"])
    buffer = BytesIO()
    workbook.save(buffer)
    return buffer.getvalue()


if __name__ == "__main__":
    unittest.main()
