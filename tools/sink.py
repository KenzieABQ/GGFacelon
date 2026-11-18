#!/usr/bin/env python3
"""Dev-only receiver for tools/bench.js `upload()`: writes the posted JSON to tools/testdata/<name>.json.

    python3 tools/sink.py        # listens on http://localhost:5181 (local only)

Then, in the app's console:  const b = await import('/tools/bench.js'); await b.upload(await b.run())
"""
import json
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

OUT = Path(__file__).resolve().parent / 'testdata'


class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header('Access-Control-Allow-Origin', 'http://localhost:5180')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        name = re.sub(r'[^a-z0-9_-]', '', self.path.strip('/').lower()) or 'dump'
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        json.loads(body)  # only valid JSON is written
        OUT.mkdir(exist_ok=True)
        (OUT / f'{name}.json').write_bytes(body)
        self.send_response(200)
        self._cors()
        self.end_headers()
        self.wfile.write(b'ok')


if __name__ == '__main__':
    print('bench receiver on http://localhost:5181 → tools/testdata/')
    ThreadingHTTPServer(('127.0.0.1', 5181), Handler).serve_forever()
