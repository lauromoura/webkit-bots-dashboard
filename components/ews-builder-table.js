import { el } from "./_dom.js";
import { renderEWSBuilderRow } from "./ews-builder-row.js";

// Upper bound on in-progress builds listed per EWS queue (one per busy worker).
const RUNNING_LIMIT = 50;

const HEADER_LABELS = [
    "Builder Name",
    "Current build",
    "Last build",
    "Finished",
    "Other builds",
    "Link to buildbot",
];

/**
 * Render an EWS builder table. Same layout as builder-table.js but uses
 * the EWS API client and EWS-specific row rendering.
 *
 * @param {Array<Object>} builders
 * @param {Object} ewsAPI - API client created via createAPI() for EWS
 * @returns {HTMLTableElement}
 */
export function renderEWSBuilderTable(builders, ewsAPI) {
    const headerCells = HEADER_LABELS.map(label => el("th", null, [label]));
    headerCells[1].setAttribute("data-sort-method", "number");
    headerCells[3].setAttribute("data-sort-method", "number");
    headerCells[4].setAttribute("data-sort-method", "none");
    headerCells[5].setAttribute("data-sort-method", "none");
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    const promises = builders.map(builder =>
        getEWSLastBuilds(ewsAPI, builder.builderid, 6).then(data => {
            tbody.appendChild(renderEWSBuilderRow(builder, data));
        })
    );

    Promise.all(promises).then(() => {
        new Tablesort(table);
    }).catch(err => {
        console.error("Failed to load EWS builder data:", err);
    });

    return table;
}

/**
 * Fetch an EWS builder's running builds and its last N finished builds.
 *
 * EWS queues run many builds in parallel on different workers, so the newest
 * build numbers are often several in-progress builds interleaved with finished
 * ones (or only in-progress ones). A single "last N builds" query therefore
 * can't be split into "current" and "last finished" by position; ask for the
 * two sets separately instead. The running query only needs a few small fields.
 *
 * No caching here (EWS builds are less frequent, and we avoid localStorage key
 * collisions with the post-commit client).
 *
 * @returns {Promise<{running: Array<Object>, builds: Array<Object>}>}
 *     running: in-progress builds, newest first; builds: finished, newest first.
 */
async function getEWSLastBuilds(api, builderId, count = 6) {
    const base = `builders/${builderId}/builds?order=-number`;
    const runningFields = ["number", "complete", "started_at", "state_string"]
        .map(f => `&field=${f}`).join("");
    const [running, finished] = await Promise.all([
        api.fetchAPI(`${base}&complete__eq=false&limit=${RUNNING_LIMIT}${runningFields}`),
        api.fetchAPI(`${base}&complete__eq=true&limit=${count}`),
    ]);
    return { running: running.builds, builds: finished.builds };
}
