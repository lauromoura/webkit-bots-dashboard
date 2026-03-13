#!/usr/bin/env python3
"""
Fetch and store build request data for the QA digest dashboard.

Modes:
  refresh        — Re-fetch raw requests (24h window), write aggregated snapshots
  daily-summary  — Produce a daily summary JSON for a specific date
  inspect        — Report on stored data without fetching or writing

Usage examples:
  fetch-digest-data.py --mode refresh --builder-id 6 40 --data-dir digest/data -v
  fetch-digest-data.py --mode daily-summary --builder-id 6 40 --data-dir digest/data
  fetch-digest-data.py --mode daily-summary --builder-id 6 40 --data-dir digest/data --date 2026-03-05
  fetch-digest-data.py --mode inspect --data-dir digest/data
  fetch-digest-data.py --mode inspect --builder-id 6 40 --data-dir digest/data
"""

import argparse
import json
import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

# Import digest module from the same directory.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import digest


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------

def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch and store build request data for the QA digest dashboard.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.strip(),
    )
    parser.add_argument(
        "--mode",
        required=True,
        choices=["refresh", "daily-summary", "inspect"],
        help="Operating mode",
    )
    parser.add_argument(
        "--builder-id",
        nargs="+",
        type=int,
        default=None,
        metavar="ID",
        help="One or more builder IDs (integers)",
    )
    parser.add_argument(
        "--data-dir",
        required=True,
        metavar="PATH",
        help="Directory for stored data",
    )
    parser.add_argument(
        "--date",
        metavar="YYYY-MM-DD",
        help="Target date for daily-summary mode (default: yesterday)",
    )
    parser.add_argument(
        "--base-url",
        default=digest.DEFAULT_BASE_URL,
        help="Buildbot API base URL (default: %(default)s)",
    )
    parser.add_argument(
        "--replace-existing",
        action="store_true",
        help="Overwrite the output file entirely instead of merging by builder",
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Print each API request URL to stderr",
    )
    return parser.parse_args()


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def ensure_dirs(data_dir):
    """Create the data directory tree if it doesn't exist."""
    for sub in ("requests", "current", "daily"):
        os.makedirs(os.path.join(data_dir, sub), exist_ok=True)


def merge_builder_results(existing_json_path, new_json_str):
    """Merge new builder entries into an existing JSON file by builderid.

    Loads the existing file (if any), replaces entries whose builderid matches
    one from new_json_str, and keeps all other existing entries intact.
    Returns the merged JSON string.
    """
    new_data = json.loads(new_json_str)
    new_builders = new_data.get("builders", [])

    if not os.path.exists(existing_json_path):
        return new_json_str

    with open(existing_json_path, "r") as f:
        existing_data = json.load(f)

    existing_builders = existing_data.get("builders", [])

    # Build merged list: existing first (skipping those being replaced), then new.
    new_ids = {b["builderid"] for b in new_builders}
    merged = [b for b in existing_builders if b["builderid"] not in new_ids]
    merged.extend(new_builders)

    new_data["builders"] = merged
    return json.dumps(new_data, indent=2)


def atomic_write_json(path, content):
    """Write JSON string to path atomically via temp file + rename."""
    dir_name = os.path.dirname(path)
    fd = None
    tmp_path = None
    try:
        fd, tmp_path = tempfile.mkstemp(dir=dir_name, suffix=".tmp")
        os.write(fd, content.encode("utf-8"))
        os.close(fd)
        fd = None
        os.replace(tmp_path, path)
        tmp_path = None
    finally:
        if fd is not None:
            os.close(fd)
        if tmp_path is not None:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


def resolve_builders(base_url, builder_ids):
    """Resolve builder IDs to (id, name) tuples via the builders API.

    Prints a warning and skips unknown IDs.
    """
    all_builders = digest.fetch_all_builders(base_url)
    by_id = {b["builderid"]: b["name"] for b in all_builders}

    result = []
    for bid in builder_ids:
        name = by_id.get(bid)
        if name is None:
            print("Warning: builder id {} not found, skipping.".format(bid), file=sys.stderr)
            continue
        result.append((bid, name))
    return result


