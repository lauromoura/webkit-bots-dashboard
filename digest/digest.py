#!/usr/bin/env python3
"""
QA Daily Digest — per-queue summary of build request outcomes and timing.

Produces a digest for one or more GTK/WPE Buildbot builders over a time window.

Usage examples:
  digest.py                                     # all GTK+WPE builders, last 24 h
  digest.py --builders GTK --hours 2
  digest.py --builder-name "Release-Tests"      # partial name match
  digest.py --builder-id 42 133 --format json
  digest.py --start "2024-01-15 00:00 UTC"

See qa-digest-design.md for the full design document.
"""

import argparse
import json
import statistics
import sys
from datetime import datetime, timedelta, timezone
from urllib import error, parse, request

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://build.webkit.org/api/v2/"
PAGE_LIMIT = 500

RESULT_NAMES = {
    0: "Success",
    1: "Warnings",
    2: "Failure",
    3: "Skipped",
    4: "Exception",
    5: "Retry",
    6: "Cancelled",
}

# Outcome keys used in digest output (result=6 is split by claimed state).
OUTCOME_LABELS = {
    0: "Success",
    1: "Warnings",
    2: "Failure",
    3: "Skipped",
    4: "Exception",
    5: "Retry",
    "dropped_pre": "Dropped-pre",
    "dropped_mid": "Dropped-mid",
}

# Builder names derived from buildbot-dependency.json.
# Each entry is a builder name as it appears in the Buildbot UI.
GTK_BUILDERS = [
    "GTK-Linux-64-bit-Release-Build",
    "GTK-Linux-64-bit-Release-Tests",
    "GTK-Linux-64-bit-Release-JS-Tests",
    "GTK-Linux-64-bit-Release-WebDriver-Tests",
    "GTK-Linux-64-bit-Release-Perf",
    "GTK-Linux-64-bit-Release-MVT-Tests",
    "GTK-Linux-64-bit-Debug-Build",
    "GTK-Linux-64-bit-Debug-Tests",
    "GTK-Linux-64-bit-Debug-JS-Tests",
    "GTK-Linux-64-bit-Debug-WebDriver-Tests",
]

