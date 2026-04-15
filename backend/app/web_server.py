# Serves a minimal web page and JSON API for running registered bioinformatics tools.
from __future__ import annotations

import json
import socket
import sys
from dataclasses import asdict
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from app.services.job_service import JobService
from app.tools.registry import list_tools


RESULTS_ROOT = Path("data/results")
JOB_SERVICE = JobService(results_root=RESULTS_ROOT)


class BioToolRequestHandler(BaseHTTPRequestHandler):
    server_version = "BioToolExample/0.1"

    def do_GET(self) -> None:
        path = urlparse(self.path).path

        if path == "/":
            self._send_html(INDEX_HTML)
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


INDEX_HTML = """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Bio Tool Demo</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2933;
      background: #f4f7f6;
    }

    body {
      margin: 0;
    }

    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 28px 16px 44px;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 28px;
    }

    p {
      margin: 0 0 20px;
      color: #52616b;
      line-height: 1.6;
    }

    section {
      margin-top: 22px;
      padding-top: 18px;
      border-top: 1px solid #d7e0dd;
    }

    label {
      display: block;
      margin: 12px 0 6px;
      font-weight: 700;
    }

    select,
    textarea,
    button {
      box-sizing: border-box;
      width: 100%;
      border: 1px solid #9fb0aa;
      border-radius: 6px;
      font: inherit;
    }

    select,
    textarea {
      background: #ffffff;
      padding: 10px;
    }

    textarea {
      min-height: 260px;
      resize: vertical;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height: 1.45;
    }

    button {
      margin-top: 12px;
      padding: 11px 14px;
      color: #ffffff;
      background: #196f63;
      cursor: pointer;
      font-weight: 700;
    }

    button:hover {
      background: #12584f;
    }

    pre {
      overflow: auto;
      min-height: 220px;
      padding: 12px;
      border: 1px solid #bccbc6;
      border-radius: 6px;
      background: #ffffff;
      line-height: 1.45;
    }
  </style>
</head>
<body>
  <main>
    <h1>Bio Tool Demo</h1>
    <p>选择工具，编辑 JSON 参数，提交后会同步运行任务并返回结果。</p>

    <section>
      <label for="tool">工具</label>
      <select id="tool">
        <option value="pairwise_alignment">两条序列比对</option>
        <option value="reference_similarity_table">参考序列相似度表</option>
        <option value="pairwise_similarity_matrix">两两相似度矩阵</option>
        <option value="ncbi_refseq_lookup">NCBI 编号查询</option>
      </select>

      <label for="payload">输入 JSON</label>
      <textarea id="payload"></textarea>

      <button id="run">运行</button>
    </section>

    <section>
      <h2>输出</h2>
      <pre id="output">等待提交任务。</pre>
    </section>
  </main>

  <script>
    const examples = {
      pairwise_alignment: {
        sequence_a: "MEEPQSDPSV",
        sequence_b: "MEEPQSEPSI",
        sequence_type: "protein",
        substitution_matrix: "BLOSUM62",
        gap_score: -10
      },
      reference_similarity_table: {
        reference: { id: "ref", sequence: "ATGCTAGC" },
        targets: [
          { id: "seq1", sequence: "ATGCGC" },
          { id: "seq2", sequence: "ATGTTAGC" }
        ],
        scoring: {
          match_score: 2,
          mismatch_score: -1,
          gap_score: -2
        }
      },
      pairwise_similarity_matrix: {
        sequences: [
          { id: "seq1", sequence: "ATGCTAGC" },
          { id: "seq2", sequence: "ATGCGC" },
          { id: "seq3", sequence: "ATGTTAGC" }
        ],
        metric: "identity"
      },
      ncbi_refseq_lookup: {
        ids: ["NM_007294"],
        email: "your-email@example.com"
      }
    };

    const tool = document.querySelector("#tool");
    const payload = document.querySelector("#payload");
    const output = document.querySelector("#output");
    const run = document.querySelector("#run");

    function loadExample() {
      payload.value = JSON.stringify(examples[tool.value], null, 2);
    }

    tool.addEventListener("change", loadExample);
    loadExample();

    run.addEventListener("click", async () => {
      output.textContent = "运行中...";
      try {
        const response = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool_name: tool.value,
            payload: JSON.parse(payload.value)
          })
        });
        const data = await response.json();
        output.textContent = JSON.stringify(data, null, 2);
      } catch (error) {
        output.textContent = String(error);
      }
    });
  </script>
</body>
</html>
"""


def main() -> None:
    host = "127.0.0.1"
    port = _get_port()
    port = _find_available_port(host, port)
    server = ThreadingHTTPServer((host, port), BioToolRequestHandler)
    print(f"Bio tool demo server running at http://{host}:{port}")
    print("API:")
    print("  GET  /api/tools")
    print("  POST /api/jobs")
    print("  GET  /api/jobs/{job_id}")
    server.serve_forever()


def _get_port() -> int:
    if len(sys.argv) < 2:
        return 8000

    try:
        return int(sys.argv[1])
    except ValueError:
        print(f"Invalid port {sys.argv[1]!r}; using 8000 instead.")
        return 8000


def _find_available_port(host: str, start_port: int) -> int:
    for port in range(start_port, start_port + 20):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port

    raise OSError(f"No available port found from {start_port} to {start_port + 19}.")


if __name__ == "__main__":
    main()
