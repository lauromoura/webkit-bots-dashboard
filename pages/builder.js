import { startAutoRefresh } from "../lib/auto-refresh.js";
import { fetchAPI, createAPI, getAllPendingRequests, getAllWorkers } from "../lib/api.js";
import { buildbotBuilderURL, buildbotBuildRequestURL, workerPageURL } from "../lib/urls.js";
import { formatRelativeDateFromNow } from "../lib/format.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuildHistoryTable } from "../components/build-history-table.js";
import { classifyWorker } from "../components/queue-row.js";
import { el } from "../components/_dom.js";
import { computeMetrics, formatPercent, formatDuration } from "./_digest-utils.js";

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const EWS_BASE_URL = isLocal ? "/ews/api/v2/" : "https://ews-build.webkit.org/api/v2/";
const EWS_BUILDBOT_BASE = "https://ews-build.webkit.org/";

function formatDateStr(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchBuilderDailySummary(builderId, n = 7) {
    const id = parseInt(builderId, 10);
    const dates = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(formatDateStr(d));
    }

    const results = await Promise.all(dates.map(async (dateStr) => {
        try {
            const resp = await fetch(`./digest/data/daily/${dateStr}.json`, { cache: "no-store" });
            if (!resp.ok) return { date: dateStr, builder: null };
            const data = await resp.json();
            const entry = data.builders?.find(b => b.builderid === id);
            return { date: dateStr, builder: entry || null };
        } catch {
            return { date: dateStr, builder: null };
        }
    }));

    const days = new Map();
    for (const { date, builder } of results) {
        if (!builder) continue;
        const metrics = computeMetrics(builder);
        days.set(date, { passRate: metrics.passRate, healthStatus: metrics.healthStatus, builder });
    }

    return { dates, days };
}

function buildDayTooltip(dayData) {
    const { outcomes, timing } = dayData.builder;
    const parts = [];

    // Outcome counts
    const outcomeParts = Object.entries(outcomes)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => `${k}: ${v}`);
    if (outcomeParts.length > 0)
        parts.push("Outcomes: " + outcomeParts.join(", "));

    // Timing breakdown
    const fmtPhase = (label, stats) => {
        if (!stats || stats.n === 0) return null;
        return `${label} avg ${formatDuration(stats.avg_s)}, median ${formatDuration(stats.median_s)}, p90 ${formatDuration(stats.p90_s)}`;
    };
    const timingLines = [
        fmtPhase("Exec", timing.execution),
        fmtPhase("Queue", timing.queue_wait),
    ].filter(Boolean);
    if (timingLines.length > 0)
        parts.push("Timing: " + timingLines.join("\n        "));

    return parts.join("\n");
}

function renderDailySummarySection(dates, days) {
    // Filter to dates that have data, newest first
    const activeDates = [...dates].reverse().filter(d => days.has(d));
    if (activeDates.length === 0) return null;

    const cellClass = (status) => {
        const map = { green: "digest-trend-cell-green", yellow: "digest-trend-cell-yellow", red: "digest-trend-cell-red" };
        return map[status] || "digest-trend-cell-gray";
    };

    // Precompute tooltips per date
    const tooltips = new Map();
    for (const date of activeDates)
        tooltips.set(date, buildDayTooltip(days.get(date)));

    // Header row: empty label cell + date columns
    const headerCells = [el("th")];
    for (const date of activeDates)
        headerCells.push(el("th", { textContent: date.slice(5) }));

    // Metric row definitions
    const metrics = [
        { label: "Pass rate", value: (d) => formatPercent(d.passRate), cellClass: (d) => cellClass(d.healthStatus) },
        { label: "Completed", value: (d) => String(d.builder.completed) },
        { label: "Skipped", value: (d) => String(d.builder.outcomes.Skipped || 0) },
        { label: "Avg exec", value: (d) => formatDuration(d.builder.timing.execution?.avg_s) },
    ];

    const bodyRows = metrics.map(metric => {
        const cells = [el("td", { textContent: metric.label })];
        for (const date of activeDates) {
            const dayData = days.get(date);
            const attrs = { textContent: metric.value(dayData), title: tooltips.get(date) };
            if (metric.cellClass) attrs.className = metric.cellClass(dayData);
            cells.push(el("td", attrs));
        }
        return el("tr", null, cells);
    });

    return el("section", null, [
        el("h3", null, ["Daily summary"]),
        el("table", { className: "digest-trend-table" }, [
            el("thead", null, [el("tr", null, headerCells)]),
            el("tbody", null, bodyRows),
        ]),
    ]);
}

