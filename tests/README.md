# Tests

Browser tests for the dashboard, run against **recorded** Buildbot data: no
network access to build.webkit.org / ews-build.webkit.org is needed (or made).

```sh
python3 -m pip install -r requirements-dev.txt   # once: pytest + Playwright
python3 -m playwright install chromium            # once
make test                                         # whole suite (~1 min)
make test ARGS="-k job_duration -x"               # pytest arguments
```

## What runs

- `conftest.py` starts `dev-proxy.py --replay tests/fixtures` and gives each
  test a fresh browser context (empty localStorage) with the clock frozen at
  the recording time, recording uncaught exceptions, console errors,
  unexpected HTTP errors and API calls with no fixture.
- `test_smoke.py`: every page in `pages.py` loads cleanly, and requests exactly
  the API paths in `api-paths.json`.
- `test_tables.py`: builder tables are alphabetical, render identically across
  loads, keep a slow row's slot, show "Failed to load" on errors, and load
  collapsed sections (answered with synthetic data, since those requests
  aren't recorded).
- `test_job_duration.py`: every control, paging, URL/file loads, and that late
  responses never overwrite a newer view.

## Fixtures and the API snapshot

`fixtures/` holds the recorded API responses; `api-paths.json` lists what each
page requests. Both come from the **same recording**: which requests a page
makes depends on the data (e.g. build steps are only fetched for red builds).

- **Intended change in what a page requests:** `make test-update`, review
  `git diff tests/api-paths.json`, and update `docs/api-consumption.md`.
- **New query, or data too old:** `make record-fixtures` re-records everything
  from live Buildbot (one deliberate, throttled run of ~150 requests) and
  rewrites `api-paths.json` from the same run. Don't do this casually.

## Adding tests

Use the `open_page` fixture (`rec = open_page(); rec.goto("page.html")`), and
end with `assert rec.problems() == []`. For a bug fix, write the test first and
check it fails without the fix. Avoid fixed sleeps: wait on the page's own
signals (no "loading…" rows, status text), as the existing tests do.

To test a situation the recorded data doesn't contain (a broken builder, a
build still running, a skipped EWS run, ...), intercept the request and answer
it with `synthetic.py` (`build()`, `builds_response()`, `fulfill_json()`), as
`test_collapsed_sections_load_alphabetically` does. Never add synthetic data
to `fixtures/`.
