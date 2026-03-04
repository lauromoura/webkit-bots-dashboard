import { fetchAPI, getAllPendingRequests } from "../lib/api.js";
import { buildbotBuilderURL, buildbotBuildRequestURL } from "../lib/urls.js";
import { formatRelativeDateFromNow } from "../lib/format.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuildHistoryTable } from "../components/build-history-table.js";
import { el } from "../components/_dom.js";

async function init() {
    const app = document.getElementById("app");

    const params = new URLSearchParams(location.search);
    const builderId = params.get("builder");

    if (!builderId) {
        app.appendChild(el("p", null, ["No builder ID specified."]));
        return;
    }

    app.appendChild(renderPageHeader("Builder detail"));

    // Fetch builder info
    const builderData = await fetchAPI(`builders/${builderId}`);
    const builderName = builderData?.builders?.[0]?.name;

    const titleSpan = el("span", { id: "builderTitle" });
    titleSpan.textContent = builderName || `Unknown builder ${builderId}`;

    const builderURL = buildbotBuilderURL(builderId);
    const infoSection = el("section", null, [
        el("h2", null, ["Details for builder ", titleSpan]),
        el("ul", null, [
            el("li", null, ["Builder Name: ", builderName || "unknown"]),
            el("li", null, ["Builder URL: ", el("a", { href: builderURL }, [builderURL])]),
        ]),
    ]);
    app.appendChild(infoSection);

    // Fetch builds and pending requests in parallel
    const [requestsData, buildsData] = await Promise.all([
        getAllPendingRequests(),
        fetchAPI(`builders/${builderId}/builds?limit=100&order=-number&property=identifier`),
    ]);

    // Filter pending (unclaimed) requests for this builder
    const allRequests = requestsData || [];
    const pending = allRequests
        .filter(r => r.builderid === parseInt(builderId, 10) && !r.claimed)
        .sort((a, b) => a.submitted_at - b.submitted_at);

    let requestContent;
    if (pending.length > 0) {
        const rows = pending.map(r => el("tr", null, [
            el("td", null, [
                el("a", { href: buildbotBuildRequestURL(r.buildrequestid), target: "_blank" }, [
                    `#${r.buildrequestid}`
                ]),
            ]),
            el("td", null, [formatRelativeDateFromNow(r.submitted_at, "")]),
        ]));
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

    if (!buildsData || buildsData.builds.length === 0) {
        app.appendChild(el("p", null, ["No builds found."]));
    } else {
        app.appendChild(el("section", null, [
            el("h3", null, ["Build history"]),
            renderBuildHistoryTable(parseInt(builderId, 10), buildsData.builds),
        ]));
    }

    app.appendChild(el("br"));
    app.appendChild(el("footer", null, [
        el("a", { href: "./" }, ["Back to builder list"]),
    ]));
}

init();
