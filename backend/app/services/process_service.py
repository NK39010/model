from __future__ import annotations

import subprocess
import threading
from contextlib import contextmanager
from typing import Any, Iterator

_local = threading.local()
_lock = threading.Lock()
_processes: dict[str, subprocess.Popen[str]] = {}


@contextmanager
def job_process_context(job_id: str) -> Iterator[None]:
    previous = getattr(_local, "job_id", None)
    _local.job_id = job_id
    try:
        yield
    finally:
        _local.job_id = previous


def run_process(command: list[str], *, timeout: int, **kwargs: Any) -> subprocess.CompletedProcess[str]:
    if kwargs.pop("capture_output", False):
        kwargs["stdout"] = subprocess.PIPE
        kwargs["stderr"] = subprocess.PIPE
    process = subprocess.Popen(command, **kwargs)
    job_id = getattr(_local, "job_id", None)
    if job_id:
        with _lock:
            _processes[job_id] = process
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        process.kill()
        stdout, stderr = process.communicate()
        raise
    finally:
        if job_id:
            with _lock:
                _processes.pop(job_id, None)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr)


def terminate_job_process(job_id: str) -> bool:
    with _lock:
        process = _processes.get(job_id)
    if process is None or process.poll() is not None:
        return False
    process.terminate()
    return True
