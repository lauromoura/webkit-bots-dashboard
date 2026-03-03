import { fetchAPI } from "../lib/api.js";
import { buildbotBuilderURL } from "../lib/urls.js";
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

    // Fetch builds
    const buildsData = await fetchAPI(
        `builders/${builderId}/builds?limit=100&order=-number&property=identifier`
    );

    if (!buildsData || buildsData.builds.length === 0) {
        app.appendChild(el("p", null, ["No builds found."]));
    } else {
        app.appendChild(el("section", null, [
            renderBuildHistoryTable(parseInt(builderId, 10), buildsData.builds),
        ]));
    }

    app.appendChild(el("br"));
    app.appendChild(el("footer", null, [
        el("a", { href: "./" }, ["Back to builder list"]),
    ]));
}

init();
