import { el } from "./_dom.js";
import { getLastBuilds, getBuildSteps } from "../lib/api.js";
import { classifyBuildHealth, isOkResult } from "../lib/steps.js";
import { renderBuilderRow } from "./builder-row.js";
import { renderPlaceholderRow } from "./placeholder-row.js";
import { compareByName } from "../lib/builders.js";

const HEADER_LABELS = [
    "Builder Name",
    "Current build",
    "Last build",
    "Finished",
    "Other builds",
    "Link to buildbot",
];

/**
 * For a step-aware table: if the latest completed build is red, fetch its steps
 * and work out whether the *build* broke or only tests did. A green build needs
 * no request — every step passed by definition.
 *
 * @param {Object} data - { builds: [...] } from getLastBuilds()
 * @returns {Promise<Object|undefined>} verdict from classifyBuildHealth(), if any
 */
async function buildVerdict(data) {
    const build = data?.builds?.find(b => b.complete);
    if (!build || isOkResult(build.results))
        return undefined;
    try {
        const steps = await getBuildSteps(build.buildid);
        return steps ? classifyBuildHealth(steps) : undefined;
    } catch (err) {
        // A steps failure must never cost us the row itself.
        console.error("Failed to load build steps:", err);
        return undefined;
    }
}

/**
 * Render a builder table. Returns the <table> element immediately;
 * rows populate progressively as build data arrives.
 *
 * @param {Array<Object>} builders
 * @param {function():void} [onLoaded] - called once all per-builder fetches
 *     have settled (success or failure); used to clear a pending indicator.
 * @param {Object} [opts]
 * @param {boolean} [opts.stepAware] - for build-bot sections: when the latest
 *     completed build is red, fetch its steps and annotate the row with whether
 *     the *build* actually broke (see lib/steps.js).
 * @returns {HTMLTableElement}
 */
export function renderBuilderTable(builders, onLoaded, opts = {}) {
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

    // Rows are alphabetical by builder name (sections already group the bots),
    // whatever order the per-builder responses arrive in: each builder gets a
    // placeholder row now, replaced in place once its data is in.
    const promises = [...builders].sort(compareByName).map(builder => {
        const placeholder = renderPlaceholderRow(renderBuilderRow(builder), "loading…");
        tbody.appendChild(placeholder);
        return getLastBuilds(builder.builderid, 6).then(async data => {
            if (!data) {
                placeholder.replaceWith(renderPlaceholderRow(renderBuilderRow(builder), "Failed to load"));
                return;
            }
            const verdict = opts.stepAware ? await buildVerdict(data) : undefined;
            placeholder.replaceWith(renderBuilderRow(builder, data, verdict));
        }).catch(err => {
            console.error(`Failed to load builder ${builder.name}:`, err);
            placeholder.replaceWith(renderPlaceholderRow(renderBuilderRow(builder), "Failed to load"));
        });
    });

    // Sorting is set up once every row has settled (loaded or failed).
    Promise.allSettled(promises).then(() => {
        new Tablesort(table);
    }).finally(() => {
        if (onLoaded)
            onLoaded();
    });

    return table;
}
