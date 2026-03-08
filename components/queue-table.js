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

const HEADER_LABELS_WITH_IDLE = [
    "Builder Name",
    "Pending",
    "Oldest Wait",
    "Running",
    "Workers",
    "Idle Workers",
    "Status",
];

/**
 * Render a queue status table for a list of builders.
 * Data is pre-fetched, so this is synchronous.
 *
 * @param {Array<Object>} builders
 * @param {Map<number, Array>} requestsByBuilder
 * @param {Map<number, Array>} workersByBuilder
 * @param {Object} [options]
 * @param {boolean} [options.showIdleWorkers] - include Idle Workers column
 * @param {Object} [options.thresholds] - severity threshold overrides
 * @param {string} [options.buildbotBase] - base URL for buildbot links
 * @returns {HTMLTableElement}
 */
export function renderQueueTable(builders, requestsByBuilder, workersByBuilder, options = {}) {
    const { showIdleWorkers = false } = options;
    const labels = showIdleWorkers ? HEADER_LABELS_WITH_IDLE : HEADER_LABELS;

    const headerCells = labels.map(label => el("th", null, [label]));
    // Force numeric sorting on columns with data-sort numeric values
    // Indices: [0]=Name, [1]=Pending, [2]=OldestWait, [3]=Running, [4]=Workers, [5]=Status (or IdleWorkers), [6]=Status
    const statusIdx = labels.length - 1;
    for (let i = 1; i < labels.length; i++)
        headerCells[i].setAttribute("data-sort-method", "number");
    // Mark Status column as default sort (descending, matching the JS pre-sort)
    headerCells[statusIdx].setAttribute("data-sort-default", "");
    headerCells[statusIdx].setAttribute("data-sort-reverse", "");
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");

    // Build rows with severity for sorting
    const rowOptions = { ...options, columnCount: labels.length };
    const results = builders.map(builder => {
        const requests = requestsByBuilder.get(builder.builderid) || [];
        const workers = workersByBuilder.get(builder.builderid) || [];
        return renderQueueRow(builder, requests, workers, rowOptions);
    });

    // Sort by severity descending (worst first)
    results.sort((a, b) => b.severity - a.severity);

    for (const { rows } of results) {
        for (const row of rows)
            tbody.appendChild(row);
    }

    const table = el("table", { className: "queue-table" }, [thead, tbody]);

    // After Tablesort re-orders rows, detail rows get separated from their
    // main rows. Re-attach each detail row right after its main row.
    // Register BEFORE `new Tablesort` so the initial default sort is caught.
    table.addEventListener("afterSort", () => {
        const detailRows = tbody.querySelectorAll(".worker-detail-row");
        for (const detail of detailRows) {
            const main = detail._mainRow;
            if (main && main.nextSibling !== detail)
                main.after(detail);
        }
    });

    new Tablesort(table);

    return table;
}
