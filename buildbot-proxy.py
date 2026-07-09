from flask import Flask, send_from_directory, request, Response
import requests

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

BUILD_UPSTREAM = "https://build.webkit.org/api/v2/"
BUILD_PREFIX = "/api/v2/"
EWS_UPSTREAM = "https://ews-build.webkit.org/api/v2/"
EWS_PREFIX = "/ews/api/v2/"
UPSTREAM_TIMEOUT = 30  # seconds; matches the frontend's FETCH_TIMEOUT_MS


@app.route("/")
def index():
    return send_from_directory(".", "index.html")


# Catch-all static: serve any file under the repo root -- every HTML page, lib/,
# pages/, components/, the legacy/ tree, style.css, bots.json, favicon, and the
# same-origin ./digest/*.json the dashboard fetches. The API routes below have a
# longer literal prefix, so Werkzeug matches them ahead of this rule.
# send_from_directory safe-joins and rejects path traversal.
@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(".", filename)


@app.route("/api/v2/<path:buildbot_endpoint>")
def buildbot_api(buildbot_endpoint):
    print(f"Getting Buildbot endpoint {buildbot_endpoint}")
    return _proxy(request, "buildbot", buildbot_endpoint)


@app.route("/ews/api/v2/<path:buildbot_endpoint>")
def ews_buildbot_api(buildbot_endpoint):
    print(f"Getting EWS endpoint {buildbot_endpoint}")
    return _proxy(request, "ews", buildbot_endpoint)


def _upstream_for(server, path):
    if server.lower() == "ews":
        return EWS_UPSTREAM + path
    if server.lower() == "buildbot":
        return BUILD_UPSTREAM + path
    return None


def _proxy(request, server, path):
    upstream = _upstream_for(server, path)
    # Flask's <path:...> converter captures only the path; forward the raw query
    # string too, or e.g. builders/{id}/builds?order=-number&limit=2 loses its
    # limit and returns the builder's entire history. Use the raw query_string
    # (not request.args, which is a MultiDict that collapses repeated keys like
    # the builders "field=" params).
    if request.query_string:
        upstream += "?" + request.query_string.decode("utf-8")
    # Clean server-side GET, mirroring dev-proxy.py: no client headers -> no Origin
    # -> Buildbot answers 200 (and uncompressed, which is fine over localhost).
    # Forwarding the browser's headers would risk sending Origin/Cookie/Referer
    # upstream (Origin is exactly what the CORS allow-list rejects).
    resp = requests.get(upstream, timeout=UPSTREAM_TIMEOUT)

    excluded_headers = ['content-encoding',
                        'content-length',
                        'transfer-encoding',
                        'connection',
                        'keep-alive',
                        'proxy-authenticate',
                        'proxy-authorization',
                        'te',
                        'trailers',
                        'upgrade',
                        ]  #NOTE we here exclude all "hop-by-hop headers" defined by RFC 2616 section 13.5.1 ref. https://www.rfc-editor.org/rfc/rfc2616#section-13.5.1
    headers          = [
        (k,v) for k,v in resp.raw.headers.items()
        if k.lower() not in excluded_headers
    ]
    print("proxy %s -> %s [%s]" % (path, upstream, resp.status_code))
    return Response(
        status=resp.status_code, headers=headers, response=resp.content
    )
