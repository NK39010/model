# Verifies NCBI BLAST runner behavior with mocked remote calls.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.schemas.common import JobStatus
from app.services.job_service import JobService
from app.tools.blast.runner import NCBIBlastLookupRunner
from app.tools.errors import ToolInputError


FAKE_BLAST_XML = """\
<?xml version="1.0"?>
<BlastOutput>
  <BlastOutput_program>blastn</BlastOutput_program>
  <BlastOutput_db>nt</BlastOutput_db>
  <BlastOutput_iterations>
    <Iteration>
      <Iteration_query-def>query_1</Iteration_query-def>
      <Iteration_query-len>12</Iteration_query-len>
      <Iteration_hits>
        <Hit>
          <Hit_id>gnl|BL_ORD_ID|0</Hit_id>
          <Hit_def>Homo sapiens chromosome segment</Hit_def>
          <Hit_accession>NM_000000</Hit_accession>
          <Hit_len>1200</Hit_len>
          <Hit_hsps>
            <Hsp>
              <Hsp_bit-score>45.6</Hsp_bit-score>
              <Hsp_score>23</Hsp_score>
              <Hsp_evalue>1e-20</Hsp_evalue>
              <Hsp_query-from>1</Hsp_query-from>
              <Hsp_query-to>12</Hsp_query-to>
              <Hsp_hit-from>101</Hsp_hit-from>
              <Hsp_hit-to>112</Hsp_hit-to>
              <Hsp_identity>11</Hsp_identity>
              <Hsp_gaps>0</Hsp_gaps>
              <Hsp_align-len>12</Hsp_align-len>
            </Hsp>
          </Hit_hsps>
        </Hit>
        <Hit>
          <Hit_id>gnl|BL_ORD_ID|1</Hit_id>
          <Hit_def>Mus musculus genomic fragment</Hit_def>
          <Hit_accession>XM_111111</Hit_accession>
          <Hit_len>980</Hit_len>
          <Hit_hsps>
            <Hsp>
              <Hsp_bit-score>30.0</Hsp_bit-score>
              <Hsp_score>15</Hsp_score>
              <Hsp_evalue>4e-8</Hsp_evalue>
              <Hsp_query-from>1</Hsp_query-from>
              <Hsp_query-to>10</Hsp_query-to>
              <Hsp_hit-from>44</Hsp_hit-from>
              <Hsp_hit-to>53</Hsp_hit-to>
              <Hsp_identity>9</Hsp_identity>
              <Hsp_gaps>1</Hsp_gaps>
              <Hsp_align-len>10</Hsp_align-len>
            </Hsp>
          </Hit_hsps>
        </Hit>
      </Iteration_hits>
    </Iteration>
  </BlastOutput_iterations>
</BlastOutput>
"""


class BlastRunnerTest(unittest.TestCase):
    @patch("app.tools.blast.runner._run_qblast", return_value=FAKE_BLAST_XML)
    def test_blast_runner_parses_hits(self, _mock_qblast) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = NCBIBlastLookupRunner()
            payload = {
                "sequence": "ATGCATGCATGC",
                "email": "test@example.com",
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["program"], "blastn")
            self.assertEqual(result["database"], "nt")
            self.assertEqual(result["hit_count"], 2)
            self.assertEqual(result["hits"][0]["accession"], "NM_000000")
            self.assertAlmostEqual(result["hits"][0]["best_hsp"]["identity_pct"], 11 / 12)
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "blast.xml").exists())

    def test_blast_requires_email(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            runner = NCBIBlastLookupRunner()
            payload = {"sequence": "ATGCATGCATGC"}

            with patch.dict("os.environ", {}, clear=True):
                with self.assertRaises(ToolInputError):
                    runner.run(payload, Path(tempdir))

    @patch("app.tools.blast.runner._run_qblast", return_value=FAKE_BLAST_XML)
    def test_job_service_runs_registered_blast_tool(self, _mock_qblast) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            service = JobService(results_root=Path(tempdir))
            job = service.submit_and_run(
                "ncbi_blast_lookup",
                {
                    "sequence": "ATGCATGCATGC",
                    "email": "test@example.com",
                    "max_hits": 10,
                },
            )

            self.assertEqual(job.status, JobStatus.COMPLETED)
            self.assertIsNotNone(job.result)
            assert job.result is not None
            self.assertEqual(job.result["hit_count"], 2)


if __name__ == "__main__":
    unittest.main()
