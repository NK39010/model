# Runs readable end-to-end demonstrations of registry-based tool execution.
from __future__ import annotations

from pathlib import Path
from typing import Any

from app.services.job_service import JobService
from app.tools.registry import list_tools


def main() -> None:
    service = JobService(results_root=Path("data/results"))
    pairwise_payload = {
        "sequence_a": "ATGCTAGC",
        "sequence_b": "ATGCGC",
        "match_score": 2,
        "mismatch_score": -1,
        "gap_score": -2,
    }
    reference_payload = {
        "reference": {"id": "ref", "sequence": "ATGCTAGC"},
        "targets": [
            {"id": "seq1", "sequence": "ATGCGC"},
            {"id": "seq2", "sequence": "ATGTTAGC"},
        ],
    }
    matrix_payload = {
        "sequences": [
            {"id": "seq1", "sequence": "ATGCTAGC"},
            {"id": "seq2", "sequence": "ATGCGC"},
            {"id": "seq3", "sequence": "ATGTTAGC"},
        ],
        "metric": "identity",
    }
    protein_payload = {
        "sequence_a": "MEEPQSDPSV",
        "sequence_b": "MEEPQSEPSI",
        "sequence_type": "protein",
        "substitution_matrix": "BLOSUM62",
        "gap_score": -10,
    }
    ncbi_lookup_payload = {
        "ids": ["NM_007294"],
        "email": "demo@example.com",
    }

    pairwise_job = service.submit_and_run("pairwise_alignment", pairwise_payload)
    reference_job = service.submit_and_run("reference_similarity_table", reference_payload)
    matrix_job = service.submit_and_run("pairwise_similarity_matrix", matrix_payload)
    protein_job = service.submit_and_run("pairwise_alignment", protein_payload)
    ncbi_lookup_job = service.submit_and_run("ncbi_refseq_lookup", ncbi_lookup_payload)

    print("Available tools")
    for tool in list_tools():
        print(f"- {tool['name']} v{tool['version']}")
    print()

    for job in [pairwise_job, reference_job, matrix_job, protein_job, ncbi_lookup_job]:
        print_job_output(job)
        print()


def print_job_output(job: Any) -> None:
    print(f"[{job.status}] {job.tool_name}")
    print(f"job_id: {job.id}")
    print(f"workdir: {job.workdir}")

    if job.error:
        print(f"error: {job.error}")
        return

    if job.tool_name == "pairwise_alignment":
        print_pairwise_result(job.result)
    elif job.tool_name == "reference_similarity_table":
        print_reference_table(job.result)
    elif job.tool_name == "pairwise_similarity_matrix":
        print_similarity_matrix(job.result)
    elif job.tool_name == "ncbi_refseq_lookup":
        print_ncbi_lookup(job.result)
    else:
        print(f"result: {job.result}")

    print_result_files(Path(job.workdir))


def print_pairwise_result(result: dict[str, Any]) -> None:
    print(result["aligned_sequence_a"])
    print(match_line(result["aligned_sequence_a"], result["aligned_sequence_b"]))
    print(result["aligned_sequence_b"])
    print(
        "score={score} identity={identity:.4f} similarity={similarity:.4f} gaps={gap_count}".format(
            **result
        )
    )


def print_reference_table(result: dict[str, Any]) -> None:
    print(f"reference: {result['reference_id']}")
    print("target_id\tscore\tidentity\tsimilarity\tgaps\tmismatches")
    for row in result["rows"]:
        print(
            "{target_id}\t{score}\t{identity:.4f}\t{similarity:.4f}\t{gap_count}\t{mismatch_count}".format(
                **row
            )
        )


def print_similarity_matrix(result: dict[str, Any]) -> None:
    sequence_ids = result["sequence_ids"]
    print(f"metric: {result['metric']}")
    print("\t" + "\t".join(sequence_ids))
    for sequence_id, row in zip(sequence_ids, result["matrix"], strict=True):
        values = "\t".join(f"{value:.4f}" if isinstance(value, float) else str(value) for value in row)
        print(f"{sequence_id}\t{values}")


def print_ncbi_lookup(result: dict[str, Any]) -> None:
    print(f"record_count: {result['record_count']}")
    for record in result["records"]:
        print(f"- {record['id']} {record['description']}")
        print(f"  organism: {record['organism']}")
        print(f"  length: {record['sequence_length']}")
        print(f"  features: {len(record['features'])}")


def print_result_files(workdir: Path) -> None:
    files = sorted(path.name for path in workdir.iterdir() if path.is_file())
    print("files:")
    for file_name in files:
        print(f"- {workdir / file_name}")


def match_line(sequence_a: str, sequence_b: str) -> str:
    return "".join("|" if a == b else " " for a, b in zip(sequence_a, sequence_b, strict=True))


if __name__ == "__main__":
    main()
