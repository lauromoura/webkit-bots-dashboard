import { el } from "./_dom.js";
import { buildbotBuildURL, workerPageURL } from "../lib/urls.js";
import { RESULT_CODES } from "../lib/api.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";

/**
 * Render a single row in the build history table.
 *
 * @param {number} builderId
 * @param {Object} build
 * @param {Object} [options]
 * @param {string} [options.buildbotBase] - base URL for buildbot links (e.g. "https://ews-build.webkit.org/")
 * @returns {HTMLTableRowElement}
 */
export function renderBuildHistoryRow(builderId, build, options = {}) {
    const { buildbotBase, workerNames, hideWorkerColumn } = options;
    // Job number cell (colored by status)
    const buildURL = buildbotBase
        ? `${buildbotBase}#/builders/${builderId}/builds/${build.number}`
        : buildbotBuildURL(builderId, build.number);
    const numberLink = el("a", {
        href: buildURL,
    }, [`#${build.number}`]);
    const numberCell = el("td", { className: "jobNumber", "data-sort": `${build.number}` }, [numberLink]);

    if (!build.complete) {
        numberCell.classList.add("building");
    } else if (build.results === RESULT_CODES.SUCCESS) {
        numberCell.classList.add("success");
    } else if (build.results === RESULT_CODES.FAILURE) {
        numberCell.classList.add("failure");
    }

    // Identifier cell
    const identifierCell = el("td", { className: "jobIdentifier" });
    if (build.properties && build.properties.identifier) {
        const identifier = build.properties.identifier[0];
        identifierCell.appendChild(
            el("a", { href: `https://commits.webkit.org/${identifier}` }, [identifier])
        );
    } else {
        identifierCell.textContent = "unknown identifier";
    }

    // Started cell
    const startedCell = el("td", { className: "jobStarted", "data-sort": `${build.started_at}` });
    startedCell.textContent = formatRelativeDateFromNow(build.started_at, " ago", true);

    // Duration cell
    const now = Math.floor(Date.now() / 1000);
    const durationSec = build.complete ? build.complete_at - build.started_at : now - build.started_at;
    const durationCell = el("td", { className: "jobDuration", "data-sort": `${durationSec}` });
    if (build.complete) {
        durationCell.textContent = formatRelativeDate(build.started_at, build.complete_at, "");
    } else {
        durationCell.textContent = `${formatRelativeDateFromNow(build.started_at)} and counting`;
    }

    // Worker cell (omitted when hideWorkerColumn is set)
    let workerCell;
    if (!hideWorkerColumn) {
        const workerName = workerNames?.get(build.workerid) || (build.workerid != null ? `worker-${build.workerid}` : "unknown");
        workerCell = el("td", { className: "jobWorker" });
        if (build.workerid != null) {
            const workerHref = buildbotBase
                ? `./worker.html?ews-worker=${build.workerid}`
                : workerPageURL(build.workerid);
            workerCell.appendChild(el("a", { href: workerHref }, [workerName]));
        } else {
            workerCell.textContent = workerName;
        }
    }

    // Status cell
    const statusCell = el("td", { className: "jobStatus" });
    statusCell.textContent = build.state_string;

    const cells = [numberCell, identifierCell, startedCell, durationCell];
    if (workerCell)
        cells.push(workerCell);
    cells.push(statusCell);
    return el("tr", null, cells);
}
