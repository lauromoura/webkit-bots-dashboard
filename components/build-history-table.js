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
 * @returns {HTMLTableElement}
 */
export function renderBuildHistoryTable(builderId, builds) {
    const headerCells = HEADER_LABELS.map(label => el("th", null, [label]));
    // Force numeric sorting on columns with data-sort numeric values
    headerCells[0].setAttribute("data-sort-method", "number"); // Job number
    headerCells[2].setAttribute("data-sort-method", "number"); // Started
    headerCells[3].setAttribute("data-sort-method", "number"); // Job duration
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");

    for (const build of builds) {
        tbody.appendChild(renderBuildHistoryRow(builderId, build));
    }

    const table = el("table", { id: "jobsList", className: "build-history" }, [thead, tbody]);

    new Tablesort(table);

    return table;
}
