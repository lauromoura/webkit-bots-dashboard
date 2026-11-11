import { el } from "./_dom.js";
import { renderEWSBuilderRow } from "./ews-builder-row.js";
import { RESULT_CODES } from "../lib/api.js";

// Upper bound on in-progress builds listed per EWS queue (one per busy worker).
const RUNNING_LIMIT = 50;

// How many finished builds to look at per queue. Skipped builds are counted
// within this window (churn indicator); the rest feed the last run + pills.
const FINISHED_WINDOW = 15;

// Fields the row actually uses; keeps the larger finished window cheap.
const RUNNING_FIELDS = ["number", "complete", "started_at", "state_string"];
const FINISHED_FIELDS = ["number", "complete", "results", "state_string",
    "started_at", "complete_at"];

const HEADER_LABELS = [
    "Builder Name",
    "Current build",
    "Last run",
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
    headerCells[2].setAttribute("title",
        "Newest finished build, ignoring builds EWS skipped (closed PR, outdated hash)");
    headerCells[4].setAttribute("title",
        "Older runs. 'N/M skipped' counts skipped builds among the last M finished; " +
        "amber when half or more were skipped (PRs updated faster than the queue " +
        "tests them, e.g. a slow queue or force-push churn).");
    headerCells[1].setAttribute("data-sort-method", "number");
    headerCells[3].setAttribute("data-sort-method", "number");
    headerCells[4].setAttribute("data-sort-method", "none");
    headerCells[5].setAttribute("data-sort-method", "none");
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    const promises = builders.map(builder =>
        getEWSLastBuilds(ewsAPI, builder.builderid).then(data => {
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
 * Fetch an EWS builder's running builds and its last FINISHED_WINDOW finished
 * builds (skipped ones included, so the row can count them).
 *
 * EWS queues run many builds in parallel on different workers, so the newest
 * build numbers are often several in-progress builds interleaved with finished
 * ones (or only in-progress ones). A single "last N builds" query therefore
 * can't be split into "current" and "last finished" by position; ask for the
 * two sets separately instead, restricted to the fields the row uses.
 *
 * No caching here (EWS builds are less frequent, and we avoid localStorage key
 * collisions with the post-commit client).
 *
 * @returns {Promise<{running: Array<Object>, builds: Array<Object>}>}
 *     running: in-progress builds, newest first; builds: finished builds
 *     (including skipped ones), newest first.
 */
async function getEWSLastBuilds(api, builderId) {
    const base = `builders/${builderId}/builds?order=-number`;
    const fields = list => list.map(f => `&field=${f}`).join("");
    const [running, finished] = await Promise.all([
        api.fetchAPI(`${base}&complete__eq=false&limit=${RUNNING_LIMIT}${fields(RUNNING_FIELDS)}`),
        api.fetchAPI(`${base}&complete__eq=true&limit=${FINISHED_WINDOW}${fields(FINISHED_FIELDS)}`),
    ]);
    return { running: running.builds, builds: finished.builds };
}
