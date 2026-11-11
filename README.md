# webkit-bots-dashboard

Some experiments with a dashboard for WebKit Gardeners/Bot maintainters,
trying to provide more useful information than the default buildbot views.

## Local development

Only the production hosts (`people.igalia.com`, `teams.pages.igalia.com`) are on
the Buildbot CORS allow-list, so anywhere else (localhost, Codespaces, ...) the
pages call the API through `/api/v2/` and `/ews/api/v2/` on their own origin
(see `lib/config.js`). Run the dev proxy, which serves the pages and forwards
those paths server-side:

    ./dev-proxy.py                      # live data on http://localhost:8000/
    ./dev-proxy.py --record fixtures/   # live, and snapshot every API response
    ./dev-proxy.py --replay fixtures/   # offline, answered from the snapshot

The proxy caches responses for 60 s, coalesces duplicate requests and limits
itself to 2 concurrent upstream requests, so reloading pages while iterating
doesn't hammer the WebKit bots. See `./dev-proxy.py --help` for the knobs.
