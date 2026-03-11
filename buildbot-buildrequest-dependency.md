# Buildbot Builder Trigger Dependencies

## Finding: Build -> Test trigger relationship

Builder 6 (WPE-Linux-64-bit-Release-Build) triggers builder 40 (WPE-Linux-64-bit-Release-Tests)
via a Buildbot trigger step at build completion.

## Evidence (2026-03-03)

Comparing `complete_at` of builder 6 (non-skipped) with `submitted_at` of builder 40 across
30 recent requests each:

- **15/15 exact matches** in the overlapping time window (09:16–17:00 UTC)
- Deltas are 0s (most) or -1s (sub-second rounding) — unmistakable trigger signature
- The remaining 15 builder 40 requests fell outside builder 6's 30-request window

Sample matches:

| B40 request | B40 submitted_at    | B6 request | B6 complete_at      | Delta |
|-------------|---------------------|------------|---------------------|-------|
| 5424370     | 2026-03-03T09:16:11 | 5424295    | 2026-03-03T09:16:11 | 0s    |
| 5424458     | 2026-03-03T09:36:19 | 5424390    | 2026-03-03T09:36:19 | 0s    |
| 5424709     | 2026-03-03T11:32:03 | 5424594    | 2026-03-03T11:32:04 | -1s   |
| 5425676     | 2026-03-03T15:38:05 | 5425606    | 2026-03-03T15:38:05 | 0s    |
| 5426042     | 2026-03-03T16:57:30 | 5425699    | 2026-03-03T16:57:31 | -1s   |

## Additional observations

1. **Skipped test requests also match** — builder 6 triggers a test request on every completion,
   but builder 40 skips redundant ones when a newer build is already queued/running
   (Buildbot request collapsing).

2. **Builder 6's result does not gate the trigger** — builder 40 is triggered regardless of
   whether builder 6 succeeded or failed.

3. **Request ID ordering is preserved** — each builder 6 request maps to a builder 40 request
   with a higher ID.

## How to detect trigger relationships

The general method: for two builders A (upstream) and B (downstream), compare
`A.complete_at` with `B.submitted_at`. If they match within 0–1 seconds across all
overlapping requests, A triggers B via a Buildbot trigger step.

This can be checked with `inspect-build-requests.py` by fetching JSON for both builders
and comparing timestamps.
