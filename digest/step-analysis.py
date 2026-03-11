#!/usr/bin/env python3
"""
Step Analysis — per-step breakdown for a single Buildbot builder.

Fetches all builds that completed within a time window and then retrieves the
steps for each build (N+1 API calls — count is printed up front). Aggregates
results and durations by step name.

Usage examples:
  step-analysis.py 42
  step-analysis.py "GTK-Linux-64-bit-Release-Tests" --hours 2
  step-analysis.py 42 --steps layout-tests run-api-tests --format json
  step-analysis.py 42 --start "2024-01-15 00:00 UTC"

See qa-digest-design.md for the full design document.
"""

import argparse
import json
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from urllib import error, parse, request

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

DEFAULT_BASE_URL = "https://build.webkit.org/api/v2/"
PAGE_LIMIT = 200

RESULT_NAMES = {
    0: "Success",
    1: "Warnings",
    2: "Failure",
    3: "Skipped",
    4: "Exception",
    5: "Retry",
    6: "Cancelled",
}

# Well-known tester step names for GTK/WPE queues.
# Validate these against the live API — names may drift.
KNOWN_TEST_STEPS = [
    "layout-tests",
    "run-webkit-tests",
    "run-api-tests",
    "webkitpy-test",
    "webkitperl-test",
    "webdriver-tests",
]

# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Step Analysis: per-step breakdown for a single Buildbot builder.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.strip(),
    )
    parser.add_argument(
        "builder",
        help="Builder ID (integer) or name (exact or partial match)",
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
            "Window end-point in UTC, e.g. '2024-01-15 00:00 UTC'. "
            "Defaults to now."
        ),
    )
    parser.add_argument(
        "--steps",
        nargs="+",
        metavar="STEP",
        help=(
            "Restrict output to these step name(s). "
            "Partial match, case-insensitive. "
            "Defaults to all steps."
        ),
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
    """Return avg/median/p90/max for a list of numeric values. Returns None if empty."""
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


def resolve_builder(base_url, builder_arg):
    """Return (builderid, name). Tries integer ID first, then exact name, then partial."""
    try:
        builder_id = int(builder_arg)
        data = api_get(base_url, "builders/{}".format(builder_id))
        builders = data.get("builders", [])
        if not builders:
            print("Error: builder id {} not found.".format(builder_id), file=sys.stderr)
            sys.exit(1)
        b = builders[0]
        return b["builderid"], b["name"]
    except ValueError:
        pass

    # Name lookup — fetch all builders and search
    data = api_get(base_url, "builders?field=builderid&field=name")
    all_builders = data.get("builders", [])

    # Exact match first
    for b in all_builders:
        if b["name"] == builder_arg:
            return b["builderid"], b["name"]

    # Partial match
    pattern_lower = builder_arg.lower()
    matches = [b for b in all_builders if pattern_lower in b["name"].lower()]
    if len(matches) == 1:
        b = matches[0]
        return b["builderid"], b["name"]
    if len(matches) > 1:
        print(
            "Error: pattern {!r} matches {} builders; be more specific:".format(
                builder_arg, len(matches)
            ),
            file=sys.stderr,
        )
        for b in matches:
            print("  {} (id={})".format(b["name"], b["builderid"]), file=sys.stderr)
        sys.exit(1)

    print("Error: builder {!r} not found.".format(builder_arg), file=sys.stderr)
    sys.exit(1)


def fetch_builds_in_window(base_url, builder_id, start_ts, end_ts):
    """Fetch completed builds with complete_at in [start_ts, end_ts]. Paginates."""
    results = []
    offset = 0
    total_reported = None

    while True:
        params = [
            ("complete_at__gt", int(start_ts)),
            ("complete_at__lt", int(end_ts)),
            ("complete", "1"),
            ("order", "-number"),
            ("limit", PAGE_LIMIT),
            ("offset", offset),
            ("field", "buildid"),
            ("field", "number"),
            ("field", "results"),
            ("field", "started_at"),
            ("field", "complete_at"),
        ]
        qs = "&".join("{}={}".format(k, v) for k, v in params)
        path = "builders/{}/builds?{}".format(builder_id, qs)
        data = api_get(base_url, path)

        page = data.get("builds", [])
        if total_reported is None and "meta" in data:
            total_reported = data["meta"].get("total")

        results.extend(page)
        if len(page) < PAGE_LIMIT:
            break
        offset += PAGE_LIMIT

    return results, total_reported


def fetch_steps_for_build(base_url, build_id):
    """Fetch step timing and results for a single build."""
    path = (
        "builds/{}/steps"
        "?field=stepid&field=name&field=number&field=results"
        "&field=started_at&field=complete_at".format(build_id)
    )
    data = api_get(base_url, path)
    return data.get("steps", [])


# ---------------------------------------------------------------------------
# Step aggregation
# ---------------------------------------------------------------------------

def aggregate_steps(builds_with_steps, step_filter):
    """Group step results and durations by step name.

    step_filter: list of lowercase patterns; empty = include all.
    Returns dict keyed by step name.
    """
    # step_data[name] = {"results": [codes], "durations": [seconds]}
    step_data = defaultdict(lambda: {"results": [], "durations": []})
    all_step_names = set()

    for steps in builds_with_steps:
        for step in steps:
            name = step.get("name", "")
            all_step_names.add(name)

            if step_filter:
                name_lower = name.lower()
                if not any(p in name_lower for p in step_filter):
                    continue

            results_code = step.get("results")
            if results_code is not None:
                step_data[name]["results"].append(results_code)

            started = step.get("started_at")
            complete = step.get("complete_at")
            if started is not None and complete is not None:
                step_data[name]["durations"].append(complete - started)

    return dict(step_data), sorted(all_step_names)


def compute_step_stats(step_data):
    """Compute per-step aggregated statistics."""
    out = {}
    for name, data in step_data.items():
        results = data["results"]
        n = len(results)
        success_count = sum(1 for r in results if r in (0, 1))
        failure_count = sum(1 for r in results if r == 2)
        success_rate = (100.0 * success_count / n) if n > 0 else None

        out[name] = {
            "n_builds": n,
            "success_count": success_count,
            "failure_count": failure_count,
            "success_rate": success_rate,
            "timing": summary_stats(data["durations"]),
            "result_dist": {
                RESULT_NAMES.get(r, str(r)): results.count(r)
                for r in set(results)
            },
        }
    return out


# ---------------------------------------------------------------------------
# Output — table
# ---------------------------------------------------------------------------

def _fmt_timing(stats):
    if stats is None:
        return "(no timing data)"
    parts = [
        "avg {}".format(format_duration(stats["avg"])),
        "median {}".format(format_duration(stats["median"])),
    ]
    if stats["p90"] is not None:
        parts.append("P90 {}".format(format_duration(stats["p90"])))
    parts.append("max {}".format(format_duration(stats["max"])))
    return "  ".join(parts)


def render_table(builder_id, builder_name, step_stats, step_names, all_step_names,
                 window_start, window_end, generated_at, n_builds):
    lines = []
    lines.append(
        "Step Analysis — {} → {} UTC".format(
            format_ts_long(window_start), format_ts_long(window_end)
        )
    )
    lines.append("Generated:  {} UTC".format(format_ts_long(generated_at)))
    lines.append("Builder:    {} (id={})".format(builder_name, builder_id))
    lines.append("Builds:     {} completed in window".format(n_builds))
    lines.append("")

    if not step_stats:
        lines.append("  (no step data)")
        return "\n".join(lines)

    # Sort steps by name for stable output
    for name in sorted(step_stats.keys()):
        s = step_stats[name]
        rate = "{:.0f}%".format(s["success_rate"]) if s["success_rate"] is not None else "n/a"
        lines.append("  {}".format(name))
        lines.append(
            "    Builds: {}  Success rate: {}  (ok={} fail={})".format(
                s["n_builds"], rate, s["success_count"], s["failure_count"]
            )
        )

        # Result distribution for non-zero/non-one results
        extra = {k: v for k, v in s["result_dist"].items() if k not in ("Success", "Warnings")}
        if extra:
            dist_str = "  ".join("{} {}".format(k, v) for k, v in sorted(extra.items()))
            lines.append("    Other outcomes: " + dist_str)

        lines.append("    Timing:  " + _fmt_timing(s["timing"]))
        lines.append("")

    # Always show the full set of step names seen, to aid step-name drift detection
    lines.append("Steps seen in these builds ({} unique):".format(len(all_step_names)))
    for name in sorted(all_step_names):
        lines.append("  " + name)

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


def render_json(builder_id, builder_name, step_stats, all_step_names,
                window_start, window_end, generated_at, n_builds):
    steps_out = {}
    for name, s in step_stats.items():
        steps_out[name] = {
            "n_builds": s["n_builds"],
            "success_count": s["success_count"],
            "failure_count": s["failure_count"],
            "success_rate": round(s["success_rate"], 1) if s["success_rate"] is not None else None,
            "result_dist": s["result_dist"],
            "timing": _stats_to_json(s["timing"]),
        }

    data = {
        "window": {
            "start": window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "generated_at": generated_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "builder": {"builderid": builder_id, "name": builder_name},
        "n_builds": n_builds,
        "steps": steps_out,
        "all_step_names_seen": sorted(all_step_names),
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

    base_url = args.base_url

    builder_id, builder_name = resolve_builder(base_url, args.builder)

    print(
        "Builder:  {} (id={})".format(builder_name, builder_id),
        file=sys.stderr,
    )
    print(
        "Window:   {} → {} UTC ({} h)".format(
            format_ts_long(window_start),
            format_ts_long(window_end),
            args.hours,
        ),
        file=sys.stderr,
    )

    print("Fetching builds in window...", file=sys.stderr)
    builds, total_meta = fetch_builds_in_window(base_url, builder_id, start_ts, end_ts)

    if not builds:
        print("No completed builds found in window.", file=sys.stderr)
        sys.exit(0)

    print("Found {} builds. Fetching steps ({} API calls)...".format(
        len(builds), len(builds)), file=sys.stderr)

    if len(builds) > 50:
        print(
            "Note: fetching steps for {} builds will make {} HTTP requests. "
            "Consider using --hours with a shorter window.".format(len(builds), len(builds)),
            file=sys.stderr,
        )

    step_filter = [p.lower() for p in args.steps] if args.steps else []

    builds_with_steps = []
    for i, build in enumerate(builds):
        build_id = build["buildid"]
        print(
            "\r  {}/{}".format(i + 1, len(builds)),
            file=sys.stderr,
            end="",
            flush=True,
        )
        steps = fetch_steps_for_build(base_url, build_id)
        builds_with_steps.append(steps)

    print("", file=sys.stderr)  # newline after progress counter

    step_data, all_step_names = aggregate_steps(builds_with_steps, step_filter)
    step_stats = compute_step_stats(step_data)

    if not step_stats:
        if step_filter:
            print(
                "No steps matched filter {}. Steps seen: {}".format(
                    args.steps, ", ".join(sorted(all_step_names))
                ),
                file=sys.stderr,
            )
        else:
            print("No step data found.", file=sys.stderr)
        sys.exit(0)

    if args.format == "table":
        print(render_table(
            builder_id, builder_name, step_stats, sorted(step_data.keys()),
            all_step_names, window_start, window_end, generated_at, len(builds)
        ))
    else:
        print(render_json(
            builder_id, builder_name, step_stats, all_step_names,
            window_start, window_end, generated_at, len(builds)
        ))


if __name__ == "__main__":
    main()
