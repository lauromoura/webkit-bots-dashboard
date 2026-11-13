"""
Shared test fixtures.

Tests run against dev-proxy.py in replay mode (tests/fixtures/, no network to
Buildbot) and headless Chromium via Playwright. Each test gets a fresh browser
context, so localStorage caches (lib/api.js) never leak between tests, and the
browser clock is frozen at the time the fixtures were recorded, so relative
times ("5 min ago") are stable.

Recording: `make record-fixtures` runs the whole suite with RECORD_DIR set; the
proxy then fetches live (throttled) and records everything the tests request.
"""

import glob
import json
import os
import re
import socket
import subprocess
import sys
import time
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timezone

import pytest
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FIXTURES = os.path.join(ROOT, "tests", "fixtures")
RECORD_DIR = os.environ.get("RECORD_DIR")
# Page loads: generous when recording live (throttled proxy), short in replay
# so a request that never completes fails fast instead of hanging the run.
LOAD_TIMEOUT_MS = 180000 if RECORD_DIR else 30000

API_PATH = re.compile(r"^/(ews/)?api/v2/")
# Files the digest cron produces on the server only; 404 locally is expected.
EXPECTED_MISSING = re.compile(r"^/digest/data(-ews)?/")


def _free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def recorded_at():
    """Newest recording time in the fixtures (the frozen browser clock)."""
    if RECORD_DIR:
        return datetime.now(timezone.utc).replace(microsecond=0)
    newest = None
    for path in glob.glob(os.path.join(FIXTURES, "*", "*.json")):
        with open(path, encoding="utf-8") as f:
            stamp = json.load(f).get("recorded_at")
        if stamp and (newest is None or stamp > newest):
            newest = stamp
    if newest is None:
        pytest.exit("no fixtures in tests/fixtures/: run `make record-fixtures`", 2)
    return datetime.strptime(newest, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)


@pytest.fixture(scope="session")
def server():
    """Base URL of a dev-proxy serving the repo, replaying (or recording) fixtures."""
    port = _free_port()
    mode = ["--record", RECORD_DIR] if RECORD_DIR else ["--replay", FIXTURES]
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "dev-proxy.py"), "--port", str(port), *mode],
        stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    base = "http://localhost:%d" % port
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/__proxy/stats", timeout=1)
            break
        except OSError:
            if proc.poll() is not None:
                pytest.exit("dev-proxy.py failed to start:\n" + proc.stderr.read(), 2)
            time.sleep(0.1)
    yield base
    proc.terminate()
    proc.wait(timeout=10)


@pytest.fixture(scope="session")
def browser():
    with sync_playwright() as p:
        b = p.chromium.launch()
        yield b
        b.close()


@pytest.fixture(scope="session")
def frozen_time():
    return recorded_at()


@dataclass
class PageRecord:
    """What a page did while a test drove it."""
    page: object
    base: str
    api_paths: list = field(default_factory=list)       # API requests (path + query)
    errors: list = field(default_factory=list)          # uncaught exceptions, console errors
    bad_responses: list = field(default_factory=list)   # (status, path), unexpected only
    replay_misses: list = field(default_factory=list)   # API calls with no fixture

    def goto(self, path):
        self.page.goto(self.base + "/" + path, wait_until="networkidle", timeout=LOAD_TIMEOUT_MS)
        # Builder tables: also wait for every row to settle (loaded or failed).
        self.page.wait_for_function(
            "() => ![...document.querySelectorAll('tr.placeholder-row .currentBuild')]"
            ".some(c => c.textContent.includes('loading'))", timeout=LOAD_TIMEOUT_MS)
        self.page.wait_for_timeout(300)

    def problems(self):
        return self.errors + ["HTTP %d %s" % r for r in self.bad_responses] + \
            ["no fixture for %s" % p for p in self.replay_misses]


@pytest.fixture
def open_page(browser, server, frozen_time):
    """Factory: a fresh context + page with the clock frozen and everything recorded."""
    contexts = []

    def make(viewport=(1280, 900)):
        ctx = browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
        contexts.append(ctx)
        page = ctx.new_page()
        page.clock.set_fixed_time(frozen_time)
        rec = PageRecord(page, server)

        def on_request(req):
            url = req.url
            if url.startswith(server):
                path = url[len(server):]
                if API_PATH.match(path):
                    rec.api_paths.append(path)

        def on_response(resp):
            if not resp.url.startswith(server):
                return
            path = resp.url[len(server):]
            if resp.status == 504 and API_PATH.match(path):
                rec.replay_misses.append(path)
            elif resp.status >= 400 and not EXPECTED_MISSING.match(path):
                rec.bad_responses.append((resp.status, path))

        def on_console(msg):
            # Failed loads are tracked (with their URL) by on_response.
            if msg.type == "error" and not msg.text.startswith("Failed to load resource"):
                rec.errors.append("console: " + msg.text[:300])

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("console", on_console)
        page.on("pageerror", lambda e: rec.errors.append("pageerror: %s" % e))
        return rec

    yield make
    for ctx in contexts:
        ctx.close()
