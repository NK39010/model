# Orchestrates tool execution, job state, work directories, and standard result files.
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.schemas.common import JobStatus
from app.services.file_service import write_json
from app.tools.errors import ToolError
from app.tools.registry import get_tool_runner


@dataclass
class JobRecord:
    id: str
    tool_name: str
    status: JobStatus
    workdir: str
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    result: dict[str, Any] | None = None
    error: dict[str, Any] | None = None


class JobService:
    """Tiny in-process job service for demonstrating integration boundaries."""

    def __init__(self, results_root: Path):
        self.results_root = results_root
        self.results_root.mkdir(parents=True, exist_ok=True)
        self.jobs: dict[str, JobRecord] = {}

    def submit_and_run(self, tool_name: str, payload: dict[str, Any]) -> JobRecord:
        """Create a job, run it synchronously, and store the standard job record."""
        job_id = f"job_{uuid4().hex[:12]}"
        workdir = self.results_root / job_id
        workdir.mkdir(parents=True, exist_ok=False)

        job = JobRecord(
            id=job_id,
            tool_name=tool_name,
            status=JobStatus.PENDING,
            workdir=str(workdir),
            created_at=self._now(),
        )
        self.jobs[job_id] = job
        write_json(workdir / "job.json", asdict(job))
        write_json(workdir / "input.json", payload)

        try:
            runner = get_tool_runner(tool_name)
            runner.validate_input(payload)

            job.status = JobStatus.RUNNING
            job.started_at = self._now()
            write_json(workdir / "job.json", asdict(job))

            result = runner.run(payload, workdir)

            job.status = JobStatus.COMPLETED
            job.result = result
            job.finished_at = self._now()
        except ToolError as exc:
            job.status = JobStatus.FAILED
            job.error = exc.to_dict()
            job.finished_at = self._now()
        except Exception as exc:
            job.status = JobStatus.FAILED
            job.error = {
                "code": "UNEXPECTED_ERROR",
                "message": str(exc),
                "details": {},
            }
            job.finished_at = self._now()

        write_json(workdir / "job.json", asdict(job))
        return job

    def get_job(self, job_id: str) -> JobRecord | None:
        """Return a previously submitted job from memory."""
        return self.jobs.get(job_id)

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()
