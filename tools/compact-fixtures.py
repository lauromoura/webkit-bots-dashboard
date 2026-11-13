#!/usr/bin/env python3
"""Rewrite recorded dev-proxy fixtures as compact JSON (no indentation).

dev-proxy.py --record writes indented JSON, which is handy to read; the
committed test fixtures are compacted to keep the repository small.
Usage: tools/compact-fixtures.py DIR
"""
import glob
import json
import os
import sys

root = sys.argv[1]
before = after = 0
for path in glob.glob(os.path.join(root, "**", "*.json"), recursive=True):
    before += os.path.getsize(path)
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    after += os.path.getsize(path)
print("compacted %s: %d KB -> %d KB" % (root, before // 1024, after // 1024))
