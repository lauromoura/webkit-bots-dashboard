import { el } from "./_dom.js";
import { buildbotBuilderURL, buildbotBuildURL, builderPageURL } from "../lib/urls.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";
import { isOkResult } from "../lib/steps.js";

/**
 * Render a single builder row with build data already available.
 *
 * @param {Object} builder - { builderid, name, tags }
 * @param {Object} data - { builds: [...] } as returned by getLastBuilds()
 * @param {Object} [verdict] - optional step verdict from classifyBuildHealth(),
 *     supplied for step-aware tables; annotates *why* a build is red.
 * @returns {HTMLTableRowElement}
 */
export function renderBuilderRow(builder, data, verdict) {
    const now = Math.floor(Date.now() / 1000);

    const nameCell = el("td", { className: "builderName" }, [
        el("a", { href: builderPageURL(builder.builderid) }, [builder.name]),
    ]);

    const currentBuildCell = el("td", { className: "currentBuild", "data-sort": "0" });
    const lastBuildCell = el("td", { className: "lastBuild" });
    const buildTimeCell = el("td", { className: "buildTime", "data-sort": "0" });
    const otherBuildsCell = el("td", { className: "otherBuilds" });
    const externalLinkCell = el("td", { className: "externalLink" }, [
        el("a", { href: buildbotBuilderURL(builder.builderid) }, ["External link"]),
    ]);

    const row = el("tr", null, [
        nameCell, currentBuildCell, lastBuildCell,
        buildTimeCell, otherBuildsCell, externalLinkCell,
    ]);

    if (!data || data.builds.length === 0)
        return row;

    // A builder with several workers can have more than one build in progress,
    // and not necessarily the newest-numbered ones, so split by state rather
    // than by position: an in-progress build has no complete_at and must never
    // be shown as the "last build".
    const running = data.builds.filter(b => !b.complete);
    const builds = data.builds.filter(b => b.complete);

    // Current build column
    if (running.length === 0) {
        currentBuildCell.textContent = "Waiting for jobs";
        currentBuildCell.setAttribute("data-sort", "0");
    } else {
        const current = running[0];
        currentBuildCell.classList.add("building");
        currentBuildCell.setAttribute("data-sort", `${now - current.started_at}`);
        const link = el("a", { href: buildbotBuildURL(builder.builderid, current.number) },
            [`(Build #${current.number})`]);
        currentBuildCell.appendChild(link);
        currentBuildCell.appendChild(el("span", null, [` ${current.state_string}`]));
        if (running.length > 1) {
            currentBuildCell.appendChild(el("span", { className: "more-running" },
                [` (+${running.length - 1} more running)`]));
        }
    }

    const build = builds.shift();
    if (!build)
        return row;

    // Last build column
    const lastBuildLink = el("a", {
        href: buildbotBuildURL(builder.builderid, build.number),
        style: { float: "left", width: "30%" },
    }, [`(Build #${build.number})`]);
    lastBuildCell.appendChild(lastBuildLink);

    if (isOkResult(build.results)) {
        lastBuildCell.classList.add("success");
    } else {
        lastBuildCell.classList.add("failure");
    }
    lastBuildCell.appendChild(el("span", null, [build.state_string]));

    // Step-aware tables explain *why* a job is red: a debug bot that only failed
    // layout-test still compiled, which the job result alone cannot express.
    if (verdict && verdict.reason) {
        lastBuildCell.appendChild(
            el("span", { className: "step-note" }, [` — ${verdict.reason}`]));
    }

    // Finished time column
    const dateStr = formatRelativeDateFromNow(build.complete_at);
    const durationStr = formatRelativeDate(build.started_at, build.complete_at, "");
    buildTimeCell.textContent = `${dateStr} (duration: ${durationStr})`;
    buildTimeCell.setAttribute("data-sort", `${build.complete_at || 0}`);

    // Older builds column (colored pills)
    const ul = el("ul");
    for (const olderBuild of builds) {
        const cls = isOkResult(olderBuild.results) ? "success" : "failure";
        const li = el("li", { className: cls }, [
            el("a", { href: buildbotBuildURL(builder.builderid, olderBuild.number) },
                [`${olderBuild.number}`]),
        ]);
        ul.appendChild(li);
    }
    otherBuildsCell.appendChild(ul);

    return row;
}
