import { el } from "./_dom.js";
import { getLastBuilds } from "../lib/api.js";
import { renderBuilderRow } from "./builder-row.js";

const HEADER_LABELS = [
    "Builder Name",
    "Current build",
    "Last build",
    "Finished",
    "Other builds",
    "Link to buildbot",
];

/**
 * Render a builder table. Returns the <table> element immediately;
 * rows populate progressively as build data arrives.
 *
 * @param {Array<Object>} builders
 * @returns {HTMLTableElement}
 */
export function renderBuilderTable(builders) {
    const headerCells = HEADER_LABELS.map(label => el("th", null, [label]));
    // Force numeric sorting on columns with data-sort numeric values
    headerCells[1].setAttribute("data-sort-method", "number"); // Current build
    headerCells[3].setAttribute("data-sort-method", "number"); // Finished
    // Mark non-sortable columns
    headerCells[4].setAttribute("data-sort-method", "none"); // Other builds
    headerCells[5].setAttribute("data-sort-method", "none"); // Link to buildbot
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    const promises = builders.map(builder =>
        getLastBuilds(builder.builderid, 6).then(data => {
            tbody.appendChild(renderBuilderRow(builder, data));
        })
    );

    Promise.all(promises).then(() => {
        new Tablesort(table);
    }).catch(err => {
        console.error("Failed to load builder data:", err);
    });

    return table;
}
