import { startAutoRefresh } from "../lib/auto-refresh.js";
import { ewsAPI } from "../lib/api.js";
import { siteBase, QUEUE_THRESHOLDS, EWS_QUEUE_NAME_FILTERS } from "../lib/config.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderQueueTable } from "../components/queue-table.js";
import { el } from "../components/_dom.js";

const EWS_BUILDBOT_BASE = siteBase("ews");

function isRelevantEWSBuilder(builder) {
    return EWS_QUEUE_NAME_FILTERS.some(f => builder.name.includes(f));
}

function groupByBuilderId(requests) {
    const map = new Map();
    for (const r of requests)
        map.set(r.builderid, [...(map.get(r.builderid) || []), r]);
    return map;
}

function groupWorkersByBuilderId(workers) {
    const map = new Map();
    for (const w of workers) {
        const seenBuilders = new Set();
        for (const cfg of w.configured_on) {
            if (seenBuilders.has(cfg.builderid))
                continue;
            seenBuilders.add(cfg.builderid);
            map.set(cfg.builderid, [...(map.get(cfg.builderid) || []), w]);
        }
    }
    return map;
}

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("EWS Queue & Worker Status"));

    const legend = el("p", { className: "queue-legend" }, [
        el("b", null, ["Status: "]),
        el("span", { className: "queue-idle queue-legend-chip" }, ["Idle"]),
        " — no pending or running builds. ",
        el("span", { className: "queue-working queue-legend-chip" }, ["Working"]),
        " — builds running normally. ",
        el("span", { className: "queue-preparing queue-legend-chip" }, ["Preparing"]),
        " — pending builds, workers spinning up. ",
        el("span", { className: "queue-warning queue-legend-chip" }, ["Warning"]),
        " — large backlog or long wait despite available workers. ",
        el("span", { className: "queue-critical queue-legend-chip" }, ["Critical"]),
        " — pending builds, no workers responding for 10+ min.",
    ]);
    app.appendChild(legend);

    const [builders, requests, workers] = await Promise.all([
        ewsAPI.getBuilders(),
        ewsAPI.getAllPendingRequests(),
        ewsAPI.getAllWorkers(),
    ]);

    if (!builders) {
        app.appendChild(el("p", null, ["Failed to fetch EWS builders."]));
        return;
    }

    if (!requests || !workers) {
        app.appendChild(el("p", null, ["Failed to fetch EWS queue data."]));
        return;
    }

    const relevantBuilders = builders.filter(isRelevantEWSBuilder);

    if (relevantBuilders.length === 0) {
        app.appendChild(el("p", null, ["No relevant EWS builders found."]));
        return;
    }

    const requestsByBuilder = groupByBuilderId(requests);
    const workersByBuilder = groupWorkersByBuilderId(workers);

    // Single flat table — no tier grouping for EWS
    const table = renderQueueTable(relevantBuilders, requestsByBuilder, workersByBuilder, {
        showIdleWorkers: true,
        thresholds: QUEUE_THRESHOLDS.ews,
        buildbotBase: EWS_BUILDBOT_BASE,
    });
    app.appendChild(table);
}

startAutoRefresh();
init().catch(err => {
    console.error("EWS queue page failed to initialize:", err);
    document.getElementById("app").appendChild(
        el("p", null, ["Something went wrong loading this page."])
    );
});
