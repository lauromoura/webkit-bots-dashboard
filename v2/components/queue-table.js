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
    const headerCells = HEADER_LABELS.map(label => el("th", null, [label]));
    // Force numeric sorting on columns with data-sort numeric values
    headerCells[1].setAttribute("data-sort-method", "number"); // Pending
    headerCells[2].setAttribute("data-sort-method", "number"); // Oldest Wait
    headerCells[3].setAttribute("data-sort-method", "number"); // Running
    headerCells[4].setAttribute("data-sort-method", "number"); // Workers
    headerCells[5].setAttribute("data-sort-method", "number"); // Status
    // Mark Status column as default sort (descending, matching the JS pre-sort)
    headerCells[5].setAttribute("data-sort-default", "");
    headerCells[5].setAttribute("data-sort-reverse", "");
    const headerRow = el("tr", null, headerCells);
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

    const table = el("table", { className: "queue-table" }, [thead, tbody]);

    new Tablesort(table);

    return table;
}