WPE_BUILDERS = [
    "WPE-Linux-64-bit-Release-Build",
    "WPE-Linux-64-bit-Release-Tests",
    "WPE-Linux-64-bit-Release-JS-Tests",
    "WPE-Linux-64-bit-Release-WebDriver-Tests",
    "WPE-Linux-64-bit-Release-MVT-Tests",
    "WPE-Linux-64-bit-Release-Legacy-API-Tests",
    "WPE-Linux-64-bit-Debug-Build",
    "WPE-Linux-64-bit-Debug-Tests",
    "WPE-Linux-64-bit-Debug-JS-Tests",
    "WPE-Linux-64-bit-Debug-WebDriver-Tests",
    "WPE-Linux-RPi4-32bits-Mesa-Release-Perf-Build",
    "WPE-Linux-RPi4-32bits-Mesa-Release-Perf-Tests",
    "WPE-Linux-RPi4-64bits-Mesa-Release-Perf-Build",
    "WPE-Linux-RPi4-64bits-Mesa-Release-Perf-Tests",
]

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="QA Daily Digest: per-queue build request outcomes and timing.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.strip(),
    )
    parser.add_argument(
        "--hours",
        type=float,
        default=24.0,
        metavar="N",
        help="Window width in hours (default: 24)",
    )
    parser.add_argument(
        "--start",
        metavar="DATETIME",
        help=(
            "Window end-point in UTC, e.g. '2024-01-15 00:00 UTC' or "
            "'2024-01-15T00:00:00'. Defaults to now."
        ),
    )
    parser.add_argument(
        "--builders",
        nargs="+",
        choices=["GTK", "WPE", "ALL"],
        metavar="GROUP",
        help="Predefined builder group(s): GTK, WPE, ALL",
    )
    parser.add_argument(
        "--builder-id",
        nargs="+",
        type=int,
        metavar="ID",
        help="One or more builder IDs (integers)",
    )
    parser.add_argument(
        "--builder-name",
        nargs="+",
        metavar="NAME",
        help="One or more builder name patterns (partial, case-insensitive)",
    )
    parser.add_argument(
        "--format",
        choices=["table", "json"],
        default="table",
        help="Output format (default: table)",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Buildbot API base URL (default: %(default)s)",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print each API request URL to stderr",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Time helpers
# ---------------------------------------------------------------------------

def parse_start_time(s):
    """Parse a datetime string and return a UTC-aware datetime."""
    s = s.strip()
    for suffix in (" UTC", "Z", "+00:00"):
        if s.endswith(suffix):
            s = s[: -len(suffix)].strip()
    for fmt in [
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d",
    ]:
        try:
            return datetime.strptime(s, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    raise ValueError("Cannot parse datetime: {!r}. Use YYYY-MM-DD HH:MM[:SS][ UTC]".format(s))


def format_duration(seconds):
    if seconds < 0:
        return "-" + format_duration(-seconds)
    seconds = int(seconds)
    h, rem = divmod(seconds, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return "{}h {:02d}m {:02d}s".format(h, m, s)
    if m > 0:
        return "{}m {:02d}s".format(m, s)
    return "{}s".format(s)


def format_timestamp(epoch):
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M")


def format_ts_long(dt):
    return dt.strftime("%Y-%m-%d %H:%M")


# ---------------------------------------------------------------------------
# Statistics
# ---------------------------------------------------------------------------

def percentile(sorted_values, p):
    """Linear-interpolated percentile (0–100) on a sorted list."""
    n = len(sorted_values)
    if n == 0:
        return None
    idx = (n - 1) * p / 100.0
    lower = int(idx)
    upper = lower + 1
    if upper >= n:
        return float(sorted_values[-1])
    frac = idx - lower
    return sorted_values[lower] + frac * (sorted_values[upper] - sorted_values[lower])


def summary_stats(values):
    """Return avg/median/p90/max for a list of numeric values.

    Returns None for an empty list.
    p90 is None when fewer than 10 samples are available.
    """
    if not values:
        return None
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    return {
        "n": n,
        "avg": statistics.mean(values),
        "median": statistics.median(values),
        "p90": percentile(sorted_vals, 90) if n >= 10 else None,
        "max": sorted_vals[-1],
    }


# ---------------------------------------------------------------------------
# API helpers
# ---------------------------------------------------------------------------

_verbose = False  # set to True by --verbose; checked inside api_get()


def api_get(base_url, path):
    url = base_url.rstrip("/") + "/" + path.lstrip("/")
    if _verbose:
        print("GET " + url, file=sys.stderr, end="", flush=True)
    req = request.Request(url)
    try:
        with request.urlopen(req) as response:
            raw = response.read()
            if _verbose:
                print("  →  {:,} B".format(len(raw)), file=sys.stderr)
            return json.loads(raw.decode("utf-8"))
    except error.HTTPError as e:
        if _verbose:
            print("  →  HTTP {}".format(e.code), file=sys.stderr)
        else:
            print("HTTP {}: {}".format(e.code, url), file=sys.stderr)
        raise


_builders_cache = None


def fetch_all_builders(base_url):
    """Fetch all builders (name + id only). Cached for the process lifetime."""
    global _builders_cache
    if _builders_cache is None:
        data = api_get(base_url, "builders?field=builderid&field=name")
        _builders_cache = data.get("builders", [])
    return _builders_cache


def resolve_builder_by_id(base_url, builder_id):
    """Return (builderid, name) for a numeric builder ID."""
    data = api_get(base_url, "builders/{}".format(builder_id))
    builders = data.get("builders", [])
    if not builders:
        print("Error: builder id {} not found.".format(builder_id), file=sys.stderr)
        sys.exit(1)
    b = builders[0]
    return b["builderid"], b["name"]


def resolve_builders_by_name_pattern(base_url, pattern):
    """Return list of (builderid, name) whose name contains pattern (case-insensitive)."""
    all_builders = fetch_all_builders(base_url)
    pattern_lower = pattern.lower()
    matches = [
        (b["builderid"], b["name"])
        for b in all_builders
        if pattern_lower in b["name"].lower()
    ]
    return matches


def resolve_builder_by_exact_name(base_url, name):
    """Return (builderid, name) for an exact builder name, or None if not found."""
    all_builders = fetch_all_builders(base_url)
    for b in all_builders:
        if b["name"] == name:
            return b["builderid"], b["name"]
    return None


def fetch_build_requests_in_window(base_url, builder_id, start_ts, end_ts, complete):
    """Fetch build requests submitted in [start_ts, end_ts].

    complete=True  → completed requests only
    complete=False → in-progress / pending requests only

    Paginates automatically until all results are retrieved.
    """
    results = []
    offset = 0
    total_reported = None

    while True:
        params = [
            ("submitted_at__gt", int(start_ts)),
            ("submitted_at__lt", int(end_ts)),
            ("order", "-buildrequestid"),
            ("limit", PAGE_LIMIT),
            ("offset", offset),
        ]
        if complete:
            params.append(("complete", "1"))
        else:
            params.append(("complete__eq", "false"))

        qs = "&".join("{}={}".format(k, v) for k, v in params)
        path = "builders/{}/buildrequests?{}".format(builder_id, qs)
        data = api_get(base_url, path)

        page = data.get("buildrequests", [])
        if total_reported is None and "meta" in data:
            total_reported = data["meta"].get("total")

        results.extend(page)

        if len(page) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT

    return results, total_reported


# ---------------------------------------------------------------------------
# Builder selection
# ---------------------------------------------------------------------------

def collect_builder_targets(args):
    """Return ordered list of (builderid, name) pairs, deduplicated by ID."""
    base_url = args.base_url
    seen_ids = set()
    targets = []

    def add(bid, bname):
        if bid not in seen_ids:
            seen_ids.add(bid)
            targets.append((bid, bname))

    # --builder-id
    if args.builder_id:
        for bid in args.builder_id:
            pair = resolve_builder_by_id(base_url, bid)
            add(*pair)

    # --builder-name (partial match)
    if args.builder_name:
        for pattern in args.builder_name:
            matches = resolve_builders_by_name_pattern(base_url, pattern)
            if not matches:
                print(
                    "Warning: no builders matched name pattern {!r}".format(pattern),
                    file=sys.stderr,
                )
            for pair in matches:
                add(*pair)

    # --builders group
    if args.builders:
        groups = args.builders
        group_names = []
        if "ALL" in groups:
            group_names = GTK_BUILDERS + WPE_BUILDERS
        else:
            if "GTK" in groups:
                group_names.extend(GTK_BUILDERS)
            if "WPE" in groups:
                group_names.extend(WPE_BUILDERS)

        for name in group_names:
            pair = resolve_builder_by_exact_name(base_url, name)
            if pair is None:
                print(
                    "Warning: builder {!r} not found in API (skipped).".format(name),
                    file=sys.stderr,
                )
                continue
            add(*pair)

    # Default: ALL when no selection given
    if not targets:
        print("No builder selection given; defaulting to ALL (GTK + WPE).", file=sys.stderr)
        for name in GTK_BUILDERS + WPE_BUILDERS:
            pair = resolve_builder_by_exact_name(base_url, name)
            if pair is None:
                print(
                    "Warning: builder {!r} not found in API (skipped).".format(name),
                    file=sys.stderr,
                )
                continue
            add(*pair)

    return targets


# ---------------------------------------------------------------------------
# Digest computation
# ---------------------------------------------------------------------------

def compute_outcomes(completed_requests):
    """Return {outcome_key: count} dict over completed build requests."""
    counts = {}
    for br in completed_requests:
        result = br.get("results", -1)
        if result == 6:
            key = "dropped_mid" if br.get("claimed", False) else "dropped_pre"
        else:
            key = result
        counts[key] = counts.get(key, 0) + 1
    return counts


def compute_timing(completed_requests):
    """Return timing stats dicts for queue_wait, execution, total, skip_wait.

    Excludes cancelled (result=6) and skipped (result=3) requests from
    queue_wait, execution, and total.  Skipped requests get a separate
    skip_wait metric (claimed_at − submitted_at) since their queue wait
    is still meaningful even though execution is near-instant.

    Returns None for each interval if no samples available.
    """
    wait_samples = []
    exec_samples = []
    total_samples = []
    skip_wait_samples = []

    for br in completed_requests:
        result = br.get("results")
        if result == 3:
            submitted = br.get("submitted_at")
            claimed = br.get("claimed_at")
            if submitted is not None and claimed is not None:
                skip_wait_samples.append(claimed - submitted)
            continue
        if result == 6:
            continue
        submitted = br.get("submitted_at")
        claimed = br.get("claimed_at")
        complete = br.get("complete_at")
        if submitted is None or claimed is None or complete is None:
            continue
        wait_samples.append(claimed - submitted)
        exec_samples.append(complete - claimed)
        total_samples.append(complete - submitted)

    return {
        "queue_wait": summary_stats(wait_samples),
        "execution": summary_stats(exec_samples),
        "total": summary_stats(total_samples),
        "skip_wait": summary_stats(skip_wait_samples),
    }


def digest_builder(base_url, builder_id, builder_name, start_ts, end_ts):
    """Compute digest for one builder. Returns a dict."""
    print(
        "  Fetching {}...".format(builder_name),
        file=sys.stderr,
        end="",
        flush=True,
    )

    completed, total_meta = fetch_build_requests_in_window(
        base_url, builder_id, start_ts, end_ts, complete=True
    )
    in_progress, _ = fetch_build_requests_in_window(
        base_url, builder_id, start_ts, end_ts, complete=False
    )

    print(" {} completed, {} in progress".format(len(completed), len(in_progress)), file=sys.stderr)

    if total_meta is not None and total_meta > len(completed):
        print(
            "    Warning: API reports {} total but only {} fetched.".format(
                total_meta, len(completed)
            ),
            file=sys.stderr,
        )

    outcomes = compute_outcomes(completed)
    timing = compute_timing(completed)

    return {
        "builderid": builder_id,
        "name": builder_name,
        "total_requests": len(completed) + len(in_progress),
        "completed": len(completed),
        "in_progress": len(in_progress),
        "outcomes": outcomes,
        "timing": timing,
    }


# ---------------------------------------------------------------------------
# Output — table
# ---------------------------------------------------------------------------

def _fmt_stat_line(label, stats, width=14):
    if stats is None:
        return "  {:<{w}}  (no data)".format(label, w=width)
    parts = [
        "avg {}".format(format_duration(stats["avg"])),
        "median {}".format(format_duration(stats["median"])),
    ]
    if stats["p90"] is not None:
        parts.append("P90 {}".format(format_duration(stats["p90"])))
    parts.append("max {}".format(format_duration(stats["max"])))
    return "  {:<{w}}  {}".format(label, "  ".join(parts), w=width)


def render_table(results, window_start, window_end, generated_at):
    lines = []
    lines.append(
        "QA Digest — {} → {} UTC".format(
            format_ts_long(window_start), format_ts_long(window_end)
        )
    )
    lines.append("Generated:   {} UTC".format(format_ts_long(generated_at)))
    lines.append("")

    for r in results:
        lines.append("{} (id={})".format(r["name"], r["builderid"]))

        # Volume
        lines.append(
            "  Requests:  {} total ({} completed, {} still running)".format(
                r["total_requests"], r["completed"], r["in_progress"]
            )
        )

        # Outcomes
        n_completed = r["completed"]
        outcomes = r["outcomes"]
        if n_completed == 0:
            lines.append("  Outcomes:  (none)")
        else:
            outcome_parts = []
            for key in [0, 1, 2, 3, 4, 5, "dropped_pre", "dropped_mid"]:
                count = outcomes.get(key, 0)
                if count == 0:
                    continue
                label = OUTCOME_LABELS.get(key, str(key))
                pct = 100.0 * count / n_completed
                outcome_parts.append("{} {} ({:.0f}%)".format(label, count, pct))
            lines.append("  Outcomes:  " + "  ".join(outcome_parts) if outcome_parts else "  Outcomes:  (none)")

        # Timing
        t = r["timing"]
        lines.append(_fmt_stat_line("Queue wait:", t["queue_wait"]))
        lines.append(_fmt_stat_line("Execution:", t["execution"]))
        lines.append(_fmt_stat_line("Total:", t["total"]))
        if t["skip_wait"] is not None:
            lines.append(_fmt_stat_line("Skip wait:", t["skip_wait"]))
        lines.append("")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Output — JSON
# ---------------------------------------------------------------------------

def _stats_to_json(stats):
    if stats is None:
        return None
    out = {
        "n": stats["n"],
        "avg_s": round(stats["avg"], 1),
        "median_s": round(stats["median"], 1),
        "max_s": round(stats["max"], 1),
    }
    if stats["p90"] is not None:
        out["p90_s"] = round(stats["p90"], 1)
    return out


def render_json(results, window_start, window_end, generated_at):
    outcome_keys = [0, 1, 2, 3, 4, 5, "dropped_pre", "dropped_mid"]
    builders_out = []
    for r in results:
        outcomes_out = {}
        for key in outcome_keys:
            count = r["outcomes"].get(key, 0)
            label = OUTCOME_LABELS.get(key, str(key))
            outcomes_out[label] = count

        t = r["timing"]
        builders_out.append({
            "builderid": r["builderid"],
            "name": r["name"],
            "total_requests": r["total_requests"],
            "completed": r["completed"],
            "in_progress": r["in_progress"],
            "outcomes": outcomes_out,
            "timing": {
                "queue_wait": _stats_to_json(t["queue_wait"]),
                "execution": _stats_to_json(t["execution"]),
                "total": _stats_to_json(t["total"]),
                "skip_wait": _stats_to_json(t["skip_wait"]),
            },
        })

    data = {
        "window": {
            "start": window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "generated_at": generated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "builders": builders_out,
    }
    return json.dumps(data, indent=2)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()

    global _verbose
    _verbose = args.verbose

    # Compute time window
    if args.start:
        window_end = parse_start_time(args.start)
    else:
        window_end = datetime.now(tz=timezone.utc)
    window_start = window_end - timedelta(hours=args.hours)
    generated_at = datetime.now(tz=timezone.utc)

    start_ts = window_start.timestamp()
    end_ts = window_end.timestamp()

    print(
        "Window: {} → {} UTC ({} h)".format(
            format_ts_long(window_start),
            format_ts_long(window_end),
            args.hours,
        ),
        file=sys.stderr,
    )

    targets = collect_builder_targets(args)
    if not targets:
        print("No builders found. Exiting.", file=sys.stderr)
        sys.exit(1)

    print("Querying {} builder(s)...".format(len(targets)), file=sys.stderr)

    results = []
    for builder_id, builder_name in targets:
        result = digest_builder(args.base_url, builder_id, builder_name, start_ts, end_ts)
        results.append(result)

    if args.format == "table":
        print(render_table(results, window_start, window_end, generated_at))
    else:
        print(render_json(results, window_start, window_end, generated_at))


if __name__ == "__main__":
    main()
