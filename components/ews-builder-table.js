import { el } from "./_dom.js";
import { renderEWSBuilderRow } from "./ews-builder-row.js";

const HEADER_LABELS = [
    "Builder Name",
    "Current build",
    "Last build",
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
    headerCells[1].setAttribute("data-sort-method", "number");
    headerCells[3].setAttribute("data-sort-method", "number");
    headerCells[4].setAttribute("data-sort-method", "none");
    headerCells[5].setAttribute("data-sort-method", "none");
    const headerRow = el("tr", null, headerCells);
    const thead = el("thead", null, [headerRow]);
    const tbody = el("tbody");
    const table = el("table", null, [thead, tbody]);

    const promises = builders.map(builder =>
        getEWSLastBuilds(ewsAPI, builder.builderid, 6).then(data => {
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
 * Fetch last N builds for a builder using the given API client.
 * Simplified version of getLastBuilds without caching (EWS builds
 * are less frequent, and we avoid localStorage key collisions).
 */
async function getEWSLastBuilds(api, builderId, count = 6) {
    const data = await api.fetchAPI(`builders/${builderId}/builds?order=-number&limit=${count + 1}`);
    return data;
}
