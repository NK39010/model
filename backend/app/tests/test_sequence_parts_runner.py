# Verifies GenBank parsing into ordered parts with inferred linkers.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.sequence_parts.runner import SequencePartsParseRunner


GENBANK_TEXT = """
LOCUS       demo_plasmid              60 bp    DNA     circular SYN 01-JAN-2026
DEFINITION  demo plasmid.
ACCESSION   DEMO0001
VERSION     DEMO0001.1
FEATURES             Location/Qualifiers
     source          1..60
                     /organism="synthetic construct"
     promoter        1..10
                     /label="P_demo"
     CDS             21..40
                     /label="demo_cds"
     terminator      51..60
                     /label="T_demo"
ORIGIN
        1 aaaaaaaaaa cccccccccc atgatgatga tgatgatgat gggggggggg tttttttttt
//
""".lstrip()


class SequencePartsRunnerTest(unittest.TestCase):
    def test_sequence_parts_parse_runner_infers_linkers(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = SequencePartsParseRunner()
            payload = {
                "file_text": GENBANK_TEXT,
                "format": "genbank",
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["record_id"], "DEMO0001.1")
            self.assertEqual(result["topology"], "circular")
            self.assertEqual(result["sequence_length"], 60)
            self.assertEqual([part["type"] for part in result["parts"]], [
                "promoter",
                "linker",
                "cds",
                "linker",
                "terminator",
            ])
            self.assertEqual(result["parts"][1]["length"], 10)
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "parts.json").exists())
            self.assertTrue((workdir / "source.gb").exists())

    def test_job_service_runs_registered_sequence_parts_tool(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "sequence_parts_parse",
                {
                    "file_text": GENBANK_TEXT,
                    "format": "genbank",
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            self.assertEqual(job.result["part_count"], 5)


if __name__ == "__main__":
    unittest.main()
