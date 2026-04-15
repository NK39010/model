# Handles HTTP routes for tool discovery, job submission, and job lookup.
from __future__ import annotations

import json
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler
from typing import Any
from urllib.parse import urlparse

from app.core.config import RESULTS_ROOT
from app.services.job_service import JobService
from app.tools.registry import list_tools
from app.web.pages import load_index_html


JOB_SERVICE = JobService(results_root=RESULTS_ROOT)


class BioToolRequestHandler(BaseHTTPRequestHandler):
    server_version = "BioToolExample/0.1"

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/":
            self._send_html(load_index_html())
            return

        if path == "/api/tools":
            self._send_json({"tools": list_tools()})
            return

        if path.startswith("/api/jobs/"):
            job_id = path.removeprefix("/api/jobs/").strip("/")
            job = JOB_SERVICE.get_job(job_id)
            if job is None:
                self._send_json({"error": f"Unknown job: {job_id}"}, HTTPStatus.NOT_FOUND)
                return
            self._send_json(asdict(job))
            return

        self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)

    def do_POST(self) -> None:
        path = urlparse(self.path).path

        if path != "/api/jobs":
            self._send_json({"error": "Not found"}, HTTPStatus.NOT_FOUND)
            return

        try:
            request = self._read_json()
            tool_name = request["tool_name"]
            payload = request["payload"]
        except (KeyError, json.JSONDecodeError):
            self._send_json(
                {"error": "Request body must contain tool_name and payload."},
                HTTPStatus.BAD_REQUEST,
            )
            return

        job = JOB_SERVICE.submit_and_run(tool_name, payload)
        self._send_json(asdict(job), HTTPStatus.CREATED)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} - {format % args}")

    def _read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw_body = self.rfile.read(length).decode("utf-8")
        return json.loads(raw_body)

    def _send_json(self, data: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(data, indent=2, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _send_html(self, html: str, status: HTTPStatus = HTTPStatus.OK) -> None:
        body = html.encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
