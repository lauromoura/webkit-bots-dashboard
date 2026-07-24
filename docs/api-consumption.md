# Buildbot API consumption — browser client

This document quantifies how much data the WebKit Bots Dashboard fetches from the
WebKit Buildbot APIs (`build.webkit.org` and `ews-build.webkit.org`) **from the
visitor's browser**, per page refresh. It is intended for the WebKit sysadmins as a
transparency check on our API usage.

**Scope:** browser (client-side) requests only. The dashboard also has an optional
server-side "digest" cron that pre-aggregates data, but it is **currently disabled**
and is therefore excluded here; it will be measured separately.

Endpoint sizes were measured on **2026-07-08** and re-checked on **2026-07-10**
(the `builders` payload moved 5,351 → 5,421 B gzip; raw unchanged — no material
drift). Because a request without an `Origin` header is answered normally, real
payload sizes are directly measurable with `curl`.

---

## TL;DR

- A refresh is a **full page reload every 5 minutes**.
- Auto-refresh **pauses whenever the browser tab is hidden** — a backgrounded tab
  makes **zero** requests.
- Low-priority builder groups are **collapsed by default and only fetched when
  expanded**, which keeps the default page load small.
- All API responses are **gzip-compressed**; the figures below are over-the-wire.
- The two dashboards cost roughly **21–26 requests / 12–13 KB per refresh**, i.e.
  about **0.15 MB per hour per open tab**, and only while the tab is visible.

---

## How the dashboard fetches

**Refresh model** (`lib/auto-refresh.js`)

- `REFRESH_INTERVAL_MS = 300_000` (5 minutes). The timer fires `location.reload()`, so
  each refresh re-runs the page's full init path — there is no partial polling.
- Refresh is scheduled only while the tab is visible; a `visibilitychange` handler
  cancels the timer when hidden and reschedules on return. Backgrounded tabs generate
  no traffic.

**Lazy low-priority groups** (`components/lazy-details.js`)

Each dashboard renders only the builders being actively watched. Low-priority groups
("Other", "JSCOnly", "Retired") sit in collapsed `<details>` sections whose builder
tables — and therefore their API calls — are built **only on first expand**. On
`gardening.html` that defers 55 of 68 post-commit builders; on `index.html`, 45.

**Per-builder caching** (`lib/api.js`, `getLastBuilds`)

Each builder row issues a 2-build probe to check current state; results are cached in
`localStorage` and the cache **survives the reload**. Steady state is therefore **1
request per builder per refresh**; a builder that produced a new build since the last
reload costs a second, larger fetch. EWS builder tables have no cache and always issue
one full fetch per builder.

**Step verdicts** (`lib/steps.js`)

Build-bot sections distinguish a broken build from test failures by inspecting a
build's steps. This is **conditional**: a green build implies every step passed, so no
steps request is made. A red build costs one extra request, and the result is cached
per `buildid` (steps of a completed build are immutable), so it is paid **once per new
build**, not once per refresh.

---

## Measurement methodology

Each endpoint was fetched twice — once with `--compressed` (matching browser
behaviour) for the over-the-wire size, once without for the raw JSON size:

```sh
curl -s --compressed -o /dev/null -w '%{size_download}' -H 'Accept-Encoding: gzip' "<url>"
curl -s            -o /dev/null -w '%{size_download}'                              "<url>"
```

All responses returned `Content-Encoding: gzip`.

---

## Per-endpoint unit costs

| Endpoint | Host | gzip | raw |
|----------|------|-----:|----:|
| `builders?field=builderid&name&tags&masterids` | build | 5,421 B | 79,910 B |
| `buildrequests?complete__eq=false` | build | 3,061 B | 75,417 B |
| `workers` | build | 8,035 B | 187,249 B |
| `builders/{id}/builds?order=-number&limit=2` (probe) | build | **257 B / builder** | 806 B |
| `builders/{id}/builds?order=-number&limit=7` (cache miss) | build | **365 B / builder** | 2,691 B |
| `builds/{buildid}/steps` (red builds only) | build | **749 B / build** | 3,938 B |
| `builders/{id}/builds?limit=100&...&property=identifier` | build | 2,656 B | 46,454 B |
| `builders/{id}` (single) | build | 160 B | 160 B |
| `builders?field=...` | ews | 1,915 B | 23,054 B |
| `buildrequests?complete__eq=false` | ews | 6,439 B | 195,861 B |
| `workers` | ews | 5,962 B | 219,572 B |
| `builders/{id}/builds?order=-number&limit=7` (no cache) | ews | **398 B / builder** | 2,689 B |

