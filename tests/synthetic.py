"""
Synthetic Buildbot responses for scenario tests.

The recorded fixtures only show what production looked like at recording
time. To test a specific situation (a broken builder, a build still running,
a skipped EWS run, ...), answer the relevant requests in the test itself:

    from synthetic import build, builds_response, fulfill_json

    now = int(frozen_time.timestamp())
    page.route(re.compile(r".*/api/v2/builders/6/builds\\?.*"),
               lambda route: fulfill_json(route, builds_response(
                   build(6, number=10, results=FAILURE, now=now),
                   build(6, number=9, now=now))))

Keep scenarios small and targeted, and assert on what the page shows.
"""

import json

# Buildbot result codes (lib/results.js).
SUCCESS, WARNINGS, FAILURE, SKIPPED, EXCEPTION, RETRY, CANCELLED = range(7)


def build(builder_id, number=1, *, now, results=SUCCESS, complete=True,
          state_string=None, started_ago=3600, duration=1800, **fields):
    """One build as the Buildbot builds API returns it.

    now: the frozen test time (epoch seconds). A running build
    (complete=False) has no results and complete_at=None, like the real API.
    Extra keyword arguments are merged into the build (e.g. properties=...).
    """
    started_at = now - started_ago
    if state_string is None:
        state_string = ("building" if not complete
                        else "build successful" if results == SUCCESS else "failed")
    data = {
        "builderid": builder_id, "buildid": 900000 + builder_id * 1000 + number,
        "number": number, "complete": complete,
        "results": results if complete else None,
        "state_string": state_string,
        "started_at": started_at,
        "complete_at": started_at + duration if complete else None,
        "properties": {}, "workerid": 1, "masterid": 1, "buildrequestid": 1,
    }
    data.update(fields)
    return data


def builds_response(*builds):
    return {"builds": list(builds), "meta": {"total": len(builds)}}


def fulfill_json(route, data, status=200):
    """Answer an intercepted Playwright route with a JSON body."""
    route.fulfill(status=status, content_type="application/json", body=json.dumps(data))
