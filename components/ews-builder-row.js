import { el } from "./_dom.js";
import { RESULT_CODES } from "../lib/api.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";
import { siteBase, EWS_GARDENING } from "../lib/config.js";

// Older real runs shown as pills after the last run, and the fraction of
// skipped builds in the finished window from which the skip count is
// highlighted as churn.
const { olderRuns: OLDER_RUNS, churnThreshold: CHURN_THRESHOLD } = EWS_GARDENING;

function ewsBuilderURL(id) {
    return `${siteBase("ews")}#/builders/${id}`;
}

function ewsBuildURL(id, number) {
    return `${siteBase("ews")}#/builders/${id}/builds/${number}`;
}

/**
 * Map a build result to a CSS class for EWS semantics:
 *  - SUCCESS (0) → "success" (green)
 *  - FAILURE (2) → "soft-failure" (amber — expected on EWS)
 *  - EXCEPTION (4) → "failure" (red — infrastructure problem)
 *  - anything else → "failure"
 */
function ewsResultClass(result) {
    if (result === RESULT_CODES.SUCCESS)
        return "success";
    if (result === RESULT_CODES.FAILURE)
        return "soft-failure";
    return "failure";
}

/**
 * Render a single EWS builder row.
 * Same structure as builder-row.js but with EWS URLs and three-state coloring.
 *
 * @param {Object} builder - { builderid, name }
 * @param {Object} data - { running, builds } from getEWSLastBuilds(): in-progress
 *     builds and finished builds, both newest first.
 */
export function renderEWSBuilderRow(builder, data) {
    const now = Math.floor(Date.now() / 1000);

    const nameCell = el("td", { className: "builderName" }, [
        el("a", { href: ewsBuilderURL(builder.builderid) }, [builder.name]),
    ]);

    const currentBuildCell = el("td", { className: "currentBuild", "data-sort": "0" });
    const lastBuildCell = el("td", { className: "lastBuild" });
    const buildTimeCell = el("td", { className: "buildTime", "data-sort": "0" });
    const otherBuildsCell = el("td", { className: "otherBuilds" });
    const externalLinkCell = el("td", { className: "externalLink" }, [
        el("a", { href: ewsBuilderURL(builder.builderid) }, ["External link"]),
    ]);

    const row = el("tr", null, [
        nameCell, currentBuildCell, lastBuildCell,
        buildTimeCell, otherBuildsCell, externalLinkCell,
    ]);

    if (!data)
        return row;

    // Defensive filtering: never trust the complete__eq filter alone. An
    // in-progress build must never be shown as the last run (its complete_at
    // is null, i.e. "the epoch").
    const finishedBuilds = (data.builds || []).filter(b => b.complete);
    // Skipped builds (closed PR, outdated hash, ...) didn't run anything: they
    // are only counted, as a churn indicator, never shown as runs.
    const skipped = finishedBuilds.filter(b => b.results === RESULT_CODES.SKIPPED).length;
    const builds = finishedBuilds.filter(b => b.results !== RESULT_CODES.SKIPPED);
    // The two lists come from separate requests, so a build can finish between
    // them and show up in both; trust the finished list.
    const finished = new Set(finishedBuilds.map(b => b.number));
    const running = (data.running || []).filter(b => !b.complete && !finished.has(b.number));

    // Current build column: newest in-progress build, plus how many others run.
    if (running.length === 0) {
        currentBuildCell.textContent = "Waiting for jobs";
    } else {
        const current = running[0];
        currentBuildCell.classList.add("building");
        currentBuildCell.setAttribute("data-sort", `${now - current.started_at}`);
        currentBuildCell.appendChild(el("a", { href: ewsBuildURL(builder.builderid, current.number) },
            [`(Build #${current.number})`]));
        currentBuildCell.appendChild(el("span", null, [` ${current.state_string}`]));
        if (running.length > 1) {
            currentBuildCell.appendChild(el("span", { className: "more-running" },
                [` (+${running.length - 1} more running)`]));
        }
    }

    // Skip count over the finished window, shown whenever there is a skip.
    if (skipped > 0) {
        const isChurn = skipped / finishedBuilds.length >= CHURN_THRESHOLD;
        otherBuildsCell.appendChild(el("div", {
            className: isChurn ? "skip-count churn" : "skip-count",
            "data-skipped": `${skipped}`,
        }, [`${skipped}/${finishedBuilds.length} skipped`]));
    }

    const build = builds.shift();
    if (!build)
        return row;

    // Last build column
    const lastBuildLink = el("a", {
        href: ewsBuildURL(builder.builderid, build.number),
        style: { float: "left", width: "30%" },
    }, [`(Build #${build.number})`]);
    lastBuildCell.appendChild(lastBuildLink);

    lastBuildCell.classList.add(ewsResultClass(build.results));
    lastBuildCell.appendChild(el("span", null, [build.state_string]));

    // Finished time column
    const dateStr = formatRelativeDateFromNow(build.complete_at);
    const durationStr = formatRelativeDate(build.started_at, build.complete_at, "");
    buildTimeCell.textContent = `${dateStr} (duration: ${durationStr})`;
    buildTimeCell.setAttribute("data-sort", `${build.complete_at || 0}`);

    // Older builds column (colored pills)
    const ul = el("ul");
    for (const olderBuild of builds.slice(0, OLDER_RUNS)) {
        const cls = ewsResultClass(olderBuild.results);
        const li = el("li", { className: cls }, [
            el("a", { href: ewsBuildURL(builder.builderid, olderBuild.number) },
                [`${olderBuild.number}`]),
        ]);
        ul.appendChild(li);
    }
    otherBuildsCell.insertBefore(ul, otherBuildsCell.firstChild);

    return row;
}