# ---------------------------------------------------------------------------
# Raw request storage
# ---------------------------------------------------------------------------

def extract_minimal_request(raw):
    """Extract the 6 fields we need from a raw build request."""
    return {
        "buildrequestid": raw["buildrequestid"],
        "submitted_at": raw.get("submitted_at"),
        "claimed_at": raw.get("claimed_at"),
        "complete_at": raw.get("complete_at"),
        "results": raw.get("results"),
        "claimed": raw.get("claimed", False),
    }


def fetch_and_store(base_url, builder_id, builder_name, data_dir, now):
    """Fetch completed requests for [now-24h, now], store to disk.

    Returns the wrapper dict.
    """
    start_ts = (now - timedelta(hours=24)).timestamp()
    end_ts = now.timestamp()

    completed, _ = digest.fetch_build_requests_in_window(
        base_url, builder_id, start_ts, end_ts, complete=True
    )
    requests = [extract_minimal_request(r) for r in completed]

    wrapper = {
        "builder_id": builder_id,
        "builder_name": builder_name,
        "base_url": base_url,
        "fetched_at": now.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {
            "start_ts": start_ts,
            "end_ts": end_ts,
        },
        "requests": requests,
    }

    path = os.path.join(data_dir, "requests", "builder-{}.json".format(builder_id))
    atomic_write_json(path, json.dumps(wrapper, indent=2))
    return wrapper


def load_stored_requests(data_dir, builder_id):
    """Load stored requests for a builder. Returns dict or None."""
    path = os.path.join(data_dir, "requests", "builder-{}.json".format(builder_id))
    if not os.path.exists(path):
        return None
    with open(path, "r") as f:
        return json.load(f)


# ---------------------------------------------------------------------------
# Aggregation
# ---------------------------------------------------------------------------

def filter_requests_by_window(requests, start_ts, end_ts):
    """Filter request list to start_ts <= submitted_at < end_ts."""
    return [
        r for r in requests
        if r.get("submitted_at") is not None
        and start_ts <= r["submitted_at"] < end_ts
    ]


def build_result_dict(builder_id, builder_name, requests):
    """Build the dict that digest.render_json expects for one builder."""
    outcomes = digest.compute_outcomes(requests)
    timing = digest.compute_timing(requests)
    return {
        "builderid": builder_id,
        "name": builder_name,
        "total_requests": len(requests),
        "completed": len(requests),
        "in_progress": 0,
        "outcomes": outcomes,
        "timing": timing,
    }


def aggregate_and_write(data_dir, builders, window_hours, filename, now,
                        replace_existing=False):
    """Load stored requests, filter by window, aggregate, and write JSON."""
    start_dt = now - timedelta(hours=window_hours)
    start_ts = start_dt.timestamp()
    end_ts = now.timestamp()

    results = []
    for builder_id, builder_name in builders:
        stored = load_stored_requests(data_dir, builder_id)
        if stored is None:
            print("  Warning: no stored data for {} (id={}), skipping aggregation.".format(
                builder_name, builder_id), file=sys.stderr)
            continue
        filtered = filter_requests_by_window(stored["requests"], start_ts, end_ts)
        result = build_result_dict(builder_id, builder_name, filtered)
        results.append(result)

    json_str = digest.render_json(results, start_dt, now, now)
    path = os.path.join(data_dir, "current", filename)
    if not replace_existing:
        json_str = merge_builder_results(path, json_str)
    atomic_write_json(path, json_str)


# ---------------------------------------------------------------------------
# Request sourcing (stored or API)
# ---------------------------------------------------------------------------

def get_requests_for_window(base_url, builder_id, builder_name, data_dir, start_ts, end_ts):
    """Get requests for a time window, preferring stored data.

    If stored data covers the window, filters and returns from disk.
    Otherwise fetches from the API.
    """
    stored = load_stored_requests(data_dir, builder_id)
    if stored is not None:
        w = stored["window"]
        if w["start_ts"] <= start_ts and w["end_ts"] >= end_ts:
            print("  {} (id={}): using stored data".format(builder_name, builder_id),
                  file=sys.stderr)
            return filter_requests_by_window(stored["requests"], start_ts, end_ts)

    print("  {} (id={}): fetching from API".format(builder_name, builder_id),
          file=sys.stderr)
    completed, _ = digest.fetch_build_requests_in_window(
        base_url, builder_id, start_ts, end_ts, complete=True
    )
    return [extract_minimal_request(r) for r in completed]