---

## Per-page consumption per 5-min refresh (gzip, over-the-wire)

"Warm" = steady state (probe only per builder). "Active" = upper bound where every
rendered builder produced a new build in the interval (a cold first load behaves like
Active). Real traffic sits between, close to Warm.

| Page | Host(s) | Builders fetched | Requests (warm → active) | Bytes (warm → active) |
|------|---------|-----------------:|-------------------------:|----------------------:|
| `index.html` (Bot Watcher, landing) | build | 23 + 2 time-limit | 26 → 51 | ~11.8 KB → ~21.0 KB |
| `gardening.html` | build + ews | 13 + 6 EWS | 21 → 34 | ~13.1 KB → ~17.8 KB |
| `queue.html` | build | — | 3 | ~16.5 KB |
| `ews-queue.html` | ews | — | 3 | ~14.3 KB |
| `builder.html` (detail) | build *or* ews | — | ~4 | ~14 KB |
| `worker.html` (detail) | build *or* ews | — | ~3 | ~2 KB |

Worked example — `gardening.html`, warm:
`builders`(5.4) + EWS `builders`(1.9) + 13 × probe(3.3) + 6 × EWS(2.4) ≈ **13.1 KB / 21 requests**.

**Step verdicts on top of the above.** Only red builds in the step-aware sections cost
a request, and only once per new build thanks to the per-`buildid` cache. In practice
about 5–6 builders are persistently red (the two merged debug bots, the JS-Tests bots,
and the stable-branch bot), so a cold load adds ~5–6 requests / ~4.5 KB, and subsequent
refreshes add ~0 until those builders produce new builds.

**On-demand cost of expanding a collapsed group** (user action, not per refresh):

| Group | Page | Builders fetched on expand |
|---|---|---:|
| Other post-commit bots | `gardening.html` | 24 |
| Retired builders | `gardening.html` | 31 |
| Other / JSCOnly / Retired | `index.html` | 12 / 2 / 31 |

---

## Aggregate per open tab

At 12 refreshes/hour, and **only while the tab is visible**:

| Page | Warm | Active (upper bound) |
|---|---|---|
| `index.html` | ~0.14 MB/hr, ~310 req/hr | ~0.25 MB/hr, ~610 req/hr |
| `gardening.html` | ~0.16 MB/hr, ~250 req/hr | ~0.21 MB/hr, ~410 req/hr |

---

## Notes and caveats

- **The byte figures are the production path.** In production the browser calls
  `build.webkit.org` directly and negotiates compression automatically:
  `Accept-Encoding` is a *forbidden header name* in the Fetch spec, so the page cannot
  opt in or out — the browser always requests gzip and transparently decompresses. The
  gzip column is therefore what users actually transfer. Note that the local development
  proxies (`dev-proxy.py`, `buildbot-proxy.py`) relay responses **uncompressed**, so a
  measurement taken through a dev proxy shows roughly 15× more bytes (79,910 B instead of
  5,421 B for `builders`) and will not match this document.
- **Linear in builder count.** Consumption scales with the number of *rendered* builders.
  The unit costs above allow recomputation for the exact counts seen in server logs.
- **Pages that do not auto-refresh** hit the API only on load or explicit user action:
  `job-duration.html` (one `builds?limit=100`, ~2.7 KB, per builder selected),
  `results-stats.html` (0 direct requests to `*.webkit.org` — it uses a local file and a
  separate proxy in front of `results.webkit.org`), `pass-ratio.html` and
  `daily-trend.html` (same-origin static `./digest/**` JSON only), and `legacy/*`.
- **`bot-watcher.html` is a redirect** to `index.html`, which now serves the Bot Watcher
  dashboard; the former "tiered view" has been removed. Redirect cost is negligible.
- **Server-side digest cron excluded** — currently disabled; to be measured separately.
- **First load vs refresh.** A cold load (empty `localStorage`) fetches full build lists
  and step verdicts, matching the Active column; later refreshes fall back to Warm plus
  a few misses.
