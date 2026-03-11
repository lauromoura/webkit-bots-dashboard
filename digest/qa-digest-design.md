# QA Daily Digest — Design & Brainstorm

## 1 — Purpose & Audience

The WebKit bots dashboard shows current status and short-term build history, but provides
no view of trends across longer time windows. The **QA Daily Digest** fills this gap by
summarising each queue's behaviour over a 24-hour UTC-aligned period (or any arbitrary
window for ad-hoc analysis).

**Primary audience:** WPEWebKit / WebKitGTK QA team members doing morning triage.

**Intended cadence:** Daily at UTC 00:00:00, but the `--hours` flag makes it useful for
shorter windows (e.g. "last 2 hours") and the `--start` flag enables historical queries.

**Future extension:** EWS queues via `--base-url ews-build.webkit.org/api/v2/`. The API
contract is identical; only the builder list and base URL differ.

---

## 2 — Queue Scope (GTK / WPE Focus)

Builder lists are derived from `buildbot-dependency.json`.

### Post-commit builders (build.webkit.org)

**GTK**
- `GTK-Linux-64-bit-Release-{Build, Tests, JS-Tests, WebDriver-Tests, Perf, MVT-Tests}`
- `GTK-Linux-64-bit-Debug-{Build, Tests, JS-Tests, WebDriver-Tests}`

**WPE**
- `WPE-Linux-64-bit-Release-{Build, Tests, JS-Tests, WebDriver-Tests, MVT-Tests, Legacy-API-Tests}`
- `WPE-Linux-64-bit-Debug-{Build, Tests, JS-Tests, WebDriver-Tests}`
- `WPE-Linux-RPi4-{32bits,64bits}-Mesa-Release-Perf-{Build, Tests}` (lower frequency;
  included in `--builders WPE` but may skew timing stats due to different workload)

### LTS / Stable builders (Tier 4 in dashboard)

Ubuntu and Debian stable builders are out of scope for MVP but can be added by passing
`--builder-name` or `--builder-id` directly.

---

## 3 — Metric Definitions

### 3.1 Volume

- **Total requests** in the window: count of build requests with `submitted_at` inside
  `[window_start, window_end)`.
- **Still running / pending** at digest time: `complete=false` requests in the same
  window. Informational only; excluded from all ratios and timing stats.

### 3.2 Outcome Distribution

Computed over **completed** requests only.

| Label | Result code | `claimed` | Meaning |
|---|---|---|---|
| Success | 0 | — | Build successful |
| Warnings | 1 | — | Successful with warnings |
| Failure | 2 | — | Build or test failed |
| Skipped | 3 | — | Skipped by condition |
| Exception | 4 | — | Buildbot internal error |
| Retry | 5 | — | Worker disconnect; will be requeued |
| Dropped (pre-start) | 6 | `false` | Cancelled before a worker claimed it |
| Dropped (mid-run) | 6 | `true` | Cancelled while a worker was running it |

For post-commit queues, "Dropped pre-start" means a newer commit superseded the request.
For EWS queues, it typically means the PR was merged or closed before the job ran.

**Success ratio** = (result 0 + result 1) / total_completed
**Drop ratio** = all result 6 / total_completed, broken down by stage

### 3.3 Timing Statistics

Three intervals derived from build request fields alone (no extra build fetch needed):

| Interval | Formula | Description |
|---|---|---|
| Queue wait | `claimed_at − submitted_at` | Time from submission to master assignment |
| Execution | `complete_at − claimed_at` | Master assignment to completion (includes worker startup) |
| Total | `complete_at − submitted_at` | End-to-end latency |

Stats reported: **avg, median, P90, max**.
P90 is omitted when fewer than 10 timing samples are available.

**Inclusion rules:**
- Only completed requests with both `claimed_at` and `complete_at` set are included.
- Result = 6 (cancelled) is excluded from timing stats; the execution time of a cancelled
  job is not comparable to completed work.
- Result = 3 (skipped) is excluded from queue wait, execution, and total timing.
  Skipped requests complete near-instantly (~0 s execution), which skews timing
  statistics for builders with high skip rates. Skipped requests have a separate
  **skip wait** metric: `claimed_at − submitted_at`, measuring how long the request
  waited in queue before being skipped.

> **Caveat — claimed_at vs started_at:** `claimed_at` on a build request is when the
> *Buildbot master* picked it up, not when the *worker* actually began executing. The true
> worker start time is `builds.started_at`, accessible via the `builds` endpoint.
> Computing accurate worker execution time requires a cross-reference to the builds
> endpoint (see Phase 2 in the roadmap).

### 3.4 Step-Level Analysis (Phase 2, separate script)

For tester queues (e.g. `WPE-Linux-64-bit-Release-Tests`), a per-step breakdown is
available via `step-analysis.py`.

Target step names (validate against live API — names may drift over time):
- `layout-tests` / `run-webkit-tests`
- `run-api-tests`
- `webkitpy-test`
- `webkitperl-test`
- `webdriver-tests`

Stats per step: success rate (results 0 or 1), avg / median / P90 / max duration.

API pattern: `builds/{buildid}/steps` — one call per build. For a 24 h window with 20–50
builds this means 20–50 extra HTTP requests. Acceptable for manual use; not suitable for
high-frequency automation.

---

## 4 — API Mapping

### Time-windowed build request fetch

