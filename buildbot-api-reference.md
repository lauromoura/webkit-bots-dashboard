# Buildbot REST API Reference

Reference for the [build.webkit.org](https://build.webkit.org) REST API, covering the
endpoints and patterns used (or useful) for the WebKit bots dashboard.

Official docs:
[REST API overview](https://docs.buildbot.net/latest/developer/rest.html) ·
[Endpoints (RAML)](https://docs.buildbot.net/latest/developer/raml/index.html) ·
[Result codes](https://docs.buildbot.net/latest/developer/results.html)

---

> **Scope reminder:** build.webkit.org serves ~300 builders across all WebKit
> ports. This dashboard only cares about the **GTK/WPE subset**. Prefer
> scoped endpoints like `builders/{id}/builds` and `builders/{id}/buildrequests`
> over system-wide endpoints like `/builds` and `/buildrequests`, which return
> data for every port and can be slow and wasteful.

---

## 1. API Fundamentals

### Base URL

```
https://build.webkit.org/api/v2/
```

### Response envelope

Every GET response is a JSON object with two keys:

```json
{
  "builders": [ { ... }, { ... } ],
  "meta": { "total": 307 }
}
```

The resource key is always the **pluralised resource name** (`builders`, `builds`,
`steps`, etc.). `meta.total` is the total count before pagination.

### Pagination

| Parameter | Description |
|-----------|-------------|
| `offset`  | 0-based index of the first result |
| `limit`   | Maximum number of results to return |

```
?offset=20&limit=10
```

### Ordering

`order={field}` for ascending, `order=-{field}` for descending. Repeatable for
multi-field sorts.

```
?order=-number            # newest build first
?order=builderid&order=-buildrequestid
```

### Field selection

Return only specific fields with repeated `field` params:

```
?field=name&field=builderid&field=tags
```

### Property inclusion

Builds, build requests, and changes can carry key/value properties. Include them
with `property`:

```
?property=identifier              # one named property
?property=identifier&property=got_revision   # multiple
?property=*                       # all properties
```

Each property value is a two-element array: `[value, source]`.

```json
"properties": {
  "identifier": ["308465@main", "Unknown"]
}
```

When using `property`, also add `field=properties` if you are using `field`
selection, otherwise properties will be omitted from the response.

### Filtering

Append `{field}={value}` for equality, or `{field}__{op}={value}` for other
operators:

| Operator   | Meaning                     | Example |
|------------|-----------------------------|---------|
| `eq`       | Equal (implicit default)    | `results=0` or `results__eq=0` |
| `ne`       | Not equal                   | `results__ne=2` |
| `lt`       | Less than                   | `complete_at__lt=1700000000` |
| `le`       | Less than or equal          | |
| `gt`       | Greater than                | `started_at__gt=1700000000` |
| `ge`       | Greater than or equal       | |
| `contains` | Substring match             | `name__contains=WPE` |

Multiple values on the same filter produce OR logic: `results=0&results=1`
matches builds that succeeded or had warnings.

### Boolean values

Boolean fields accept these (case-insensitive):

| True       | False  |
|------------|--------|
| `on`       | `off`  |
| `true`     | `false`|
| `yes`      | `no`   |
| `1`        | `0`    |

> **Note:** On build.webkit.org, some boolean filters (e.g. `complete`) require
> the explicit `__eq` operator when filtering for `false`:
> `complete__eq=false` works, while `complete=false` may return 400.
> Filtering for `true` with `complete=1` works fine.

---

## 2. Result Codes

These apply to both builds and steps (the `results` field):

| Code | Constant    | Meaning |
|------|-------------|---------|
| 0    | `SUCCESS`   | Successful run |
| 1    | `WARNINGS`  | Successful, with warnings |
| 2    | `FAILURE`   | Failed (problem in the build/test itself) |
| 3    | `SKIPPED`   | Skipped (e.g. by `doStepIf`) |
| 4    | `EXCEPTION` | Buildbot internal error |
| 5    | `RETRY`     | Should be retried (e.g. worker disconnect) |
| 6    | `CANCELLED` | Cancelled by user |

A build in progress has `results: null` and `complete: false`.

---

## 3. Endpoints by Resource

### Builders

A builder is a named build configuration, identified by `builderid` or `name`.

**Key fields:**

| Field       | Type     | Notes |
|-------------|----------|-------|
| `builderid` | integer  | Unique ID |
| `name`      | string   | e.g. `"WPE-Linux-64bit-Release-Build"` |
| `tags`      | string[] | e.g. `["Build", "WPE", "Release"]` |
| `description` | string | Optional |
| `masterids` | integer[] | Masters running this builder |
| `projectid` | string   | Optional project association |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /builders` | All builders |
| `GET /builders/{id_or_name}` | Single builder |
| `GET /masters/{masterid}/builders` | Builders for a master |

**Useful queries:**

```
# All builders (just IDs, names, tags)
builders?field=builderid&field=name&field=tags

# Filter by tag (not directly supported -- client-side filter on tags array)
```

> Tags are arrays, so server-side filtering by tag is not available. Filter
> client-side with `builder.tags.includes("WPE")`.

---

### Builds

A build is a single execution of a builder.

**Key fields:**

| Field             | Type              | Notes |
|-------------------|-------------------|-------|
| `buildid`         | integer           | Unique ID |
| `number`          | integer           | Sequential per builder |
| `builderid`       | integer           | Parent builder |
| `buildrequestid`  | integer (null)    | Linked build request |
| `workerid`        | integer           | Worker that ran it |
| `started_at`      | integer           | Unix timestamp (seconds) |
| `complete`        | boolean           | Whether build finished |
| `complete_at`     | integer (null)    | Unix timestamp; null if in progress |
| `results`         | integer (null)    | Result code; null if in progress |
| `state_string`    | string            | e.g. `"build successful"`, `"building"` |
| `properties`      | object            | Only present with `?property=` |
| `locks_duration_s`| integer           | Time spent acquiring locks |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /builds` | All builds |
| `GET /builds/{buildid}` | Single build |
| `GET /builders/{id_or_name}/builds` | Builds for a builder |
| `GET /builders/{id_or_name}/builds/{number}` | Build by builder + number |
| `GET /buildrequests/{id}/builds` | Builds for a build request |

**Useful queries:**

```
# Last 6 completed builds for a builder
builders/{id}/builds?order=-number&limit=6&complete__eq=true

# Last 6 builds (including in-progress)
builders/{id}/builds?order=-number&limit=6

# Recent successful builds with commit identifier
builders/{id}/builds?order=-number&limit=100&complete__eq=true&results=0&property=identifier

# Recent failures
builders/{id}/builds?order=-number&limit=20&complete__eq=true&results=2
```

---

### Workers

A worker is a machine that executes builds.

**Key fields:**

| Field          | Type    | Notes |
|----------------|---------|-------|
| `workerid`     | integer | Unique ID |
| `name`         | string  | e.g. `"bot683"` |
| `paused`       | boolean | Connected but not accepting builds |
| `pause_reason` | string (null) | Why paused |
| `graceful`     | boolean | Finishing current work then shutting down |
| `connected_to` | array   | `[{ "masterid": int }]`; empty = disconnected |
| `configured_on` | array  | `[{ "builderid": int, "masterid": int }]` |
| `workerinfo`   | object  | `{ "admin", "host", "access_uri", "version" }` |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /workers` | All workers |
| `GET /workers/{id_or_name}` | Single worker |
| `GET /builders/{id_or_name}/workers` | Workers for a builder |

**Useful queries:**

```
# All workers with connection status
workers?field=workerid&field=name&field=connected_to&field=paused

# Workers for a specific builder
builders/{id}/workers
```

A worker is **connected** if `connected_to.length > 0`.

---

### Build Requests

A build request represents a pending or completed request for a build.

**Key fields:**

| Field                 | Type            | Notes |
|-----------------------|-----------------|-------|
| `buildrequestid`      | integer         | Unique ID |
| `builderid`           | integer         | Target builder |
| `buildsetid`          | integer         | Parent buildset |
| `claimed`             | boolean         | Whether a master picked it up |
| `claimed_at`          | integer (null)  | When claimed |
| `claimed_by_masterid` | integer (null)  | Which master claimed it |
| `complete`            | boolean         | Whether finished |
| `complete_at`         | integer (null)  | When finished |
| `submitted_at`        | integer         | When submitted (unix timestamp) |
| `results`             | integer         | `-1` while pending, then a result code |
| `priority`            | integer         | Request priority |
| `waited_for`          | boolean         | Whether triggering entity awaits result |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /buildrequests` | All build requests |
| `GET /buildrequests/{id}` | Single request |
| `GET /builders/{id_or_name}/buildrequests` | Requests for a builder |

**Useful queries:**

```
# Pending requests for one builder (prefer this over the global endpoint)
builders/{id}/buildrequests?complete__eq=false

# Queue depth for one builder (just count it)
builders/{id}/buildrequests?complete__eq=false&field=buildrequestid
```

---

### Steps

Steps are the individual operations within a build (checkout, compile, test, etc.).

**Key fields:**

| Field          | Type          | Notes |
|----------------|---------------|-------|
| `stepid`       | integer       | Unique ID |
| `buildid`      | integer       | Parent build |
| `number`       | integer       | Position within build (0-based) |
| `name`         | string        | e.g. `"compile-webkit"`, `"run-tests"` |
| `results`      | integer (null)| Result code |
| `state_string` | string        | Status detail |
| `started_at`   | integer (null)| Unix timestamp |
| `complete_at`  | integer (null)| Unix timestamp |
| `complete`     | boolean       | |
| `hidden`       | boolean       | Whether to hide in UI |
| `urls`         | array         | `[{ "name": str, "url": str }]` |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /builds/{buildid}/steps` | Steps for a build |
| `GET /builds/{buildid}/steps/{number_or_name}` | Single step |
| `GET /builders/{id}/builds/{number}/steps` | Steps via builder path |
| `GET /builders/{id}/builds/{number}/steps/{step}` | Single step via builder path |

**Useful queries:**

```
# All steps for a build (just names and results)
builds/{buildid}/steps?field=stepid&field=name&field=number&field=results&field=state_string

# Find the test step result
builders/{id}/builds/{number}/steps/run-tests
```

---

### Logs

Logs are attached to steps. Retrieving log **content** uses a separate
`/contents` sub-resource.

**Key fields (log metadata):**

| Field      | Type    | Notes |
|------------|---------|-------|
| `logid`    | integer | Unique ID |
| `name`     | string  | e.g. `"stdio"`, `"err.html"` |
| `slug`     | string  | URL-safe version of name |
| `stepid`   | integer | Parent step |
| `complete` | boolean | Whether log is finished |
| `num_lines`| integer | Total line count |
| `type`     | string  | `s` = stdio, `t` = text, `h` = HTML, `d` = deleted |

**Endpoints (metadata):**

| Path | Description |
|------|-------------|
| `GET /steps/{stepid}/logs` | Logs for a step |
| `GET /steps/{stepid}/logs/{slug}` | Single log |
| `GET /builds/{buildid}/steps/{step}/logs` | Logs via build path |
| `GET /builders/{id}/builds/{num}/steps/{step}/logs` | Logs via full path |

**Endpoints (content):**

| Path | Description |
|------|-------------|
| `GET /logs/{logid}/contents` | Log content by ID |
| `GET /logs/{logid}/raw` | Raw download (not JSON-wrapped) |
| `GET /steps/{stepid}/logs/{slug}/contents` | Content via step path |
| `GET /builders/{id}/builds/{num}/steps/{step}/logs/{slug}/contents` | Content via full path |
| `GET /builders/{id}/builds/{num}/steps/{step}/logs/{slug}/raw` | Raw via full path |

Log content is paginated with `offset` (starting line, 0-based) and `limit` (max
lines). The `/raw` endpoint returns plain text (no JSON wrapping, no pagination).

---

### Changes

A change represents a source code commit associated with a build.

**Key fields:**

| Field            | Type          | Notes |
|------------------|---------------|-------|
| `changeid`       | integer       | Unique ID |
| `author`         | string        | Name, email, or both |
| `branch`         | string (null) | Null = default branch |
| `comments`       | string        | Commit message |
| `files`          | string[]      | Modified file paths |
| `revision`       | string (null) | Commit hash / revision |
| `revlink`        | string (null) | Link to web view |
| `when_timestamp`  | integer       | Unix timestamp |
| `repository`     | string        | Repository URL |
| `project`        | string        | Project identifier |
| `sourcestamp`     | object        | Associated sourcestamp |

**Endpoints:**

| Path | Description |
|------|-------------|
| `GET /changes` | All changes (use `order=-changeid&limit=N`) |
| `GET /changes/{changeid}` | Single change |
| `GET /builds/{buildid}/changes` | Changes tested by a build |
| `GET /builders/{id}/builds/{number}/changes` | Changes via builder path |

---

## 4. Use-Case Recipes

### Bot Watcher

**List all builders with their tags:**
```
GET builders?field=builderid&field=name&field=tags
```

**Last N builds for a builder (with cache probe):**
```
# Probe: fetch 2 to check if cache is stale
GET builders/{id}/builds?order=-number&limit=2

# Full fetch if cache miss
GET builders/{id}/builds?order=-number&limit=7
```
Compare the latest completed build number with cached `latestNumber`. If they
match and latest is complete, use cache. If latest is in-progress, merge it with
cached older builds.

**Check worker connection status:**
```
GET workers?field=workerid&field=name&field=connected_to&field=paused
```
Disconnected: `connected_to.length === 0`.
Paused: `paused === true`.

**Find pending build requests (queue depth):**
```
# Per builder (preferred — avoids fetching requests for all ~300 builders)
GET builders/{id}/buildrequests?complete__eq=false
```
Count the array length or check `meta.total`. Loop over the known GTK/WPE
builder IDs rather than hitting the global `/buildrequests` endpoint.

**Detect stuck/offline workers:**
```
GET workers?field=workerid&field=name&field=connected_to&field=configured_on
```
A worker is stuck/offline if `connected_to` is empty but `configured_on` is
non-empty (it should be running builds but isn't connected).

**Calculate wait time (submitted to started):**
```
GET builders/{id}/builds?order=-number&limit=20&complete__eq=true
```
For each build, fetch the matching build request via `buildrequestid`, then
compute `started_at - submitted_at`.

---

### Gardener

**Recent failures for a builder:**
```
GET builders/{id}/builds?order=-number&limit=20&results=2
```

**Recent failures across our builders:**
Loop over known GTK/WPE builder IDs rather than querying the global `/builds`
endpoint (which returns results for all ~300 builders across every port).
```
GET builders/{id}/builds?order=-number&limit=10&results=2
```

**Build steps to find test outcomes:**
```
GET builds/{buildid}/steps?field=stepid&field=name&field=number&field=results&field=state_string
```
Look for steps named `run-tests`, `run-api-tests`, `layout-tests`, etc.

**Test log content for a failing step:**
```
# Get logs for the failing step
GET builds/{buildid}/steps/{step_name}/logs

# Read the stdio log content
GET logs/{logid}/contents?offset=0&limit=5000

# Or use the raw endpoint for plain text
GET logs/{logid}/raw
```

**Recent builds with commit identifiers:**
```
GET builders/{id}/builds?order=-number&limit=100&property=identifier
```
The identifier is at `build.properties.identifier[0]` (e.g. `"308465@main"`).

**Changes tested by a build:**
```
GET builds/{buildid}/changes
```
Returns commit author, message, modified files, and revision link.

**Correlate failure with a commit:**
1. Get the failing build: `GET builders/{id}/builds/{number}`
2. Get its changes: `GET builds/{buildid}/changes`
3. Get the previous build's changes to narrow down what's new.

---

## 5. Current Dashboard Usage

Summary of how each page in the dashboard uses the Buildbot API.

| Page | File(s) | Endpoints Used | Purpose |
|------|---------|----------------|---------|
| `index.html` (tiered view) | `main.js`, `modules/utils.js` | `GET builders` → `GET builders/{id}/builds?order=-number&limit=7` per builder | Fetches all builders, filters into tiers by tags, shows last 6 builds per bot |
| `all-builders.html` | `all-builders.js`, `modules/utils.js` | `GET builders` → `GET builders/{id}/builds?order=-number&limit=7` per builder | Same pattern, grouped by platform (WPE/GTK/Packaging) |
| `builder.html` | `builder.js` | `GET builders/{id}`, `GET builders/{id}/builds?limit=100&order=-number&property=identifier` | Single builder detail: name, last 100 builds with commit IDs |
| `unified.html` | `unified.js` | `GET builders/6/builds?...&complete=1&results=0&limit=300`, same for builder 133 | Compares unified vs non-unified build times |
| `charts.html` | `charts.js`, `modules/results.js` | *Not Buildbot* — uses `results.webkit.org` API | Test result trends |

### Build fields actually consumed

Across all pages, the dashboard reads these build fields:

- `number`, `complete`, `state_string`, `results`, `started_at`, `complete_at`,
  `properties.identifier[0]`

### Builder fields actually consumed

- `builderid`, `name`, `tags`

### Caching

`getLastBuild()` in `modules/utils.js` implements a two-phase cache using
`localStorage` (keys: `buildcache-{builderId}`):

1. **Probe fetch:** 2 builds to check latest build number.
2. **Cache hit:** If latest completed number matches cache, return cached data
   (merging in-progress build if active).
3. **Cache miss:** Full fetch of N+1 builds, store completed builds in cache.

There is no time-based expiry; the cache invalidates only when the latest
completed build number changes.

### Fetch patterns

- All API calls use raw `fetch()` with no shared wrapper, retry logic, or
  request deduplication.
- Error handling is inconsistent: some pages check `response.ok` and `alert()`,
  some log to console, and `getLastBuild()` does not check at all.
- Each builder triggers its own individual builds request, so the main pages
  fire N+1 requests (1 builders list + 1-2 per builder).
