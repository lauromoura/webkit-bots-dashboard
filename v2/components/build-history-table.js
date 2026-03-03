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
    const headerRow = el("tr", null,
        HEADER_LABELS.map(label => el("th", null, [label])));
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");

    for (const build of builds) {
        tbody.appendChild(renderBuildHistoryRow(builderId, build));
    }

    return el("table", { id: "jobsList", className: "build-history" }, [thead, tbody]);
}