async function init() {
    const app = document.getElementById("app");

    const params = new URLSearchParams(location.search);
    const postCommitId = params.get("builder");
    const ewsId = params.get("ews-builder");
    const builderId = postCommitId || ewsId;
    const isEWS = !!ewsId;

    if (!builderId) {
        app.appendChild(el("p", null, ["No builder ID specified."]));
        return;
    }

    // Select API and buildbot base URL based on mode
    const api = isEWS ? createAPI(EWS_BASE_URL) : { fetchAPI, getAllPendingRequests, getAllWorkers };
    const buildbotBase = isEWS ? EWS_BUILDBOT_BASE : undefined;

    app.appendChild(renderPageHeader("Builder detail"));

    // Fetch builder info
    const builderData = await api.fetchAPI(`builders/${builderId}`);
    const builderName = builderData?.builders?.[0]?.name;

    const titleSpan = el("span", { id: "builderTitle" });
    titleSpan.textContent = builderName || `Unknown builder ${builderId}`;

    const builderURL = isEWS
        ? `${EWS_BUILDBOT_BASE}#/builders/${builderId}`
        : buildbotBuilderURL(builderId);
    const infoSection = el("section", null, [
        el("h2", null, ["Details for builder ", titleSpan]),
        el("ul", null, [
            el("li", null, ["Builder Name: ", builderName || "unknown"]),
            el("li", null, ["Builder URL: ", el("a", { href: builderURL }, [builderURL])]),
        ]),
    ]);
    app.appendChild(infoSection);

    // Fetch builds, pending requests, full worker data, and digest summary in parallel
    const digestPromise = isEWS ? Promise.resolve(null) : fetchBuilderDailySummary(builderId);
    const [requestsData, buildsData, allWorkers, digestResult] = await Promise.all([
        api.getAllPendingRequests(),
        api.fetchAPI(`builders/${builderId}/builds?limit=100&order=-number&property=identifier`),
        api.getAllWorkers(),
        digestPromise,
    ]);

    // Derive worker names map and connected worker count for this builder
    const id = parseInt(builderId, 10);
    const workerNames = new Map();
    let connectedWorkers = 0;
    if (allWorkers) {
        for (const w of allWorkers) {
            workerNames.set(w.workerid, w.name);
            const configuredHere = w.configured_on?.some(c => c.builderid === id);
            if (configuredHere && w.connected_to?.length > 0)
                connectedWorkers++;
        }
    }

    // Worker status bubbles
    const WORKER_SORT_ORDER = { disconnected: 0, paused: 1, graceful: 2, connected: 3 };
    const builderWorkers = allWorkers
        ? allWorkers.filter(w => w.configured_on?.some(c => c.builderid === id))
        : [];
    if (builderWorkers.length > 0) {
        const sortedWorkers = [...builderWorkers].sort((a, b) => {
            return WORKER_SORT_ORDER[classifyWorker(a)] - WORKER_SORT_ORDER[classifyWorker(b)];
        });
        const workerEntries = sortedWorkers.map(w => {
            const status = classifyWorker(w);
            const workerHref = isEWS
                ? `./worker.html?ews-worker=${w.workerid}`
                : workerPageURL(w.workerid);
            const attrs = { className: `worker-entry worker-${status}`, href: workerHref };
            let label = w.name;
            if (status === "paused") {
                label += " (paused)";
                const reason = w.pause_reason;
                if (reason)
                    attrs.title = reason;
            } else if (status === "graceful") {
                label += " (graceful)";
            } else if (status === "disconnected") {
                label += " (offline)";
            }
            return el("a", attrs, [label]);
        });
        const grid = el("div", { className: "worker-detail-grid" }, workerEntries);
        app.appendChild(el("section", null, [
            el("h3", null, ["Workers"]),
            grid,
        ]));
    }

    // Filter requests for this builder
    const allRequests = requestsData || [];
    const pending = allRequests
        .filter(r => r.builderid === id && !r.claimed)
        .sort((a, b) => a.submitted_at - b.submitted_at);
    const claimed = allRequests.filter(r => r.builderid === id && r.claimed);

    let requestContent;
    if (pending.length > 0) {
        const rows = pending.map(r => {
            const requestURL = isEWS
                ? `${EWS_BUILDBOT_BASE}#/buildrequests/${r.buildrequestid}`
                : buildbotBuildRequestURL(r.buildrequestid);
            return el("tr", null, [
                el("td", null, [
                    el("a", { href: requestURL, target: "_blank" }, [
                        `#${r.buildrequestid}`
                    ]),
                ]),
                el("td", null, [formatRelativeDateFromNow(r.submitted_at, "")]),
            ]);
        });
        requestContent = el("table", { className: "pending-requests" }, [
            el("thead", null, [
                el("tr", null, [
                    el("th", null, ["Request ID"]),
                    el("th", null, ["Waiting"]),
                ]),
            ]),
            el("tbody", null, rows),
        ]);
    } else {
        requestContent = el("p", null, ["No pending build requests."]);
    }

    app.appendChild(el("section", null, [
        el("h3", null, ["Pending build requests"]),
        requestContent,
    ]));

    // Detect stuck jobs
    const stuckRequests = findStuckRequests(claimed, connectedWorkers, buildsData?.builds || []);
    if (stuckRequests.length > 0) {
        const items = stuckRequests.map(r => {
            const claimDuration = formatRelativeDateFromNow(r.claimed_at, " ago");
            const requestURL = isEWS
                ? `${EWS_BUILDBOT_BASE}#/buildrequests/${r.buildrequestid}`
                : buildbotBuildRequestURL(r.buildrequestid);
            return el("li", null, [
                `Request #${r.buildrequestid} — claimed ${claimDuration}  `,
                el("a", { href: requestURL, target: "_blank" }, ["view in buildbot"]),
            ]);
        });
        const banner = el("section", { className: "queue-stuck stuck-banner" }, [
            el("strong", null, [
                `\u26A0 Possible stuck jobs — ${stuckRequests.length} claimed request(s) may be stuck`,
            ]),
            el("ul", null, items),
        ]);
        app.appendChild(banner);
    }

    // Daily summary section (post-commit builders only)
    if (digestResult) {
        const summarySection = renderDailySummarySection(digestResult.dates, digestResult.days);
        if (summarySection) app.appendChild(summarySection);
    }

    if (!buildsData?.builds?.length) {
        app.appendChild(el("p", null, ["No builds found."]));
    } else {
        app.appendChild(el("section", null, [
            el("h3", null, ["Build history"]),
            renderBuildHistoryTable(parseInt(builderId, 10), buildsData.builds, { buildbotBase, workerNames }),
        ]));
    }

    app.appendChild(el("br"));

    const backLabel = isEWS ? "Back to EWS Queues" : "Back to builder list";
    const backHref = isEWS ? "./ews-queue.html" : "./";
    const referrer = document.referrer;
    let breadcrumbBack = { label: backLabel, href: backHref };
    if (referrer) {
        try {
            const refURL = new URL(referrer);
            if (refURL.origin === location.origin) {
                const refPath = refURL.pathname;
                if (refPath.endsWith("/queue.html"))
                    breadcrumbBack = { label: "Back to Queues overview", href: "./queue.html" };
                else if (refPath.endsWith("/ews-queue.html"))
                    breadcrumbBack = { label: "Back to EWS Queues", href: "./ews-queue.html" };
            }
        } catch { /* ignore invalid referrer */ }
    }
    app.appendChild(el("footer", null, [
        el("a", { href: breadcrumbBack.href }, [breadcrumbBack.label]),
    ]));
}

