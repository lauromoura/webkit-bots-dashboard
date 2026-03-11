#!/usr/bin/env python3

import argparse
import csv
import io
import json
import statistics
import sys
from datetime import datetime, timezone
from urllib import request, parse, error

DEFAULT_BASE_URL = "https://build.webkit.org/api/v2/"
DEFAULT_COUNT = 20

RESULT_NAMES = {
    0: "OK",
    1: "Warnings",
    2: "Failure",
    3: "Skipped",
    4: "Exception",
    5: "Retry",
    6: "Cancelled",
}


def result_name(code):
    return RESULT_NAMES.get(code, "Unknown({})".format(code))


def parse_args():
    parser = argparse.ArgumentParser(
        description="Inspect build request timing intervals for a Buildbot builder."
    )
    parser.add_argument(
        "builder",
        help="Builder ID (integer) or name (string)",
    )
    parser.add_argument(
        "-n", "--count",
        type=int,
        default=DEFAULT_COUNT,
        help="Number of recent completed requests to fetch (default: %(default)s)",
    )
    parser.add_argument(
        "-f", "--format",
        choices=["table", "csv", "json"],
        default="table",
        help="Output format (default: %(default)s)",
    )
    parser.add_argument(
        "-o", "--output",
        metavar="FILE",
        help="Write output to file instead of stdout",
    )
    parser.add_argument(
        "--base-url",
        default=DEFAULT_BASE_URL,
        help="Buildbot API base URL (default: %(default)s)",
    )
    return parser.parse_args()


def api_get(base_url, path):
    url = base_url.rstrip("/") + "/" + path.lstrip("/")
    req = request.Request(url)
    with request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


def resolve_builder(base_url, builder_arg):
    """Return (builderid, name) for the given builder argument."""
    try:
        builder_id = int(builder_arg)
        path = "builders/{}".format(builder_id)
    except ValueError:
        path = "builders/{}".format(parse.quote(builder_arg, safe=""))

    data = api_get(base_url, path)
    builders = data.get("builders", [])
    if not builders:
        print("Error: builder '{}' not found.".format(builder_arg), file=sys.stderr)
        sys.exit(1)
    b = builders[0]
    return b["builderid"], b["name"]


def fetch_build_requests(base_url, builder_id, count):
    path = "builders/{}/buildrequests?complete__eq=true&order=-buildrequestid&limit={}".format(
        builder_id, count
    )
    data = api_get(base_url, path)
    return data.get("buildrequests", [])


def compute_intervals(requests):
    results = []
    for br in requests:
        submitted = br["submitted_at"]
        claimed = br.get("claimed_at")
        complete = br.get("complete_at")

        if claimed is None or complete is None:
            continue

        queue_wait = claimed - submitted
        execution = complete - claimed
        total = complete - submitted

        results.append({
            "request_id": br["buildrequestid"],
            "submitted_at": submitted,
            "claimed_at": claimed,
            "complete_at": complete,
            "queue_wait_s": queue_wait,
            "execution_s": execution,
            "total_s": total,
            "results": br.get("results", -1),
        })
    return results


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


def format_iso(epoch):
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def summary_stats(values):
    if not values:
        return {"avg": 0, "median": 0, "min": 0, "max": 0}
    return {
        "avg": statistics.mean(values),
        "median": statistics.median(values),
        "min": min(values),
        "max": max(values),
    }


def output_table(builder_id, builder_name, intervals, out):
    out.write("Builder: {} (id={})\n".format(builder_name, builder_id))
    out.write("{} most recent completed build requests:\n\n".format(len(intervals)))

    header = " {:>10s} | {:19s} | {:>10s} | {:>10s} | {:>10s} | {:10s}".format(
        "Request ID", "Submitted", "Queue Wait", "Execution", "Total", "Status"
    )
    sep = "-" * len(header)
    out.write(header + "\n")
    out.write(sep + "\n")

    for r in intervals:
        out.write(" {:>10d} | {:19s} | {:>10s} | {:>10s} | {:>10s} | {:10s}\n".format(
            r["request_id"],
            format_timestamp(r["submitted_at"]),
            format_duration(r["queue_wait_s"]),
            format_duration(r["execution_s"]),
            format_duration(r["total_s"]),
            result_name(r["results"]),
        ))

    out.write("\nSummary ({} requests):\n".format(len(intervals)))

    queue_stats = summary_stats([r["queue_wait_s"] for r in intervals])
    exec_stats = summary_stats([r["execution_s"] for r in intervals])
    total_stats = summary_stats([r["total_s"] for r in intervals])

    stat_header = "  {:14s} {:>10s} {:>10s} {:>10s} {:>10s}".format(
        "", "Avg", "Median", "Min", "Max"
    )
    out.write(stat_header + "\n")

    for label, stats in [("Queue wait:", queue_stats), ("Execution:", exec_stats), ("Total:", total_stats)]:
        out.write("  {:14s} {:>10s} {:>10s} {:>10s} {:>10s}\n".format(
            label,
            format_duration(stats["avg"]),
            format_duration(stats["median"]),
            format_duration(stats["min"]),
            format_duration(stats["max"]),
        ))


def output_csv(intervals, out):
    writer = csv.writer(out)
    writer.writerow([
        "request_id", "submitted_at", "claimed_at", "complete_at",
        "queue_wait_s", "execution_s", "total_s", "results", "result_name",
    ])
    for r in intervals:
        writer.writerow([
            r["request_id"],
            format_iso(r["submitted_at"]),
            format_iso(r["claimed_at"]),
            format_iso(r["complete_at"]),
            r["queue_wait_s"],
            r["execution_s"],
            r["total_s"],
            r["results"],
            result_name(r["results"]),
        ])


def output_json(builder_id, builder_name, intervals, out):
    data = {
        "builder": {"builderid": builder_id, "name": builder_name},
        "requests": [
            {
                "request_id": r["request_id"],
                "submitted_at": format_iso(r["submitted_at"]),
                "claimed_at": format_iso(r["claimed_at"]),
                "complete_at": format_iso(r["complete_at"]),
                "queue_wait_s": r["queue_wait_s"],
                "execution_s": r["execution_s"],
                "total_s": r["total_s"],
                "results": r["results"],
                "result_name": result_name(r["results"]),
            }
            for r in intervals
        ],
    }
    json.dump(data, out, indent=2)
    out.write("\n")


def main():
    args = parse_args()

    builder_id, builder_name = resolve_builder(args.base_url, args.builder)

    if args.format == "table":
        print("Builder: {} (id={})".format(builder_name, builder_id), file=sys.stderr)
        print("Fetching {} most recent completed build requests...".format(args.count), file=sys.stderr)

    raw_requests = fetch_build_requests(args.base_url, builder_id, args.count)

    if not raw_requests:
        print("No completed build requests found.", file=sys.stderr)
        sys.exit(0)

    intervals = compute_intervals(raw_requests)

    if not intervals:
        print("No build requests with complete timing data found.", file=sys.stderr)
        sys.exit(0)

    if args.output:
        out = open(args.output, "w")
    else:
        out = sys.stdout

    try:
        if args.format == "table":
            output_table(builder_id, builder_name, intervals, out)
        elif args.format == "csv":
            output_csv(intervals, out)
        elif args.format == "json":
            output_json(builder_id, builder_name, intervals, out)
    finally:
        if args.output:
            out.close()


if __name__ == "__main__":
    main()
