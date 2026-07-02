# Runs IQ-TREE phylogenetic inference jobs.
from __future__ import annotations

import subprocess
from pathlib import Path
from typing import Any

from app.services.file_service import write_json, write_text
from app.services.process_service import run_process
from app.tools.base import ToolRunner
from app.tools.errors import ToolExecutionError
from app.tools.iqtree.parser import parse_iqtree_report, parse_iqtree_result, summarize_newick
from app.tools.iqtree.resolver import resolve_iqtree_binary
from app.tools.iqtree.schemas import IqtreeInput


class IqtreePhylogenyRunner(ToolRunner):
    """Infer a phylogenetic tree from an aligned FASTA with IQ-TREE."""

    name = "iqtree_phylogeny"
    version = "1.0.0"

    def validate_input(self, payload: dict[str, Any]) -> None:
        IqtreeInput.from_payload(payload)

    def run(self, payload: dict[str, Any], workdir: Path) -> dict[str, Any]:
        data = IqtreeInput.from_payload(payload)
        binary = resolve_iqtree_binary()
        input_path = workdir / "input.fasta"
        write_text(input_path, _records_to_fasta(data))

        thread_count_used = _thread_count_used(binary.path, data)
        command = _command(binary.path, data, input_path, thread_count_used)
        try:
            completed = run_process(
                command,
                cwd=workdir,
                text=True,
                capture_output=True,
                timeout=3600,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise ToolExecutionError("IQ-TREE execution failed.", {"reason": str(exc)}) from exc

        write_text(workdir / "iqtree.stdout.txt", completed.stdout or "")
        write_text(workdir / "iqtree.stderr.txt", completed.stderr or "")
        if completed.returncode != 0:
            raise ToolExecutionError(
                "IQ-TREE returned a non-zero exit code.",
                {"returncode": completed.returncode, "stderr": (completed.stderr or "")[-2000:]},
            )

        tree_path = workdir / "result.treefile"
        report_path = workdir / "result.iqtree"
        if not tree_path.exists():
            raise ToolExecutionError("IQ-TREE did not produce result.treefile.")

        newick = tree_path.read_text(encoding="utf-8").strip()
        report_text = report_path.read_text(encoding="utf-8") if report_path.exists() else ""
        report = parse_iqtree_report(report_text)
        sequence_count = len(data.records)
        alignment_length = len(data.records[0].sequence)
        files = {
            "json": "result.json",
            "input_fasta": "input.fasta",
            "treefile": "result.treefile",
            "stdout": "iqtree.stdout.txt",
            "stderr": "iqtree.stderr.txt",
        }
        for label, file_name in {
            "report": "result.iqtree",
            "log": "result.log",
            "consensus_tree": "result.contree",
            "ufboot": "result.ufboot",
        }.items():
            if (workdir / file_name).exists():
                files[label] = file_name
        result = {
            "tool": self.name,
            "sequence_type": data.sequence_type,
            "model_mode": data.model_mode,
            "model_requested": data.model,
            "iqtree_model": data.iqtree_model,
            "best_model": report["best_model"],
            "log_likelihood": report["log_likelihood"],
            "bootstrap_enabled": data.bootstrap_enabled,
            "bootstrap_replicates": data.bootstrap_replicates,
            "alrt_enabled": data.alrt_enabled,
            "alrt_replicates": data.alrt_replicates,
            "thread_mode": data.thread_mode,
            "thread_count": thread_count_used,
            "random_seed": data.random_seed,
            "sequence_count": sequence_count,
            "alignment_length": alignment_length,
            "newick": newick,
            "tree_summary": summarize_newick(newick),
            "command": [str(part) for part in command],
            "iqtree_binary": str(binary.path),
            "iqtree_binary_source": binary.source,
            "files": files,
        }
        write_json(workdir / "result.json", result)
        return self.parse_result(workdir)

    def parse_result(self, workdir: Path) -> dict[str, Any]:
        return parse_iqtree_result(workdir / "result.json")


def _command(binary: Path, data: IqtreeInput, input_path: Path, thread_count_used: int | str) -> list[str]:
    command = [
        str(binary),
        "-s",
        str(input_path),
        "-m",
        data.iqtree_model,
        "-T",
        str(thread_count_used),
        "-pre",
        "result",
    ]
    if data.bootstrap_enabled:
        command.extend(["-B", str(data.bootstrap_replicates)])
    if data.alrt_enabled:
        command.extend(["-alrt", str(data.alrt_replicates)])
    if data.random_seed is not None:
        command.extend(["-seed", str(data.random_seed)])
    return command


def _thread_count_used(binary: Path, data: IqtreeInput) -> int | str:
    if _is_single_core_binary(binary):
        return 1
    return "AUTO" if data.thread_mode == "auto" else data.thread_count


def _is_single_core_binary(binary: Path) -> bool:
    try:
        completed = subprocess.run(
            [str(binary), "--version"],
            text=True,
            capture_output=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return False

    version_text = f"{completed.stdout}\n{completed.stderr}".lower()
    return "single-core" in version_text or "single core" in version_text


def _records_to_fasta(data: IqtreeInput) -> str:
    lines: list[str] = []
    for record in data.records:
        lines.append(f">{record.name}")
        for start in range(0, len(record.sequence), 80):
            lines.append(record.sequence[start : start + 80])
    return "\n".join(lines) + "\n"
