import { el } from "./_dom.js";
import { renderBuildHistoryRow } from "./build-history-row.js";

const HEADER_LABELS = [
    "Job number",
    "Identifier",
    "Started",
    "Job duration",
    "Status",
];

/**
 * Render a build history table from an array of builds.
 *
 * @param {number} builderId
 * @param {Array<Object>} builds
 * @param {Object} [options]
 * @param {string} [options.buildbotBase] - base URL for buildbot links (e.g. "https://ews-build.webkit.org/")
 * @returns {HTMLTableElement}
 */
export function renderBuildHistoryTable(builderId, builds, options = {}) {
    const headerCells = HEADER_LABELS.map(label => el("th", null, [label]));
    // Force numeric sorting on columns with data-sort numeric values
    headerCells[0].setAttribute("data-sort-method", "number"); // Job number
    headerCells[2].setAttribute("data-sort-method", "number"); // Started
    headerCells[3].setAttribute("data-sort-method", "number"); // Job duration
    if (options.buildbotBase)
        headerCells[1].textContent = "Base Identifier";
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");

    for (const build of builds) {
        tbody.appendChild(renderBuildHistoryRow(builderId, build, options));
    }

    const table = el("table", { id: "jobsList", className: "build-history" }, [thead, tbody]);
    if (options.buildbotBase)
        table.classList.add("build-history--ews");

    new Tablesort(table);

    return table;
}
