"""
Every page loads cleanly from replayed data, and requests exactly the API paths
recorded in tests/api-paths.json.

An intended change in what a page requests: run `make test-update` to rewrite
api-paths.json, review the diff, and update docs/api-consumption.md. Which
requests a page makes depends on the data (e.g. steps are only fetched for red
builds), so the snapshot is always regenerated together with the fixtures.
"""

import json
import os

import pytest

from pages import SMOKE_PAGES

SNAPSHOT = os.path.join(os.path.dirname(__file__), "api-paths.json")
# Rewrite api-paths.json instead of comparing: on request (`make test-update`),
# and always while recording, so the snapshot is taken from the same data as
# the fixtures (`make record-fixtures`).
UPDATE = bool(os.environ.get("UPDATE_API_PATHS") or os.environ.get("RECORD_DIR"))


@pytest.fixture(scope="session")
def api_snapshot():
    try:
        with open(SNAPSHOT, encoding="utf-8") as f:
            expected = json.load(f)
    except FileNotFoundError:
        expected = {}
    seen = {}
    yield expected, seen
    if UPDATE and seen:
        merged = {**expected, **seen}
        with open(SNAPSHOT, "w", encoding="utf-8") as f:
            json.dump({k: merged[k] for k in SMOKE_PAGES if k in merged}, f, indent=1)
            f.write("\n")


@pytest.mark.parametrize("path", SMOKE_PAGES)
def test_page_loads_cleanly(open_page, path):
    rec = open_page()
    rec.goto(path)
    assert rec.problems() == [], "%s: %s" % (path, rec.problems())


@pytest.mark.parametrize("path", SMOKE_PAGES)
def test_api_requests_match_snapshot(open_page, api_snapshot, path):
    expected, seen = api_snapshot
    rec = open_page()
    rec.goto(path)
    got = sorted(rec.api_paths)
    seen[path] = got
    if UPDATE:
        return
    assert path in expected, "%s not in tests/api-paths.json: run `make test-update`" % path
    missing = sorted(set(expected[path]) - set(got))
    extra = sorted(set(got) - set(expected[path]))
    assert got == expected[path], (
        "%s requests changed (if intended: `make test-update`, then update "
        "docs/api-consumption.md)\n  no longer requested: %s\n  newly requested: %s"
        % (path, missing[:10], extra[:10]))
