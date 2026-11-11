/**
 * Central configuration for the dashboard: where the Buildbot APIs live, when
 * to call them directly vs through the dev proxy, and the tunables shared by
 * several pages. Builder lists and page sections stay in their own pages.
 *
 * Browser-free on purpose (only apiBase()/usesDirectAPI() read
 * location.hostname, and only when no hostname is passed), so it can be
 * imported from Node for checks.
 */

// --- Buildbot instances -----------------------------------------------------

/**
 * site:        web UI / API origin of the Buildbot instance.
 * proxyPrefix: path that dev-proxy.py / buildbot-proxy.py forward to
 *              `${site}/api/v2/`.
 */
export const BUILDBOTS = {
    postCommit: { site: "https://build.webkit.org", proxyPrefix: "/api/v2/" },
    ews: { site: "https://ews-build.webkit.org", proxyPrefix: "/ews/api/v2/" },
};

/**
 * Hosts allowed to call the Buildbot APIs directly from the browser. Buildbot
 * rejects any other Origin ("invalid origin"); the allow-list lives in WebKit's
 * Tools/CISupport/{build-webkit-org,ews-build}-webserver/master.cfg
 * (allowed_origins). Everywhere else (localhost, Codespaces, LAN IPs, ...) the
 * page must go through the same-origin proxy.
 */
export const DIRECT_API_HOSTS = ["people.igalia.com", "teams.pages.igalia.com"];

/** Whether pages on `hostname` call Buildbot directly (vs through the proxy). */
export function usesDirectAPI(hostname = location.hostname) {
    return DIRECT_API_HOSTS.includes(hostname);
}

/**
 * Base URL for API calls to a Buildbot instance, ending in "/".
 * @param {"postCommit"|"ews"} kind
 */
export function apiBase(kind, hostname = location.hostname) {
    const buildbot = BUILDBOTS[kind];
    if (!buildbot)
        throw new Error(`Unknown Buildbot kind: ${kind}`);
    return usesDirectAPI(hostname) ? `${buildbot.site}/api/v2/` : buildbot.proxyPrefix;
}

/**
 * Base URL of a Buildbot instance's web UI, ending in "/" (links such as
 * `${siteBase("ews")}#/builders/1`).
 * @param {"postCommit"|"ews"} kind
 */
export function siteBase(kind) {
    const buildbot = BUILDBOTS[kind];
    if (!buildbot)
        throw new Error(`Unknown Buildbot kind: ${kind}`);
    return `${buildbot.site}/`;
}

// --- Fetching, caching, refreshing -------------------------------------------

export const FETCH_TIMEOUT_MS = 30_000;
export const REFRESH_INTERVAL_MS = 300_000;   // 5 minutes
export const STEP_CACHE_MAX = 50;             // localStorage step-cache entries

// --- Queue status pages --------------------------------------------------------

/** Severity thresholds for queue.html / ews-queue.html (see queue-row.js). */
export const QUEUE_THRESHOLDS = {
    postCommit: {
        spinupThresholdSec: 600,       // 10 minutes: normal worker spin-up time
        pendingWarnThreshold: 3,
        waitWarnThresholdSec: 1800,    // 30 minutes
    },
    // Same as post-commit for now, kept separate so they can be tuned
    // independently.
    ews: {
        spinupThresholdSec: 600,
        pendingWarnThreshold: 3,
        waitWarnThresholdSec: 1800,
    },
};

/** ews-queue.html only shows EWS builders whose name contains one of these. */
export const EWS_QUEUE_NAME_FILTERS = ["WPE", "GTK", "JSC-ARMv7"];

// --- Gardening EWS tables ------------------------------------------------------

export const EWS_GARDENING = {
    runningLimit: 50,       // max in-progress builds listed per queue
    finishedWindow: 15,     // finished builds looked at per queue (skip count)
    olderRuns: 5,           // older real runs shown as pills
    churnThreshold: 0.5,    // skipped fraction from which the count turns amber
};
