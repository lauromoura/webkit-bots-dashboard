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
  /__proxy/stats    -> JSON counters (upstream fetches, cache hits, ...)
everything else is served as a static file from the repo root.

It returns REAL data; for specific scenarios, tests answer requests with
synthetic responses instead (tests/synthetic.py).

Being a good citizen towards the WebKit infrastructure
------------------------------------------------------
Dashboard pages fan out into many API calls and reloads are frequent during
development, so upstream traffic is kept down by default:
  * successful responses are cached in memory for --cache-ttl seconds, and
    concurrent requests for the same URL share a single upstream fetch;
  * at most --max-inflight upstream requests run at once, spaced at least
    --min-interval seconds apart;
  * requests identify themselves with a descriptive User-Agent.

Record / replay
---------------
  --record DIR   proxy live as usual and also save every 200 response under DIR
  --replay DIR   never touch the network; answer only from fixtures in DIR
                 (a missing fixture is a 504 and is logged)
  --replay DIR --fill-missing
                 like --replay, but fetch and record calls with no fixture yet
                 (e.g. after a code change adds a new API query)
Record once, then iterate offline with --replay: realistic data, zero load on
Buildbot, and deterministic output for screenshot/DOM tests.

Note: results-stats.html and legacy/charts.html talk to results.webkit.org via a
separate CORS-enabled proxy on people.igalia.com, so they already work in local
dev (cross-origin) and need nothing from this proxy.

Usage examples:
  ./dev-proxy.py                         # serve on http://localhost:8088
  ./dev-proxy.py --port 8080
  ./dev-proxy.py -v                      # log each proxied request to stderr
  ./dev-proxy.py --record fixtures/      # live, and snapshot what pages fetch
  ./dev-proxy.py --replay fixtures/      # offline, from the snapshot