# ---------------------------------------------------------------------------
# Mode: refresh
# ---------------------------------------------------------------------------

def mode_refresh(args):
    data_dir = args.data_dir
    ensure_dirs(data_dir)
    builders = resolve_builders(args.base_url, args.builder_id)
    if not builders:
        print("No valid builders. Exiting.", file=sys.stderr)
        return

    now = datetime.now(tz=timezone.utc)
    print("Refreshing {} builder(s)...".format(len(builders)), file=sys.stderr)

    for builder_id, builder_name in builders:
        try:
            wrapper = fetch_and_store(args.base_url, builder_id, builder_name, data_dir, now)
            print("  {} (id={}): {} requests stored".format(
                builder_name, builder_id, len(wrapper["requests"])), file=sys.stderr)
        except Exception as e:
            print("  {} (id={}): ERROR — {}".format(builder_name, builder_id, e),
                  file=sys.stderr)

    # Aggregate for 1h, 6h, 24h windows
    for hours, filename in [(1, "1h.json"), (6, "6h.json"), (24, "24h.json")]:
        aggregate_and_write(data_dir, builders, hours, filename, now,
                            replace_existing=args.replace_existing)
        print("  Wrote current/{}".format(filename), file=sys.stderr)

    print("Refresh complete.", file=sys.stderr)


# ---------------------------------------------------------------------------
# Mode: daily-summary
# ---------------------------------------------------------------------------

