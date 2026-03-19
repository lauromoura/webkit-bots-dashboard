import { el } from "./_dom.js";
import { RESULT_CODES } from "../lib/api.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";

const EWS_BUILDBOT_BASE = "https://ews-build.webkit.org";

function ewsBuilderURL(id) {
    return `${EWS_BUILDBOT_BASE}/#/builders/${id}`;
}

function ewsBuildURL(id, number) {
    return `${EWS_BUILDBOT_BASE}/#/builders/${id}/builds/${number}`;
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

    if (!data || data.builds.length === 0)
        return row;

    const builds = [...data.builds];
    let build = builds.shift();

    if (build === undefined)
        return row;

    // Current build column
    if (build.complete) {
        currentBuildCell.textContent = "Waiting for jobs";
        currentBuildCell.setAttribute("data-sort", "0");
    } else {
        currentBuildCell.classList.add("building");
        currentBuildCell.setAttribute("data-sort", `${now - build.started_at}`);
        const link = el("a", { href: ewsBuildURL(builder.builderid, build.number) },
            [`(Build #${build.number})`]);
        currentBuildCell.appendChild(link);
        currentBuildCell.appendChild(el("span", null, [` ${build.state_string}`]));
        build = builds.shift();
    }

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
    for (const olderBuild of builds) {
        const cls = ewsResultClass(olderBuild.results);
        const li = el("li", { className: cls }, [
            el("a", { href: ewsBuildURL(builder.builderid, olderBuild.number) },
                [`${olderBuild.number}`]),
        ]);
        ul.appendChild(li);
    }
    otherBuildsCell.appendChild(ul);

    return row;
}
