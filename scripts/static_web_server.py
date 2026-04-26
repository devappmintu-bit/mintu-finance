#!/usr/bin/env python3
"""Round 51 — Static web server for the MintU production export.

Serves /app/frontend/dist/ on port 3000 with:
  • SPA-style fallback to <route>.html or index.html for unknown paths
  • Aggressive cache for hashed JS/CSS assets (max-age=31536000, immutable)
  • No-cache for index.html so deploys are picked up immediately
  • gzip on-the-fly for text resources

Replaces the Metro dev server (`expo start --tunnel`) for the web preview
path. Native Expo Go clients can still hit Metro on a different port if
ever needed.

Run via supervisor (see /etc/supervisor/conf.d/supervisord_static_web.conf).
"""
import gzip
import io
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

DIST = Path('/app/frontend/dist')
PORT = 3000
HOST = '0.0.0.0'

# Hashed-asset detection: filenames like "entry-fd200ae4dc9e67f6fa976206ecd44cf9.js"
HASHED_RE = re.compile(r'-[a-f0-9]{16,}\.(js|css|png|jpg|jpeg|gif|svg|woff2?|ttf|otf)$', re.I)
GZIP_TYPES = {'application/javascript', 'text/javascript', 'text/css', 'text/html',
              'application/json', 'image/svg+xml', 'text/plain'}

CONTENT_TYPES = {
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.txt': 'text/plain; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
}


class StaticHandler(BaseHTTPRequestHandler):
    server_version = 'MintU-Static/1.0'

    def log_message(self, fmt, *args):
        # Quiet log; stdout only on errors.
        pass

    def _safe_path(self, raw_path: str) -> Path | None:
        """Resolve raw URL path to a file inside DIST. Prevents traversal."""
        rel = unquote(urlparse(raw_path).path).lstrip('/')
        candidate = (DIST / rel).resolve()
        try:
            candidate.relative_to(DIST.resolve())
        except ValueError:
            return None
        return candidate

    def _send_file(self, fp: Path, status: int = 200) -> None:
        try:
            data = fp.read_bytes()
        except OSError:
            self.send_error(404)
            return

        ext = fp.suffix.lower()
        ctype = CONTENT_TYPES.get(ext, 'application/octet-stream')
        is_hashed = bool(HASHED_RE.search(fp.name))
        is_index = fp.name == 'index.html' or ext == '.html'

        body = data
        encoding = None
        if (ctype.split(';')[0] in GZIP_TYPES) and len(data) > 1024:
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as gz:
                gz.write(data)
            gz_data = buf.getvalue()
            if len(gz_data) < len(data) * 0.95:
                body = gz_data
                encoding = 'gzip'

        self.send_response(status)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        if encoding:
            self.send_header('Content-Encoding', encoding)
            self.send_header('Vary', 'Accept-Encoding')
        if is_hashed:
            self.send_header('Cache-Control', 'public, max-age=31536000, immutable')
        elif is_index:
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.send_header('Pragma', 'no-cache')
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('X-Frame-Options', 'SAMEORIGIN')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_HEAD(self):
        return self._handle(head_only=True)

    def do_GET(self):
        return self._handle(head_only=False)

    def _handle(self, head_only: bool = False) -> None:
        path = urlparse(self.path).path

        # Never SPA-fallback API paths — those belong to the backend (port 8001).
        # The ingress routes /api/* to backend, but if traffic ever reaches us
        # directly (e.g. internal misroute), respond with 404 not index.html
        # so callers get a clear failure signal instead of HTML in JSON parsers.
        if path.startswith('/api/') or path == '/api':
            self.send_response(404)
            self.send_header('Content-Type', 'application/json')
            body = b'{"detail":"API requests should be routed to backend, not static server."}'
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return

        if path == '/':
            return self._send_file(DIST / 'index.html')
        if path == '/health':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            body = b'{"status":"ok","server":"mintu-static"}'
            self.send_header('Content-Length', str(len(body)))
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            if not head_only:
                self.wfile.write(body)
            return

        target = self._safe_path(path)
        if target is None:
            self.send_error(400)
            return

        # Direct file hit.
        if target.is_file():
            return self._send_file(target)

        # SPA fallback chain: try `<path>.html`, then `<path>/index.html`,
        # then root `index.html` (for client-side routes).
        html_candidate = target.with_suffix('.html')
        if html_candidate.is_file():
            return self._send_file(html_candidate)

        index_candidate = target / 'index.html'
        if index_candidate.is_file():
            return self._send_file(index_candidate)

        return self._send_file(DIST / 'index.html')


def main():
    if not DIST.is_dir():
        print(f'❌ dist/ not found at {DIST}. Run `npx expo export --platform web --output-dir dist`.')
        return 1

    print(f'🌐 MintU static server starting at http://{HOST}:{PORT}')
    print(f'   Serving {DIST}')
    print(f'   Files indexed at {time.strftime("%Y-%m-%d %H:%M:%S")}')

    httpd = ThreadingHTTPServer((HOST, PORT), StaticHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        httpd.server_close()
        print('Stopped.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
