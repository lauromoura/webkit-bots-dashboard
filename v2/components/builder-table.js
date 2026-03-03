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
    const headerRow = el("tr", null,
        HEADER_LABELS.map(label => el("th", null, [label])));
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    for (const builder of builders) {
        getLastBuilds(builder.builderid, 6).then(data => {
            tbody.appendChild(renderBuilderRow(builder, data));
        });
    }

    return table;
}
