import { startAutoRefresh } from "../lib/auto-refresh.js";
import { fetchAPI, createAPI, getAllPendingRequests, getWorkerNames } from "../lib/api.js";
import { buildbotBuilderURL, buildbotBuildRequestURL } from "../lib/urls.js";
import { formatRelativeDateFromNow } from "../lib/format.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuildHistoryTable } from "../components/build-history-table.js";
import { el } from "../components/_dom.js";

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const EWS_BASE_URL = isLocal ? "/ews/api/v2/" : "https://ews-build.webkit.org/api/v2/";
const EWS_BUILDBOT_BASE = "https://ews-build.webkit.org/";

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
    const api = isEWS ? createAPI(EWS_BASE_URL) : { fetchAPI, getAllPendingRequests, getWorkerNames };
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

    // Fetch builds, pending requests, and worker names in parallel
    const [requestsData, buildsData, workerNames] = await Promise.all([
        api.getAllPendingRequests(),
        api.fetchAPI(`builders/${builderId}/builds?limit=100&order=-number&property=identifier`),
        api.getWorkerNames(),
    ]);

    // Filter pending (unclaimed) requests for this builder
    const allRequests = requestsData || [];
    const pending = allRequests
        .filter(r => r.builderid === parseInt(builderId, 10) && !r.claimed)
        .sort((a, b) => a.submitted_at - b.submitted_at);

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

startAutoRefresh();
init().catch(err => {
    console.error("Builder page failed to initialize:", err);
    document.getElementById("app").appendChild(
        el("p", null, ["Something went wrong loading this page."])
    );
});