def mode_daily_summary(args):
    data_dir = args.data_dir
    ensure_dirs(data_dir)
    builders = resolve_builders(args.base_url, args.builder_id)
    if not builders:
        print("No valid builders. Exiting.", file=sys.stderr)
        return

    # Determine target day
    if args.date:
        try:
            target = datetime.strptime(args.date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            print("Error: invalid date format '{}'. Use YYYY-MM-DD.".format(args.date),
                  file=sys.stderr)
            sys.exit(1)
    else:
        target = datetime.now(tz=timezone.utc).replace(
            hour=0, minute=0, second=0, microsecond=0
        ) - timedelta(days=1)

    day_start = target.replace(hour=0, minute=0, second=0, microsecond=0)
    day_end = day_start + timedelta(days=1)
    start_ts = day_start.timestamp()
    end_ts = day_end.timestamp()

    date_str = day_start.strftime("%Y-%m-%d")
    print("Daily summary for {}".format(date_str), file=sys.stderr)

    results = []
    for builder_id, builder_name in builders:
        requests = get_requests_for_window(
            args.base_url, builder_id, builder_name, data_dir, start_ts, end_ts
        )
        result = build_result_dict(builder_id, builder_name, requests)
        results.append(result)

    now = datetime.now(tz=timezone.utc)
    json_str = digest.render_json(results, day_start, day_end, now)
    out_path = os.path.join(data_dir, "daily", "{}.json".format(date_str))
    if not args.replace_existing:
        json_str = merge_builder_results(out_path, json_str)
    atomic_write_json(out_path, json_str)
    print("Wrote daily/{}.json".format(date_str), file=sys.stderr)

    for r in results:
        print("  {} (id={}): {} completed".format(r["name"], r["builderid"], r["completed"]),
              file=sys.stderr)


# ---------------------------------------------------------------------------
# Mode: inspect
# ---------------------------------------------------------------------------

def discover_builder_ids(data_dir):
    """Discover builder IDs from stored request files on disk."""
    requests_dir = os.path.join(data_dir, "requests")
    if not os.path.isdir(requests_dir):
        return []
    ids = []
    for f in sorted(os.listdir(requests_dir)):
        if f.startswith("builder-") and f.endswith(".json"):
            try:
                ids.append(int(f[len("builder-"):-len(".json")]))
            except ValueError:
                pass
    return ids


def mode_inspect(args):
    data_dir = args.data_dir

    builder_ids = args.builder_id
    if builder_ids is None:
        builder_ids = discover_builder_ids(data_dir)
        if not builder_ids:
            print("No stored builder data found in {}/requests/".format(data_dir))
            return

    print("=== Stored raw requests ===")
    for builder_id in builder_ids:
        stored = load_stored_requests(data_dir, builder_id)
        if stored is None:
            print("  builder-{}.json: no stored data".format(builder_id))
            continue

        requests = stored["requests"]
        name = stored.get("builder_name", "(unknown)")
        fetched_at = stored.get("fetched_at", "(unknown)")
        window = stored.get("window", {})

        print("  builder-{}.json: {}".format(builder_id, name))
        print("    Fetched at:  {}".format(fetched_at))
        if window:
            ws = datetime.fromtimestamp(window["start_ts"], tz=timezone.utc)
            we = datetime.fromtimestamp(window["end_ts"], tz=timezone.utc)
            print("    Window:      {} → {} UTC".format(
                ws.strftime("%Y-%m-%d %H:%M"), we.strftime("%Y-%m-%d %H:%M")))
        print("    Requests:    {}".format(len(requests)))

        if requests:
            submitted_times = [r["submitted_at"] for r in requests if r.get("submitted_at")]
            if submitted_times:
                earliest = datetime.fromtimestamp(min(submitted_times), tz=timezone.utc)
                latest = datetime.fromtimestamp(max(submitted_times), tz=timezone.utc)
                print("    Date range:  {} → {}".format(
                    earliest.strftime("%Y-%m-%d %H:%M"),
                    latest.strftime("%Y-%m-%d %H:%M")))

            # Outcome summary
            outcomes = digest.compute_outcomes(requests)
            outcome_parts = []
            for key in [0, 1, 2, 3, 4, 5, "dropped_pre", "dropped_mid"]:
                count = outcomes.get(key, 0)
                if count == 0:
                    continue
                label = digest.OUTCOME_LABELS.get(key, str(key))
                outcome_parts.append("{} {}".format(label, count))
            if outcome_parts:
                print("    Outcomes:    {}".format("  ".join(outcome_parts)))

    # List current/*.json files
    current_dir = os.path.join(data_dir, "current")
    print("\n=== Current snapshots ===")
    if os.path.isdir(current_dir):
        files = sorted(f for f in os.listdir(current_dir) if f.endswith(".json"))
        if files:
            for f in files:
                path = os.path.join(current_dir, f)
                stat = os.stat(path)
                mtime = datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc)
                print("  {}  ({:,} B, modified {})".format(
                    f, stat.st_size, mtime.strftime("%Y-%m-%d %H:%M UTC")))
        else:
            print("  (none)")
    else:
        print("  (directory not found)")

    # List daily/*.json files
    daily_dir = os.path.join(data_dir, "daily")
    print("\n=== Daily summaries ===")
    if os.path.isdir(daily_dir):
        files = sorted(f for f in os.listdir(daily_dir) if f.endswith(".json"))
        if files:
            dates = [f.replace(".json", "") for f in files]
            print("  {} file(s): {} → {}".format(len(files), dates[0], dates[-1]))
            for f in files:
                path = os.path.join(daily_dir, f)
                stat = os.stat(path)
                print("    {}  ({:,} B)".format(f, stat.st_size))
        else:
            print("  (none)")
    else:
        print("  (directory not found)")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = parse_args()
    digest._verbose = args.verbose

    if args.mode in ("refresh", "daily-summary") and args.builder_id is None:
        print("Error: --builder-id is required for '{}' mode.".format(args.mode),
              file=sys.stderr)
        sys.exit(1)

    if args.mode == "refresh":
        mode_refresh(args)
    elif args.mode == "daily-summary":
        mode_daily_summary(args)
    elif args.mode == "inspect":
        mode_inspect(args)


if __name__ == "__main__":
    main()
