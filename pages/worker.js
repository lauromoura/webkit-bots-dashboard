import { startAutoRefresh } from "../lib/auto-refresh.js";
import { fetchAPI, ewsAPI } from "../lib/api.js";
import { siteBase } from "../lib/config.js";
import { builderPageURL } from "../lib/urls.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuildHistoryTable } from "../components/build-history-table.js";
import { readPagingParams, renderCountSelector, renderPagination } from "../components/build-history-pagination.js";
import { classifyWorker } from "../components/queue-row.js";
import { el } from "../components/_dom.js";

const EWS_BUILDBOT_BASE = siteBase("ews");

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

    // Build-history paging state, driven off the URL so it survives auto-refresh.
    const { count, page, offset } = readPagingParams(params);

    // Preserve the correct id param (worker vs ews-worker) when building paging links.
    const buildHistoryHref = (newCount, newPage) => {
        const p = new URLSearchParams();
        p.set(isEWS ? "ews-worker" : "worker", workerId);
        p.set("count", String(newCount));
        p.set("page", String(newPage));
        return `?${p.toString()}`;
    };

    const api = isEWS ? ewsAPI : { fetchAPI };
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
            api.fetchAPI(`builders/${builderId}/builds?workerid=${workerId}&limit=${count}&offset=${offset}&order=-number&property=identifier`),
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
        : `${siteBase("postCommit")}#/workers/${workerId}`;
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
    // For post-commit bots each builder is effectively single-worker, so the
    // worker-filtered build numbers are contiguous and total = newest + offset is
    // exact. EWS builders run worker pools, so the filtered sequence has gaps and
    // no reliable total exists — pass null there and let paging fall back to the
    // "full page => maybe more" heuristic.
    const total = isEWS ? null : (builds.length ? builds[0].number + offset : offset);
    const heading = el("div", { className: "build-history-header" }, [
        el("h3", null, ["Build history"]),
        renderCountSelector(count, buildHistoryHref),
    ]);

    if (builds.length === 0) {
        // Distinguish a worker with no builds from paging past the last page.
        const emptyMsg = page > 1
            ? el("p", null, [
                "No builds on this page. ",
                el("a", { href: buildHistoryHref(count, 1) }, ["Back to first page"]),
                ".",
            ])
            : el("p", null, ["No builds found."]);
        app.appendChild(el("section", null, [heading, emptyMsg]));
    } else {
        const histBuilderId = builderId != null ? parseInt(builderId, 10) : builds[0]?.builderid;
        app.appendChild(el("section", null, [
            heading,
            renderBuildHistoryTable(histBuilderId, builds, { buildbotBase, hideWorkerColumn: true }),
            renderPagination({ count, page, total, shown: builds.length, hrefFor: buildHistoryHref }),
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
