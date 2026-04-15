# Verifies alignment runners for pairwise, table, and matrix outputs.
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.tools.alignment.runner import (
    PairwiseAlignmentRunner,
    PairwiseSimilarityMatrixRunner,
    ReferenceSimilarityTableRunner,
)


class PairwiseAlignmentRunnerTest(unittest.TestCase):
    def test_pairwise_alignment_runner_writes_standard_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = PairwiseAlignmentRunner()
            payload = {
                "sequence_a": "ATGCTAGC",
                "sequence_b": "ATGCGC",
                "match_score": 2,
                "mismatch_score": -1,
                "gap_score": -2,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["score"], 8)
            self.assertEqual(result["identity"], 0.75)
            self.assertEqual(result["alignment_length"], 8)
            self.assertEqual(result["gap_count"], 2)
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "alignment.txt").exists())

    def test_pairwise_alignment_runner_supports_protein_sequences(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = PairwiseAlignmentRunner()
            payload = {
                "sequence_a": "MEEPQSDPSV",
                "sequence_b": "MEEPQSEPSI",
                "sequence_type": "protein",
                "substitution_matrix": "BLOSUM62",
                "gap_score": -10,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["alignment_length"], 10)
            self.assertGreater(result["score"], 0)
            self.assertGreaterEqual(result["similarity"], result["identity"])
            self.assertTrue((workdir / "result.json").exists())

    def test_pairwise_alignment_runner_accepts_two_fasta_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = PairwiseAlignmentRunner()
            payload = {
                "fasta_a": ">protein_a\nMEEPQSDPSV\n",
                "fasta_b": ">protein_b\nMEEPQSEPSI\n",
                "sequence_type": "protein",
                "substitution_matrix": "BLOSUM62",
                "gap_score": -10,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["alignment_length"], 10)
            self.assertGreater(result["score"], 0)
            self.assertTrue((workdir / "alignment.txt").exists())

    def test_reference_similarity_table_runner_writes_table_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = ReferenceSimilarityTableRunner()
            payload = {
                "reference": {"id": "ref", "sequence": "ATGCTAGC"},
                "targets": [
                    {"id": "seq1", "sequence": "ATGCGC"},
                    {"id": "seq2", "sequence": "ATGTTAGC"},
                ],
                "scoring": {
                    "match_score": 2,
                    "mismatch_score": -1,
                    "gap_score": -2,
                },
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["reference_id"], "ref")
            self.assertEqual(result["target_count"], 2)
            self.assertFalse(result["include_alignments"])
            self.assertEqual(len(result["rows"]), 2)
            self.assertEqual(result["rows"][0]["target_id"], "seq1")
            self.assertIn("identity", result["rows"][0])
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "similarity_table.csv").exists())

    def test_reference_similarity_table_runner_can_include_alignments(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = ReferenceSimilarityTableRunner()
            payload = {
                "reference": {"id": "ref", "sequence": "MEEPQSDPSV"},
                "targets": [{"id": "target_1", "sequence": "MEEPQSEPSI"}],
                "include_alignments": True,
                "sequence_type": "protein",
                "substitution_matrix": "BLOSUM62",
                "gap_score": -10,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertTrue(result["include_alignments"])
            self.assertEqual(result["target_count"], 1)
            self.assertEqual(result["rows"][0]["aligned_reference"], "MEEPQSDPSV")
            self.assertEqual(result["rows"][0]["aligned_target"], "MEEPQSEPSI")
            self.assertIn("alignment_match_line", result["rows"][0])

    def test_reference_similarity_table_runner_accepts_two_fasta_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = ReferenceSimilarityTableRunner()
            payload = {
                "reference_fasta": ">ref\nMEEPQSDPSV\n",
                "targets_fasta": ">target_1\nMEEPQSEPSI\n>target_2\nMEEPQSGLSV\n",
                "sequence_type": "protein",
                "substitution_matrix": "BLOSUM62",
                "gap_score": -10,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["reference_id"], "ref")
            self.assertEqual(result["target_count"], 2)
            self.assertEqual(result["rows"][0]["target_id"], "target_1")
            self.assertTrue((workdir / "similarity_table.csv").exists())

    def test_pairwise_similarity_matrix_runner_writes_heatmap_outputs(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = PairwiseSimilarityMatrixRunner()
            payload = {
                "sequences": [
                    {"id": "seq1", "sequence": "ATGCTAGC"},
                    {"id": "seq2", "sequence": "ATGCGC"},
                    {"id": "seq3", "sequence": "ATGTTAGC"},
                ],
                "metric": "identity",
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["sequence_ids"], ["seq1", "seq2", "seq3"])
            self.assertEqual(result["metric"], "identity")
            self.assertEqual(len(result["matrix"]), 3)
            self.assertEqual(result["matrix"][0][0], 1.0)
            self.assertEqual(result["matrix"][0][1], result["matrix"][1][0])
            self.assertEqual(len(result["long_table"]), 3)
            self.assertEqual(result["heatmap"]["x_labels"], ["seq1", "seq2", "seq3"])
            self.assertTrue((workdir / "result.json").exists())
            self.assertTrue((workdir / "similarity_matrix.csv").exists())
            self.assertTrue((workdir / "pairwise_table.csv").exists())

    def test_pairwise_similarity_matrix_runner_accepts_protein_fasta(self) -> None:
        with tempfile.TemporaryDirectory() as tempdir:
            workdir = Path(tempdir)
            runner = PairwiseSimilarityMatrixRunner()
            payload = {
                "fasta": ">protein_1\nMEEPQSDPSV\n>protein_2\nMEEPQSEPSI\n>protein_3\nMEEPQSGLSV\n",
                "metric": "similarity",
                "sequence_type": "protein",
                "substitution_matrix": "BLOSUM62",
                "gap_score": -10,
            }

            runner.validate_input(payload)
            result = runner.run(payload, workdir)

            self.assertEqual(result["sequence_ids"], ["protein_1", "protein_2", "protein_3"])
            self.assertEqual(result["metric"], "similarity")
            self.assertEqual(len(result["matrix"]), 3)
            self.assertEqual(result["matrix"][0][0], 1.0)
            self.assertGreaterEqual(result["matrix"][0][1], 0.8)
            self.assertTrue((workdir / "similarity_matrix.csv").exists())


if __name__ == "__main__":
    unittest.main()
