# Mock Buildbot Server

A zero-dependency Node.js server that serves fake Buildbot API data for local dashboard development, so you don't need to hit `build.webkit.org`.

## Usage

```bash
node mock-server/server.js                # random seed, port 3000
node mock-server/server.js --port 8080    # custom port
node mock-server/server.js --seed 42      # deterministic data
```

Then open `http://localhost:3000/`. All pages except `charts.html` (which uses `results.webkit.org`) will work.

## What it does

- Serves the dashboard static files from the project root
- Provides `/api/v2/builders` and `/api/v2/builders/:id/builds` endpoints with 20 mock GTK/WPE builders across all tiers
- Generates builds with realistic health profiles (healthy/flaky/broken), in-progress states, and timestamps
- Supports the query parameters the dashboard actually uses: `complete`, `results`, `order`, `limit`, `property=identifier`
- Builders 6 and 133 get 350 builds each with shared identifiers so `unified.html` works

## How localhost detection works

`modules/utils.js` and `unified.js` check `location.hostname` — when it's `localhost` or `127.0.0.1`, API calls use relative paths (`/api/v2/`) instead of `https://build.webkit.org/api/v2/`. UI links to build.webkit.org are unchanged.
