# Orchestrates tool execution, job state, work directories, and standard result files.
from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
import re
from typing import Any
from uuid import uuid4

from app.schemas.common import JobStatus
from app.services.file_service import read_json, write_json
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
        """Return a job from memory or its persisted job record."""
        if re.fullmatch(r"job_[0-9a-f]{12}", job_id) is None:
            return None
        cached = self.jobs.get(job_id)
        if cached is not None:
            return cached

        job_path = self.results_root / job_id / "job.json"
        if not job_path.is_file():
            return None
        try:
            data = read_json(job_path)
            job = JobRecord(**data)
        except (OSError, TypeError, ValueError):
            return None
        self.jobs[job_id] = job
        return job

    @staticmethod
    def _now() -> str:
        return datetime.now(UTC).isoformat()