"""

import argparse
import hashlib
import json
import os
import re
import sys
import threading
import time
from collections import Counter, namedtuple
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
DEFAULT_PORT = 8088

API_PREFIX = "/api/v2/"
EWS_PREFIX = "/ews/api/v2/"
STATS_PATH = "/__proxy/stats"

DEFAULT_CACHE_TTL = 60.0     # seconds
DEFAULT_MAX_INFLIGHT = 2
DEFAULT_MIN_INTERVAL = 0.2   # seconds between upstream request starts
USER_AGENT = ("webkit-bots-dashboard-dev-proxy "
              "(+https://github.com/lauromoura/webkit-bots-dashboard)")

Upstream = namedtuple("Upstream", "status content_type body")


# ---------------------------------------------------------------------------
# Fixtures (record / replay)
# ---------------------------------------------------------------------------

def fixture_path(root, key):
    """Stable, human-skimmable file name for a proxied path (incl. query).

    e.g. /api/v2/builders/6/builds?limit=1 ->
         <root>/build/builders_6_builds__<hash>.json
    The hash covers the full key, so different query strings never collide.
    """
    if key.startswith(EWS_PREFIX):
        site, rest = "ews", key[len(EWS_PREFIX):]
    else:
        site, rest = "build", key[len(API_PREFIX):]
    slug = re.sub(r"[^A-Za-z0-9.-]+", "_", rest.split("?", 1)[0]).strip("_")
    digest = hashlib.sha1(key.encode()).hexdigest()[:10]
    return os.path.join(root, site, "%s__%s.json" % (slug[:80] or "root", digest))


def save_fixture(root, key, resp):
    path = fixture_path(root, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    text = resp.body.decode("utf-8", errors="replace")
    try:
        payload = {"json": json.loads(text)}
    except ValueError:
        payload = {"text": text}
    envelope = {"path": key, "status": resp.status,
                "content_type": resp.content_type,
                "recorded_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                **payload}
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(envelope, f, indent=1, sort_keys=True)
        f.write("\n")
    os.replace(tmp, path)


def load_fixture(root, key):
    path = fixture_path(root, key)
    try:
        with open(path, encoding="utf-8") as f:
            env = json.load(f)
    except FileNotFoundError:
        return None
    if "json" in env:
        body = json.dumps(env["json"]).encode()
    else:
        body = env.get("text", "").encode()
    return Upstream(env.get("status", 200),
                    env.get("content_type", "application/json"), body)


# ---------------------------------------------------------------------------
# Upstream client: cache, request coalescing, throttling
# ---------------------------------------------------------------------------

class UpstreamClient:
    def __init__(self, cache_ttl, max_inflight, min_interval,
                 record_dir=None, replay_dir=None, fill_missing=False):
        self.cache_ttl = cache_ttl
        self.min_interval = min_interval
        self.record_dir = record_dir
        self.replay_dir = replay_dir
        self.fill_missing = fill_missing
        self.stats = Counter()

        self._cache = {}            # key -> (expires_at, Upstream)
        self._lock = threading.Lock()
        self._key_locks = {}        # key -> Lock (single-flight per URL)
        self._inflight = threading.BoundedSemaphore(max_inflight)
        self._next_start = 0.0

    def _key_lock(self, key):
        with self._lock:
            return self._key_locks.setdefault(key, threading.Lock())

    def _cached(self, key):
        with self._lock:
            entry = self._cache.get(key)
            if entry and entry[0] > time.monotonic():
                return entry[1]
            self._cache.pop(key, None)
            return None

    def _pace(self):
        """Space upstream request starts at least min_interval apart."""
        with self._lock:
            now = time.monotonic()
            start = max(now, self._next_start)
            self._next_start = start + self.min_interval
        if start > now:
            time.sleep(start - now)

    def _fetch(self, url):
        req = request.Request(url, headers={"User-Agent": USER_AGENT,
                                            "Accept": "application/json"})
        with self._inflight:
            self._pace()
            self.stats["upstream_fetches"] += 1
            try:
                with request.urlopen(req, timeout=UPSTREAM_TIMEOUT) as resp:
                    return Upstream(resp.status,
                                    resp.headers.get("Content-Type", "application/json"),
                                    resp.read())
            except error.HTTPError as e:
                # Relay the upstream error faithfully (e.g. 404 for an unknown builder).
                self.stats["upstream_errors"] += 1
                return Upstream(e.code,
                                e.headers.get("Content-Type", "application/json"),
                                e.read())

    def get(self, key, url):
        """Return an Upstream for `key`; raises OSError subclasses on network failure."""
        self.stats["requests"] += 1
        if self.replay_dir:
            resp = load_fixture(self.replay_dir, key)
            self.stats["replay_hits" if resp else "replay_misses"] += 1
            if resp or not self.fill_missing:
                return resp

        with self._key_lock(key):
            # Re-check inside the per-key lock: a concurrent request for the same
            # URL may have just filled the cache while we waited.
            hit = self._cached(key) if self.cache_ttl > 0 else None
            if hit:
                self.stats["cache_hits"] += 1
                return hit
            resp = self._fetch(url)
            if resp.status == 200:
                if self.cache_ttl > 0:
                    with self._lock:
                        self._cache[key] = (time.monotonic() + self.cache_ttl, resp)
                record_dir = self.record_dir or (self.fill_missing and self.replay_dir)
                if record_dir:
                    save_fixture(record_dir, key, resp)
                    self.stats["recorded"] += 1
            return resp


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------

class ProxyHandler(SimpleHTTPRequestHandler):
    """Serve static files, but forward the two API prefixes to real Buildbot."""

    verbose = False
    client = None  # UpstreamClient, set in main()

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
        if self.path.split("?", 1)[0] == STATS_PATH:
            self._send(200, "application/json",
                       json.dumps(dict(self.client.stats), sort_keys=True).encode())
        elif self._upstream_for(self.path):
            self._proxy()
        else:
            super().do_GET()

    # do_HEAD is inherited from SimpleHTTPRequestHandler. The only HEAD requests
    # the dashboard makes are to static ./digest/*.json files (daily-trend's
    # probeEarliestDate); nothing HEADs the API, so there is nothing to proxy.

    def _send(self, status, content_type, body):
        # A client that navigated away / cancelled an in-flight fetch
        # (auto-refresh reload) drops the socket mid-write; that is not an error.
        try:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _proxy(self):
        upstream = self._upstream_for(self.path)
        try:
            resp = self.client.get(self.path, upstream)
        except (error.URLError, TimeoutError, OSError) as e:
            self.send_error(502, "Upstream request failed: %s" % e)
            return
        if resp is None:  # replay mode, no fixture
            sys.stderr.write("replay: no fixture for %s\n" % self.path)
            self._send(504, "application/json",
                       json.dumps({"error": "no fixture recorded",
                                   "path": self.path}).encode())
            return
        self._send(resp.status, resp.content_type, resp.body)
        if self.verbose:
            self.log_message("proxy GET %s -> %s [%s]", self.path, upstream, resp.status)


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
    parser.add_argument("--cache-ttl", type=float, default=DEFAULT_CACHE_TTL,
                        help="seconds to cache successful responses; 0 disables "
                             "(default: %(default)s)")
    parser.add_argument("--max-inflight", type=int, default=DEFAULT_MAX_INFLIGHT,
                        help="max concurrent upstream requests (default: %(default)s)")
    parser.add_argument("--min-interval", type=float, default=DEFAULT_MIN_INTERVAL,
                        help="min seconds between upstream request starts "
                             "(default: %(default)s)")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--record", metavar="DIR",
                      help="also save every successful response as a fixture in DIR")
    mode.add_argument("--replay", metavar="DIR",
                      help="serve API calls only from fixtures in DIR (no network)")
    parser.add_argument("--fill-missing", action="store_true",
                        help="with --replay: fetch (and record) only the API calls "
                             "that have no fixture yet")
    args = parser.parse_args()

    if args.max_inflight < 1:
        parser.error("--max-inflight must be at least 1")
    if args.fill_missing and not args.replay:
        parser.error("--fill-missing only makes sense with --replay")
    if args.replay and not os.path.isdir(args.replay):
        parser.error("--replay directory does not exist: %s" % args.replay)

    ProxyHandler.verbose = args.verbose
    ProxyHandler.client = UpstreamClient(args.cache_ttl, args.max_inflight,
                                         args.min_interval,
                                         record_dir=args.record,
                                         replay_dir=args.replay,
                                         fill_missing=args.fill_missing)
    handler = partial(ProxyHandler, directory=STATIC_ROOT)
    httpd = ThreadingHTTPServer((BIND_HOST, args.port), handler)

    print("Dashboard dev proxy serving %s" % STATIC_ROOT)
    print("  -> http://localhost:%d/  (pages use the proxy on any host except the "
          "CORS-allowlisted ones, see lib/config.js)" % args.port)
    if args.replay:
        print("  REPLAY mode: API calls answered from %s (%s)"
              % (args.replay, "missing ones fetched and recorded" if args.fill_missing
                 else "no network"))
    else:
        print("  %s*      -> %s" % (API_PREFIX, BUILD_UPSTREAM + API_PREFIX))
        print("  %s*  -> %s" % (EWS_PREFIX, EWS_UPSTREAM + API_PREFIX))
        print("  cache %gs, max %d in flight, >= %gs apart%s"
              % (args.cache_ttl, args.max_inflight, args.min_interval,
                 ", recording to %s" % args.record if args.record else ""))
    print("Press Ctrl+C to stop.", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down. Stats: %s"
              % json.dumps(dict(ProxyHandler.client.stats), sort_keys=True))
        httpd.shutdown()


if __name__ == "__main__":
    sys.exit(main())
