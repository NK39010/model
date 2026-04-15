# Verifies NCBI Entrez runners with mocked Biopython network calls.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.errors import ToolInputError
from app.tools.ncbi.runner import NCBIRefSeqLookupRunner


class FakeHandle:
    def __init__(self, text: str = ""):
        self.text = text

    def __enter__(self) -> "FakeHandle":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        return None

    def read(self) -> str:
        return self.text


class FakeEntrez:
    email = None
    tool = None

    @staticmethod
    def efetch(db: str, id: str, rettype: str, retmode: str):
        return FakeHandle(
            """
LOCUS       NM_000000                 12 bp    DNA     linear   PRI 01-JAN-2000
DEFINITION  fake Homo sapiens record.
ACCESSION   NM_000000
VERSION     NM_000000.1
KEYWORDS    .
SOURCE      Homo sapiens
  ORGANISM  Homo sapiens
            Eukaryota; Metazoa.
FEATURES             Location/Qualifiers
     source          1..12
                     /organism="Homo sapiens"
                     /mol_type="mRNA"
     CDS             1..12
                     /gene="FAKE"
                     /product="fake protein"
ORIGIN
        1 atgcatgcatgc
//
""".lstrip()
        )


class NCBIRunnerTest(unittest.TestCase):
    @patch("app.tools.ncbi.runner._configure_entrez", return_value=FakeEntrez)
    def test_ncbi_refseq_lookup_runner_parses_complete_records(self, _mock_configure) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = NCBIRefSeqLookupRunner()
            payload = {
                "ids": ["NM_000000"],
                "email": "test@example.com",
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["record_count"], 1)
            self.assertEqual(result["records"][0]["id"], "NM_000000.1")
            self.assertEqual(result["records"][0]["organism"], "Homo sapiens")
            self.assertEqual(result["records"][0]["sequence_length"], 12)
            self.assertGreaterEqual(len(result["records"][0]["features"]), 2)
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "nucleotide_records.gb").exists())

    def test_ncbi_requires_email(self) -> None:
        runner = NCBIRefSeqLookupRunner()
        payload = {
            "ids": ["NM_000000"],
        }

        with self.assertRaises(ToolInputError):
            runner.run(payload, Path(tempfile.mkdtemp()))

    @patch("app.tools.ncbi.runner._configure_entrez", return_value=FakeEntrez)
    def test_job_service_runs_registered_ncbi_lookup_tool(self, _mock_configure) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "ncbi_refseq_lookup",
                {
                    "ids": ["NM_000000"],
                    "email": "test@example.com",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            self.assertEqual(job.result["record_count"], 1)


if __name__ == "__main__":
    unittest.main()
