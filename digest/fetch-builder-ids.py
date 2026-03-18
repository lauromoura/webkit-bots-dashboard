#!/usr/bin/env python3
"""Print WPE/GTK/JSC builder IDs from the Buildbot API.

Usage:
  fetch-builder-ids.py                  # post-commit bots
  fetch-builder-ids.py --ews            # EWS bots
  fetch-builder-ids.py > post-commit-ids.txt
"""

import argparse, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import digest

RELEVANT_TAGS = {"WPE", "GTK", "ARMv7", "JSCOnly"}


def main():
    parser = argparse.ArgumentParser(description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--ews", action="store_true",
        help="Query EWS server instead of post-commit")
    parser.add_argument("--base-url",
        help="Override base URL (default depends on --ews)")
    parser.add_argument("-v", "--verbose", action="store_true",
        help="Print builder names to stderr")
    args = parser.parse_args()

    base_url = args.base_url or (digest.EWS_BASE_URL if args.ews else digest.DEFAULT_BASE_URL)

    data = digest.api_get(base_url,
        "builders?field=builderid&field=name&field=tags&field=masterids")
    all_builders = data.get("builders", [])

    matched = []
    for b in all_builders:
        tags = set(b.get("tags", []))
        if not tags & RELEVANT_TAGS:
            continue
        if not b.get("masterids"):
            continue
        matched.append((b["builderid"], b["name"]))

    matched.sort(key=lambda x: x[1])

    if not matched:
        print("No matching builders found.", file=sys.stderr)
        sys.exit(1)

    if args.verbose:
        for bid, name in matched:
            print(f"  {bid:>5}  {name}", file=sys.stderr)
        print(f"{len(matched)} builders", file=sys.stderr)

    print(" ".join(str(bid) for bid, _ in matched))


if __name__ == "__main__":
    main()
