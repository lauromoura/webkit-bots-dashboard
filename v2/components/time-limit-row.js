import { el } from "./_dom.js";
import { formatRelativeDate, formatRelativeDateFromNow } from "../lib/format.js";

/**
 * Render a single time-limit row for a build.
 *
 * @param {Object} build
 * @returns {HTMLTableRowElement}
 */
export function renderTimeLimitRow(build) {
    const numberCell = el("td", { className: "jobNumber", textContent: `${build.number}` });

    const summaryCell = el("td", { className: "jobSummary", textContent: build.state_string });
    if (build.state_string === "build successful") {
        summaryCell.classList.add("success");
    } else if (build.state_string !== "building") {
        summaryCell.classList.add("failure");
    }

    const finishedCell = el("td", { className: "jobFinished" });
    if (build.complete) {
        finishedCell.textContent = formatRelativeDateFromNow(build.complete_at);
    } else {
        finishedCell.textContent = "...";
    }

    const durationCell = el("td", { className: "jobDuration" });
    if (build.complete) {
        durationCell.textContent = formatRelativeDate(build.started_at, build.complete_at, "");
    } else {
        durationCell.textContent = formatRelativeDateFromNow(build.started_at);
    }

    return el("tr", null, [numberCell, summaryCell, finishedCell, durationCell]);
}
