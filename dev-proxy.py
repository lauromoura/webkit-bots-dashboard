#!/usr/bin/env python3
"""
Local dev server + Buildbot API proxy for the WebKit Bots Dashboard.

Serves the static dashboard AND forwards API calls to the real Buildbot
instances, so local development (http://localhost:PORT) sees live build data.
Direct browser calls to build.webkit.org from localhost are rejected by the
Buildbot CORS allow-list ("invalid origin"); a server-side request carries no
Origin header and is answered normally, so this proxy stands in for the
production same-origin setup.

Routes (query strings preserved):
  /api/v2/...       -> https://build.webkit.org/api/v2/...
  /ews/api/v2/...   -> https://ews-build.webkit.org/api/v2/...
everything else is served as a static file from the repo root.

Unlike mock-server/server.js (which fabricates data), this returns REAL data.

Note: results-stats.html and legacy/charts.html talk to results.webkit.org via a
separate CORS-enabled proxy on people.igalia.com, so they already work in local
dev (cross-origin) and need nothing from this proxy.

Usage examples:
  ./dev-proxy.py                 # serve on http://localhost:8000
  ./dev-proxy.py --port 8080
  ./dev-proxy.py -v              # log each proxied request to stderr
"""

import argparse
import os
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib import error, request

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BUILD_UPSTREAM = "https://build.webkit.org"
EWS_UPSTREAM = "https://ews-build.webkit.org"
UPSTREAM_TIMEOUT = 30  # seconds; matches the frontend's FETCH_TIMEOUT_MS

STATIC_ROOT = os.path.dirname(os.path.abspath(__file__))
BIND_HOST = "127.0.0.1"
DEFAULT_PORT = 8000

API_PREFIX = "/api/v2/"
EWS_PREFIX = "/ews/api/v2/"


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

class ProxyHandler(SimpleHTTPRequestHandler):
    """Serve static files, but forward the two API prefixes to real Buildbot."""

    verbose = False

    def log_message(self, fmt, *args):
        # SimpleHTTPRequestHandler logs every request; keep quiet unless -v.
        if self.verbose:
            super().log_message(fmt, *args)

    def _upstream_for(self, path):
        """Return the absolute upstream URL for an API path, or None if static."""
        if path.startswith(EWS_PREFIX):
            return EWS_UPSTREAM + path[len("/ews"):]
        if path.startswith(API_PREFIX):
            return BUILD_UPSTREAM + path
        return None

    def do_GET(self):
        if self._upstream_for(self.path):
            self._proxy()
        else:
            super().do_GET()

    # do_HEAD is inherited from SimpleHTTPRequestHandler. The only HEAD requests
    # the dashboard makes are to static ./digest/*.json files (daily-trend's
    # probeEarliestDate); nothing HEADs the API, so there is nothing to proxy.

    def _proxy(self):
        upstream = self._upstream_for(self.path)
        # Fetch phase. No extra headers -> no Origin -> Buildbot answers 200 (and
        # uncompressed, which is fine over localhost).
        try:
            with request.urlopen(request.Request(upstream),
                                 timeout=UPSTREAM_TIMEOUT) as resp:
                status, headers, body = resp.status, resp.headers, resp.read()
        except error.HTTPError as e:
            # Relay the upstream error faithfully (e.g. 404 for an unknown builder).
            status, headers, body = e.code, e.headers, e.read()
        except (error.URLError, TimeoutError, OSError) as e:
            self.send_error(502, "Upstream request failed: %s" % e)
            return

        # Relay phase. A client that navigated away / cancelled an in-flight fetch
        # (auto-refresh reload) drops the socket mid-write; that is not a 502.
        try:
            self.send_response(status)
            self.send_header("Content-Type",
                             headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            return
        if self.verbose:
            self.log_message("proxy GET %s -> %s [%s]", self.path, upstream, status)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Local static + Buildbot-proxy dev server for the dashboard.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--port", type=int, default=DEFAULT_PORT,
                        help="port to listen on (default: %(default)s)")
    parser.add_argument("-v", "--verbose", action="store_true",
                        help="log each proxied request to stderr")
    args = parser.parse_args()

    ProxyHandler.verbose = args.verbose
    handler = partial(ProxyHandler, directory=STATIC_ROOT)
    httpd = ThreadingHTTPServer((BIND_HOST, args.port), handler)

    print("Dashboard dev proxy serving %s" % STATIC_ROOT)
    print("  -> http://localhost:%d/  (use localhost or 127.0.0.1 so the frontend "
          "uses the proxy)" % args.port)
    print("  %s*      -> %s" % (API_PREFIX, BUILD_UPSTREAM + API_PREFIX))
    print("  %s*  -> %s" % (EWS_PREFIX, EWS_UPSTREAM + API_PREFIX))
    print("Press Ctrl+C to stop.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down.")
        httpd.shutdown()


if __name__ == "__main__":
    sys.exit(main())