```
# Completed requests in window
GET builders/{id}/buildrequests
    ?submitted_at__gt={window_start_epoch}
    &submitted_at__lt={window_end_epoch}
    &complete=1
    &order=-buildrequestid
    &limit=500
    &offset={offset}          ← paginate until len(page) < limit

# In-progress requests in the same window
GET builders/{id}/buildrequests
    ?submitted_at__gt={window_start_epoch}
    &submitted_at__lt={window_end_epoch}
    &complete__eq=false        ← note: complete=false may return 400 on build.webkit.org
```

### Step analysis (per build)

```
GET builds/{buildid}/steps
    ?field=stepid
    &field=name
    &field=results
    &field=started_at
    &field=complete_at
```

---

## 5 — Limitations & Open Questions

1. **claimed_at ≠ started_at** — Build request `claimed_at` is master assignment, not
   worker start. True execution time needs the `builds` endpoint. Document as Phase 2.

2. **Step name drift** — Step names may change or differ between GTK and WPE variants.
   `step-analysis.py` emits a "steps seen" summary to aid detection.

3. **No historical storage** — Each run queries the live API. For trend analysis across
   multiple days, outputs must be stored externally (JSON files or a database). Noted as
   Phase 3.

4. **Pagination** — A busy queue can exceed 500 requests per 24 h. The script paginates
   using `offset` until `len(page) < limit`, and verifies the total count against
   `meta.total` from the first page.

5. **RPi4 perf builders** — Lower frequency and different workload profile. Included in
   `--builders WPE` but their timing distribution may skew overall stats; consider
   excluding or reporting them in a separate section.

6. **EWS extension** — Pass `--base-url https://ews-build.webkit.org/api/v2/` and use a
   separate EWS builder list. The result semantics for "Dropped" differ (PR closed vs
   commit superseded). The skip/non-skip timing separation applies equally to EWS
   queues. EWS skips (outdated hash from force-push, closed PR) produce the same
   result=3 as post-commit skips (superseded commit). EWS queues may have higher skip
   rates due to frequent force-pushes, making the separation especially important.

---

## 6 — Roadmap

| Phase | Deliverable |
|---|---|
| **1 (MVP)** | `digest.py` — build-request-level stats, table + JSON output |
| **2** | `step-analysis.py` — per-step breakdown for tester queues |
| **3** | JSON output + daily cron run → store to file/DB for multi-day trending |
| **4** | HTML page in the bots dashboard for interactive digest view |
| **5** | EWS support (`--base-url` flag + EWS builder list) |
| **6** | True execution time via `builds.started_at` cross-reference |

---

## 7 — Script Interfaces

### `digest.py`

```
digest.py [--hours 24] [--start "2024-01-15 00:00 UTC"]
          [--builders GTK|WPE|ALL] [--builder-id ID [ID ...]]
          [--builder-name NAME [NAME ...]]
          [--format table|json] [--base-url URL]
```

- `--builders` selects a predefined group (`GTK`, `WPE`, `ALL`; default `ALL` when
  nothing else given).
- `--builder-id` accepts one or more raw integer IDs.
- `--builder-name` accepts one or more name strings (partial match, case-insensitive).
- Options are combinable and deduplicated by builder ID.
- `--hours` sets window width (default 24). `--start` sets the window end-point
  (default: now).

**Sample output (table format):**

```
QA Digest — 2024-01-15 00:00 → 2024-01-16 00:00 UTC
Generated: 2024-01-16 06:30 UTC

GTK-Linux-64-bit-Release-Tests  (id=42)
  Requests:  28 total (26 completed, 2 still running)
  Outcomes:  Success 22 (85%)  Failure 3 (12%)  Dropped-pre 1 (4%)
  Queue wait:  avg  4m12s  median  3m40s  P90  8m05s  max 14m20s
  Execution:   avg 1h22m   median 1h18m   P90 1h45m   max  2h01m
  Total:       avg 1h26m   median 1h22m   P90 1h51m   max  2h12m
  Skip wait:   avg  2m10s  median  1m45s  max  5m30s    (n=8)
```

### `step-analysis.py`

```
step-analysis.py <builder-id-or-name>
                 [--hours 24] [--start "2024-01-15 00:00 UTC"]
                 [--steps STEP [STEP ...]]
                 [--format table|json] [--base-url URL]
```

Fetches all builds for the builder that completed within the window, then fetches steps
for each build (N+1 pattern — count is printed up front). Filters to the given step names
(or all steps if `--steps` is omitted). Outputs per-step aggregated stats.

---

## 8 — Critical Files

| File | Role |
|---|---|
| `inspect-build-requests.py` | Existing script; source of reusable helpers (`api_get`, `format_duration`, `format_timestamp`, `summary_stats`) |
| `buildbot-dependency.json` | Source of truth for GTK/WPE builder → triggered-test-queue mapping |
| `buildbot-api-reference.md` | API reference for filter operators, field names, boolean caveats |
| `digest.py` | Phase 1 CLI script (this deliverable) |
| `step-analysis.py` | Phase 2 CLI script (this deliverable) |

---

## 9 — Verification Checklist

1. Run `digest.py --hours 2 --builders GTK` against build.webkit.org; confirm request
   counts look plausible (compare with queue.html current queue depth).
2. Run `inspect-build-requests.py <builder-id>` on the same builder and compare timing
   stats — they should be broadly similar for recent builds.
3. Run `step-analysis.py <tester-builder-id> --hours 2` and verify step names match
   what the Buildbot UI shows for a recent build.
4. Verify pagination: use a high-traffic builder with `--hours 48`; check that the total
   count matches `meta.total` from the first API page.
5. Run with `--format json` and pipe to `jq` to confirm the JSON structure is valid and
   all fields are present.
