import { startAutoRefresh } from "../lib/auto-refresh.js";
import { fetchAPI, createAPI } from "../lib/api.js";
import { builderPageURL } from "../lib/urls.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuildHistoryTable } from "../components/build-history-table.js";
import { classifyWorker } from "../components/queue-row.js";
import { el } from "../components/_dom.js";

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const EWS_BASE_URL = isLocal ? "/ews/api/v2/" : "https://ews-build.webkit.org/api/v2/";
const EWS_BUILDBOT_BASE = "https://ews-build.webkit.org/";

async function init() {
    const app = document.getElementById("app");

    const params = new URLSearchParams(location.search);
    const postCommitId = params.get("worker");
    const ewsId = params.get("ews-worker");
    const workerId = postCommitId || ewsId;
    const isEWS = !!ewsId;

    if (!workerId) {
        app.appendChild(el("p", null, ["No worker ID specified."]));
        return;
    }

    const api = isEWS ? createAPI(EWS_BASE_URL) : { fetchAPI };
    const buildbotBase = isEWS ? EWS_BUILDBOT_BASE : undefined;

    app.appendChild(renderPageHeader("Worker detail"));

    // Fetch worker info first to derive the builder ID
    const workerData = await api.fetchAPI(`workers/${workerId}`);

    const worker = workerData?.workers?.[0];
    if (!worker) {
        app.appendChild(el("p", null, ["Worker not found."]));
        return;
    }

    // Derive parent builder
    const builderConfig = worker.configured_on?.[0];
    const builderId = builderConfig?.builderid;

    // Fetch builder info and builds in parallel via the builder endpoint
    let builderName = null;
    let buildsData = null;
    if (builderId != null) {
        const [builderData, buildsResult] = await Promise.all([
            api.fetchAPI(`builders/${builderId}`),
            api.fetchAPI(`builders/${builderId}/builds?workerid=${workerId}&limit=100&order=-number&property=identifier`),
        ]);
        builderName = builderData?.builders?.[0]?.name;
        buildsData = buildsResult;
    }

    // Worker status
    const status = classifyWorker(worker);
    const statusLabels = {
        connected: "Connected",
        disconnected: "Disconnected",
        paused: "Paused",
        graceful: "Graceful shutdown",
    };

    // Worker info section
    const infoItems = [
        el("li", null, ["Worker name: ", worker.name]),
        el("li", null, [
            "Status: ",
            el("span", { className: `worker-entry worker-${status}` }, [statusLabels[status]]),
        ]),
    ];

    if (status === "paused" && worker.pause_reason)
        infoItems.push(el("li", null, ["Pause reason: ", worker.pause_reason]));

    if (builderId != null && builderName) {
        const builderHref = isEWS
            ? `./builder.html?ews-builder=${builderId}`
            : builderPageURL(builderId);
        infoItems.push(el("li", null, ["Builder: ", el("a", { href: builderHref }, [builderName])]));
    }

    const workerBuildbotURL = isEWS
        ? `${EWS_BUILDBOT_BASE}#/workers/${workerId}`
        : `https://build.webkit.org/#/workers/${workerId}`;
    infoItems.push(el("li", null, [
        "Buildbot: ",
        el("a", { href: workerBuildbotURL, target: "_blank" }, [workerBuildbotURL]),
    ]));

    app.appendChild(el("section", null, [
        el("h2", null, ["Details for worker ", el("span", { id: "workerTitle" }, [worker.name])]),
        el("ul", null, infoItems),
    ]));

    // Build history
    const builds = buildsData?.builds || [];
    if (builds.length === 0) {
        app.appendChild(el("p", null, ["No builds found."]));
    } else {
        const histBuilderId = builderId != null ? parseInt(builderId, 10) : builds[0]?.builderid;
        app.appendChild(el("section", null, [
            el("h3", null, ["Build history"]),
            renderBuildHistoryTable(histBuilderId, builds, { buildbotBase, hideWorkerColumn: true }),
        ]));
    }

    // Footer with back link
    app.appendChild(el("br"));

    const backLabel = isEWS ? "Back to EWS Queues" : "Back to builder list";
    const backHref = isEWS ? "./ews-queue.html" : "./";
    let breadcrumbBack = { label: backLabel, href: backHref };
    const referrer = document.referrer;
    if (referrer) {
        try {
            const refURL = new URL(referrer);
            if (refURL.origin === location.origin) {
                const refPath = refURL.pathname;
                if (refPath.endsWith("/queue.html"))
                    breadcrumbBack = { label: "Back to Queues overview", href: "./queue.html" };
                else if (refPath.endsWith("/ews-queue.html"))
                    breadcrumbBack = { label: "Back to EWS Queues", href: "./ews-queue.html" };
                else if (refPath.endsWith("/builder.html"))
                    breadcrumbBack = { label: "Back to Builder detail", href: referrer };
            }
        } catch { /* ignore invalid referrer */ }
    }
    app.appendChild(el("footer", null, [
        el("a", { href: breadcrumbBack.href }, [breadcrumbBack.label]),
    ]));
}

startAutoRefresh();
init().catch(err => {
    console.error("Worker page failed to initialize:", err);
    document.getElementById("app").appendChild(
        el("p", null, ["Something went wrong loading this page."])
    );
});
