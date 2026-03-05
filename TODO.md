# TODO — WebKit Bots Dashboard Roadmap

## Quick fixes / Low-hanging fruit

- [ ] Add `<meta name="viewport" content="width=device-width, initial-scale=1">` to all HTML pages — responsive CSS breakpoint at 1024px exists in `style.css` but won't trigger on mobile without it
- [ ] Highlight the current page in the nav bar (currently all links look identical)
- [ ] Fix responsive CSS label: line 219 of `style.css` hardcodes `"Identifier"` in the `::before` pseudo-element — should say "Base Identifier" when viewing EWS builder history (CSS-only limitation; likely needs a class-based approach)
- [ ] Add auto-refresh to `builder.html` (the only monitoring page without it)
- [ ] Remove unused `formatSeconds()` from `lib/format.js`
- [ ] Replace deprecated `substr()` with `slice()` in `lib/format.js:41`

## Bugs & code safety

- [x] **XSS risk in standalone pages** — `job-duration.html` and `results-stats.html` build HTML strings from API data and inject via `innerHTML`; added `escapeHTML()` and `encodeURIComponent()` sanitization
- [x] **Unsafe `JSON.parse` on localStorage** — `lib/api.js` parses cached data with no try-catch; wrapped in try-catch, removes corrupted key on failure
- [x] **Unguarded array access in cache probe** — `lib/api.js` accesses `probeData.builds[0]` without checking array length; added `!probeData.builds ||` guard
- [x] **Missing `.catch()` on promises** — `queue.js`, `ews-queue.js`, `builder.js`, `builder-table.js`, `time-limit-table.js` — added `.catch()` error handling to all unhandled promises
- [x] **No fetch timeout** — `lib/api.js` `fetch()` calls have no timeout; added `AbortController` with 30s timeout
- [x] **Missing null check in builder detail** — `builder.js` accesses `buildsData.builds.length` without verifying `.builds` exists; changed to optional chaining

## UX improvements (medium effort)

- [ ] Loading indicators — pages show nothing while data fetches; add a spinner or skeleton
- [ ] Replace `<meta http-equiv="refresh">` with JS-based refresh that preserves scroll position
- [ ] Distinguish more build result types visually (WARNINGS, EXCEPTION, RETRY, CANCELLED — currently only SUCCESS vs FAILURE get colors)
- [ ] Add breadcrumb / smarter "back" navigation on builder detail (currently always links to `index.html`, even if you came from a queue page)
- [ ] Add build status filtering on builder detail page
- [ ] Add search/filter capability on the tiered view
- [ ] Pagination or "load more" for builder detail (currently hard-capped at 100 builds)
- [ ] Live-update relative timestamps between page refreshes (a small `setInterval`)

## Standalone page integration

`job-duration.html` and `results-stats.html` are fully self-contained with ~200 lines of duplicated inline CSS and no nav bar — navigation to them is one-way.

- [ ] Migrate them to the shared module/component system
- [ ] At minimum, add a nav bar or "back to dashboard" link

## Data & reliability

- [ ] API retry with backoff on transient failures (currently a single failed fetch shows a static error until next auto-refresh, 2 min later)
- [ ] Add localStorage cache TTL/expiration (currently only invalidated when the latest build number changes — stale data could persist indefinitely)
- [ ] Error indication per-builder row when an individual `getLastBuilds()` call fails on the tiered page

## Queue status enhancements

- [ ] Trend indicator (getting better / getting worse) based on recent history
- [ ] Per-worker breakdown (currently only summary counts)
- [ ] User-configurable severity thresholds (currently hardcoded: 10 min spinup, 3 pending warn, 30 min wait warn)
- [ ] Notification/alert for Critical status (desktop notification or visual pulse)

## Code quality / DRY

- [ ] **Deduplicate queue page utilities** — `groupByBuilderId()`, `groupWorkersByBuilderId()`, and the status legend are copy-pasted between `queue.js` and `ews-queue.js`; extract to shared modules
- [ ] **Centralize configuration** — severity thresholds (`queue-row.js:5-7`), EWS name filters (`ews-queue.js:21`), tier section definitions (`queue.js:7-14` / `tiered.js:8-15`), and API base URLs are hardcoded in multiple places
- [ ] **Consistent API factory pattern** — `builder.js:27` mixes `createAPI()` factory and named exports in `{ fetchAPI, getAllPendingRequests }`; pick one pattern
- [ ] **Add SRI integrity hashes** to CDN `<script>` tags (Tablesort, Chart.js) in all HTML files
- [ ] **Replace deprecated `substr()`** — `lib/format.js:41` uses `substr()` which is deprecated; use `slice()` instead (also listed in Quick fixes)
- [ ] **Remove or consume unused `RESULT_CODES`** — `lib/api.js` defines WARNINGS/EXCEPTION/RETRY/CANCELLED but only SUCCESS and FAILURE are ever checked

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
- [ ] Test suite for components and mock server
