import { getBuilders, getAllPendingRequests, getAllWorkers } from "../lib/api.js";
import { classifyByTier } from "../lib/builders.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderQueueTable } from "../components/queue-table.js";
import { el } from "../components/_dom.js";

const TIER_SECTIONS = [
    { key: "tier1", title: "Tier 1 - Builders" },
    { key: "tier2", title: "Tier 2 - Release test bots" },
    { key: "tier4", title: "Tier 4 - Stable/LTS builds" },
    { key: "tier5", title: "Tier 5 - Remaining bots" },
    { key: "jsconly", title: "JSCOnly Linux" },
    { key: "retired", title: "Retired builders" },
];

function groupByBuilderId(requests) {
    const map = new Map();
    for (const r of requests)
        map.set(r.builderid, [...(map.get(r.builderid) || []), r]);
    return map;
}

function groupWorkersByBuilderId(workers) {
    const map = new Map();
    for (const w of workers) {
        // In a multimaster setup, configured_on lists the same builderid
        // once per master. Deduplicate so each worker appears once per builder.
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
    app.appendChild(renderPageHeader("Queue & Worker Status"));

    // 3 parallel fetches
    const [builders, requests, workers] = await Promise.all([
        getBuilders(),
        getAllPendingRequests(),
        getAllWorkers(),
    ]);

    if (!builders) {
        app.appendChild(el("p", null, ["Failed to fetch builders."]));
        return;
    }

    if (!requests || !workers) {
        app.appendChild(el("p", null, ["Failed to fetch queue data."]));
        return;
    }

    const requestsByBuilder = groupByBuilderId(requests);
    const workersByBuilder = groupWorkersByBuilderId(workers);
    const tiers = classifyByTier(builders);

    for (const { key, title } of TIER_SECTIONS) {
        const tierBuilders = tiers[key];
        if (tierBuilders.length === 0)
            continue;

        if (key === "retired") {
            const details = el("details", { id: `queue-${key}` }, [
                el("summary", null, [el("h2", { style: "display:inline" }, [title])]),
                renderQueueTable(tierBuilders, requestsByBuilder, workersByBuilder),
            ]);
            app.appendChild(details);
        } else {
            const section = el("div", { id: `queue-${key}` }, [
                el("h2", null, [title]),
                renderQueueTable(tierBuilders, requestsByBuilder, workersByBuilder),
            ]);
            app.appendChild(section);
        }
    }
}

init();
