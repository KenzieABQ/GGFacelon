#!/usr/bin/env python3
"""Local server for GGFacelon. Same as `python3 -m http.server`, but tells the browser not to cache,
so ES modules always reload after an update (otherwise the browser can keep running old scoring code).

    python3 serve.py            # http://localhost:5180
    python3 serve.py 8000       # another port
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5180
    root = Path(__file__).resolve().parent
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(NoCacheHandler, directory=str(root)))
    print(f"GGFacelon on http://localhost:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
