# TODO — WebKit Bots Dashboard Roadmap

## Priority — make the project smoother to work on (humans and agents)

In this order:

1. [x] **Centralize configuration** — one module (e.g. `lib/config.js`) for the Buildbot base URLs, the proxy-vs-direct rule, queue severity thresholds (`queue-row.js`), EWS name filters (`ews-queue.js`), and section definitions (`queue.js` / `bot-watcher.js`). The `location.hostname === "localhost"` check is copy-pasted in six files (`lib/api.js`, `job-duration.html`, `pages/{gardening,worker,builder,ews-queue}.js`); flip it to "direct only on the CORS-allowlisted origins (`people.igalia.com`, `teams.pages.igalia.com`), proxy everywhere else" so the pages also work in cloud dev environments.
2. [x] **Agent guide** — `AGENTS.md` (with `CLAUDE.md` pointing to it): architecture (pages / components / lib), how to run the proxy, replay and smoke test, and the house rules: develop against `dev-proxy.py --replay`, keep live Buildbot traffic low, the Buildbot CORS allow-list (`Tools/CISupport/*-webserver/master.cfg` in WebKit) and the deploy layout.
3. [ ] **Verification loop in the repo** — a Playwright smoke test (e.g. `tools/smoke.py`) that loads every page against `dev-proxy.py --replay` and fails on console errors, plus fixtures (decide: commit a trimmed snapshot vs regenerate with `--record`). Package it as a devcontainer so Codespaces / Claude Code get the same loop (needs item 1).
4. [ ] **Candidate staging** — before asking anyone to validate a change, update the staging deploy (`people.igalia.com/lmoura/webkit-bots-dashboard-staging/`) with the candidate branch. Make it a local push: `git config receive.denyCurrentBranch updateInstead` in the staging checkout, then `git push staging <branch>:main` from a local clone (keep the staging tree clean).
5. [ ] **Retire or fix the mock server** — it has drifted (builder names don't match production, no EWS endpoints, `buildbot-mock-server.md` points at files that no longer exist) and renders "fine" with wrong data. Replay fixtures may replace it entirely.
6. [ ] **Pin CDN dependencies, then add SRI** — Chart.js and `chartjs-adapter-date-fns` are loaded unversioned (tablesort is pinned); pin them to exact versions, then add `integrity` hashes to all CDN tags.

## Quick fixes / Low-hanging fruit

- [x] Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to all HTML pages — responsive CSS breakpoint at 1024px exists in `style.css` but won't trigger on mobile without it
- [x] Highlight the current page in the nav bar (currently all links look identical)
- [x] Fix responsive CSS label: line 219 of `style.css` hardcodes `"Identifier"` in the `::before` pseudo-element — should say "Base Identifier" when viewing EWS builder history (CSS-only limitation; likely needs a class-based approach)
- [x] Add auto-refresh to `builder.html` (the only monitoring page without it)
- [x] Remove unused `formatSeconds()` from `lib/format.js`
- [x] Replace deprecated `substr()` with `slice()` in `lib/format.js:41`

## Bugs & code safety

- [x] **XSS risk in standalone pages** — `job-duration.html` and `results-stats.html` build HTML strings from API data and inject via `innerHTML`; added `escapeHTML()` and `encodeURIComponent()` sanitization
- [x] **Unsafe `JSON.parse` on localStorage** — `lib/api.js` parses cached data with no try-catch; wrapped in try-catch, removes corrupted key on failure
- [x] **Unguarded array access in cache probe** — `lib/api.js` accesses `probeData.builds[0]` without checking array length; added `!probeData.builds ||` guard
- [x] **Missing `.catch()` on promises** — `queue.js`, `ews-queue.js`, `builder.js`, `builder-table.js`, `time-limit-table.js` — added `.catch()` error handling to all unhandled promises
- [x] **No fetch timeout** — `lib/api.js` `fetch()` calls have no timeout; added `AbortController` with 30s timeout
- [x] **Missing null check in builder detail** — `builder.js` accesses `buildsData.builds.length` without verifying `.builds` exists; changed to optional chaining
- [ ] **"Other builds" pills overflow** into the "Link to buildbot" column (text overlaps the last pill) in every builder table
- [ ] **Long unbroken step messages overflow** — e.g. API-Tests EWS "Ignored pre-existing failures: TestWebKit.…" spills over the Finished / Other builds columns

## UX improvements (medium effort)

- [ ] Loading indicators — pages show nothing while data fetches; add a spinner or skeleton
- [x] Replace `<meta http-equiv="refresh">` with JS-based auto-refresh (`lib/auto-refresh.js`) that tracks elapsed time and respects tab visibility
- [ ] Distinguish more build result types visually (WARNINGS, EXCEPTION, RETRY, CANCELLED — post-commit tables only color SUCCESS vs FAILURE; EWS tables add amber for FAILURE). Uses the still-unused `RESULT_CODES` in `lib/results.js`
- [x] Add breadcrumb / smarter "back" navigation on builder detail (referrer-aware, links back to originating page)
- [ ] Add build status filtering on builder detail page
- [ ] Add search/filter capability on the main dashboard (`index.html` / Bot Watcher)
- [ ] Pagination or "load more" for builder detail (currently hard-capped at 100 builds)
- [ ] Live-update relative timestamps between page refreshes (a small `setInterval`)

## Standalone page integration

`job-duration.html` and `results-stats.html` are fully self-contained with ~200 lines of duplicated inline CSS and no nav bar — navigation to them is one-way.

- [ ] Migrate them to the shared module/component system
- [x] At minimum, add a nav bar or "back to dashboard" link — added nav bar and shared stylesheet to both pages

## Data & reliability

- [ ] API retry with backoff on transient failures (currently a single failed fetch shows a static error until next auto-refresh, 5 min later) — keep it to 1–2 retries with jitter, to stay gentle on Buildbot
- [ ] Add localStorage cache TTL/expiration (currently only invalidated when the latest build number changes — stale data could persist indefinitely)
- [ ] Namespace localStorage keys per deploy — production and staging share the `people.igalia.com` origin, hence the same `stepcache-*` / `buildcache-*` keys and the same 50-entry prune cap
- [ ] Error indication per-builder row when an individual `getLastBuilds()` call fails (`components/builder-table.js`, affects all dashboard pages)

## Queue status enhancements

- [ ] Trend indicator (getting better / getting worse) based on recent history
- [ ] Per-worker breakdown (currently only summary counts)
- [ ] User-configurable severity thresholds (currently hardcoded: 10 min spinup, 3 pending warn, 30 min wait warn)
- [ ] Notification/alert for Critical status (desktop notification or visual pulse)

## Code quality / DRY

- [ ] **Deduplicate queue page utilities** — `groupByBuilderId()`, `groupWorkersByBuilderId()`, and the status legend are copy-pasted between `queue.js` and `ews-queue.js`; extract to shared modules
- [ ] **Consistent API factory pattern** — `builder.js:27` mixes `createAPI()` factory and named exports in `{ fetchAPI, getAllPendingRequests }`; pick one pattern

## Accessibility

- [ ] Add ARIA live regions for dynamically loaded content
- [ ] Add skip-navigation links
- [ ] Improve focus management after content loads
- [ ] Ensure color is not the only indicator of status (add icons or patterns)

## Ambitious / long-term

- [ ] Dark mode support
- [ ] Real-time updates via EventSource/SSE (if buildbot supports it) instead of full-page reload
- [ ] Dashboard summary page with key health metrics across all tiers
- [ ] Progressive Web App support (offline caching, mobile install)
- [ ] Test suite for components (builds on the smoke test + replay fixtures from the priority list)
