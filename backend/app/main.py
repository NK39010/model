# Starts the backend HTTP server and mounts the API request handler.
from __future__ import annotations

import socket
import sys
from http.server import ThreadingHTTPServer

from app.api.handlers import BioToolRequestHandler
from app.core.config import DEFAULT_HOST, DEFAULT_PORT, PORT_SEARCH_LIMIT


def main() -> None:
    host = DEFAULT_HOST
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
        return DEFAULT_PORT

    try:
        return int(sys.argv[1])
    except ValueError:
        print(f"Invalid port {sys.argv[1]!r}; using {DEFAULT_PORT} instead.")
        return DEFAULT_PORT


def _find_available_port(host: str, start_port: int) -> int:
    for port in range(start_port, start_port + PORT_SEARCH_LIMIT):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind((host, port))
            except OSError:
                continue
            return port

    raise OSError(f"No available port found from {start_port} to {start_port + PORT_SEARCH_LIMIT - 1}.")


if __name__ == "__main__":
    main()
