import { el } from "./_dom.js";
import { buildbotBuilderURL, buildbotBuildURL, builderPageURL } from "../lib/urls.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";

/**
 * Render a single builder row with build data already available.
 *
 * @param {Object} builder - { builderid, name, tags }
 * @param {Object} data - { builds: [...] } as returned by getLastBuilds()
 * @returns {HTMLTableRowElement}
 */
export function renderBuilderRow(builder, data) {
    const nameCell = el("td", { className: "builderName" }, [
        el("a", { href: builderPageURL(builder.builderid) }, [builder.name]),
    ]);

    const currentBuildCell = el("td", { className: "currentBuild" });
    const lastBuildCell = el("td", { className: "lastBuild" });
    const buildTimeCell = el("td", { className: "buildTime" });
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

    const builds = [...data.builds];
    let build = builds.shift();

    if (build === undefined)
        return row;

    // Current build column
    if (build.complete) {
        currentBuildCell.textContent = "Waiting for jobs";
    } else {
        currentBuildCell.classList.add("building");
        const link = el("a", { href: buildbotBuildURL(builder.builderid, build.number) },
            [`(Build #${build.number})`]);
        currentBuildCell.appendChild(link);
        currentBuildCell.appendChild(el("span", null, [` ${build.state_string}`]));
        build = builds.shift();
    }

    if (!build)
        return row;

    // Last build column
    const lastBuildLink = el("a", {
        href: buildbotBuildURL(builder.builderid, build.number),
        style: { float: "left", width: "30%" },
    }, [`(Build #${build.number})`]);
    lastBuildCell.appendChild(lastBuildLink);

    if (build.state_string === "build successful") {
        lastBuildCell.classList.add("success");
    } else {
        lastBuildCell.classList.add("failure");
    }
    lastBuildCell.appendChild(el("span", null, [build.state_string]));

    // Finished time column
    const dateStr = formatRelativeDateFromNow(build.complete_at);
    const durationStr = formatRelativeDate(build.started_at, build.complete_at, "");
    buildTimeCell.textContent = `${dateStr} (duration: ${durationStr})`;

    // Older builds column (colored pills)
    const ul = el("ul");
    for (const olderBuild of builds) {
        const cls = olderBuild.state_string === "build successful" ? "success" : "failure";
        const li = el("li", { className: cls }, [
            el("a", { href: buildbotBuildURL(builder.builderid, olderBuild.number) },
                [`${olderBuild.number}`]),
        ]);
        ul.appendChild(li);
    }
    otherBuildsCell.appendChild(ul);

    return row;
}