function computeP90Duration(builds) {
    const durations = builds
        .filter(b => b.complete && b.complete_at && b.started_at)
        .slice(0, 20)
        .map(b => b.complete_at - b.started_at)
        .sort((a, b) => a - b);
    if (durations.length < 5) return null;
    const idx = Math.floor(durations.length * 0.9);
    return durations[Math.min(idx, durations.length - 1)];
}

function findStuckRequests(claimed, connectedWorkers, builds) {
    if (claimed.length === 0) return [];

    const now = Math.floor(Date.now() / 1000);
    const p90 = computeP90Duration(builds);
    const durationThreshold = p90 !== null ? p90 * 2 : null;
    const stuck = new Set();

    // Heuristic 1: if claimed > connected workers, the oldest excess claims are suspect
    if (claimed.length > connectedWorkers) {
        const sorted = [...claimed].sort((a, b) => a.claimed_at - b.claimed_at);
        const excessCount = claimed.length - connectedWorkers;
        for (let i = 0; i < excessCount; i++)
            stuck.add(sorted[i]);
    }

    // Heuristic 2: individual claims running longer than 2× P90
    if (durationThreshold !== null) {
        for (const r of claimed) {
            if ((now - r.claimed_at) > durationThreshold)
                stuck.add(r);
        }
    }

    return [...stuck];
}

startAutoRefresh();
init().catch(err => {
    console.error("Builder page failed to initialize:", err);
    document.getElementById("app").appendChild(
        el("p", null, ["Something went wrong loading this page."])
    );
});
