import { el } from "./_dom.js";
import { renderQueueRow } from "./queue-row.js";

const HEADER_LABELS = [
    "Builder Name",
    "Pending",
    "Oldest Wait",
    "Running",
    "Workers",
    "Status",
];

/**
 * Render a queue status table for a list of builders.
 * Data is pre-fetched, so this is synchronous.
 *
 * @param {Array<Object>} builders
 * @param {Map<number, Array>} requestsByBuilder
 * @param {Map<number, Array>} workersByBuilder
 * @returns {HTMLTableElement}
 */
export function renderQueueTable(builders, requestsByBuilder, workersByBuilder) {
    const headerRow = el("tr", null,
        HEADER_LABELS.map(label => el("th", null, [label])));
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");

    // Build rows with severity for sorting
    const rows = builders.map(builder => {
        const requests = requestsByBuilder.get(builder.builderid) || [];
        const workers = workersByBuilder.get(builder.builderid) || [];
        return renderQueueRow(builder, requests, workers);
    });

    // Sort by severity descending (worst first)
    rows.sort((a, b) => b.severity - a.severity);

    for (const { row } of rows)
        tbody.appendChild(row);

    return el("table", { className: "queue-table" }, [thead, tbody]);
}
