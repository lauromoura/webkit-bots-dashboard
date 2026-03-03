import { el } from "./_dom.js";
import { getLastBuilds } from "../lib/api.js";
import { renderTimeLimitRow } from "./time-limit-row.js";

const HEADER_LABELS = [
    "Job number",
    "Summary",
    "Finished",
    "Duration",
];

/**
 * Render a time-limit table for a single builder.
 * Returns the <table> immediately; rows populate asynchronously.
 *
 * @param {Object} builder - { builderid, name, tags }
 * @returns {HTMLTableElement}
 */
export function renderTimeLimitTable(builder) {
    const headerRow = el("tr", null,
        HEADER_LABELS.map(label => el("th", null, [label])));
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    getLastBuilds(builder.builderid, 5).then(data => {
        if (!data)
            return;
        for (const build of data.builds) {
            tbody.appendChild(renderTimeLimitRow(build));
        }
    });

    return table;
}
