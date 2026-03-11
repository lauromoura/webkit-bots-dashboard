import { el } from "./_dom.js";
import { buildbotBuilderURL, builderPageURL, workerPageURL } from "../lib/urls.js";

// Default severity thresholds (post-commit)
const SPINUP_THRESHOLD_SEC = 600;        // 10 minutes — normal worker spin-up time
const PENDING_WARN_THRESHOLD = 3;
const WAIT_WARN_THRESHOLD_SEC = 1800;    // 30 minutes

const SEVERITY_IDLE = 0;
const SEVERITY_WORKING = 1;
const SEVERITY_PREPARING = 2;
const SEVERITY_WARNING = 3;
const SEVERITY_CRITICAL = 4;

export function classifySeverity(pendingCount, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers, runningCount, thresholds = {}) {
    const spinupThreshold = thresholds.spinupThresholdSec ?? SPINUP_THRESHOLD_SEC;
    const pendingWarnThreshold = thresholds.pendingWarnThreshold ?? PENDING_WARN_THRESHOLD;
    const waitWarnThreshold = thresholds.waitWarnThresholdSec ?? WAIT_WARN_THRESHOLD_SEC;

    if (pendingCount === 0 && runningCount === 0)
        return SEVERITY_IDLE;

    if (runningCount > 0) {
        // When builds are running, oldest wait grows to match build duration —
        // only the pending COUNT indicates a real backlog.
        if (pendingCount >= pendingWarnThreshold)
            return SEVERITY_WARNING;
        return SEVERITY_WORKING;
    }

    // From here: pending > 0, running == 0
    const workersAvailable = connectedWorkers > 0 && pausedWorkers < totalWorkers;
    if (workersAvailable) {
        // Nothing running despite available workers — long wait IS abnormal
        if (pendingCount >= pendingWarnThreshold || oldestWaitSec > waitWarnThreshold)
            return SEVERITY_WARNING;
        return SEVERITY_WORKING;
    }

    // No workers available, pending > 0, running == 0
    if (oldestWaitSec >= spinupThreshold)
        return SEVERITY_CRITICAL;
    return SEVERITY_PREPARING;
}

function formatDuration(seconds) {
    if (seconds <= 0)
        return "0s";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0)
        return `${h}h ${m}m ${s}s`;
    return `${m}m ${s}s`;
}

export function classifyWorker(worker) {
    if (worker.connected_to.length === 0)
        return "disconnected";
    if (worker.graceful)
        return "graceful";
    if (worker.paused)
        return "paused";
    return "connected";
}

const WORKER_SORT_ORDER = { disconnected: 0, paused: 1, graceful: 2, connected: 3 };

/**
 * Render a single queue status row with an expandable worker detail row.
 *
 * @param {Object} builder - { builderid, name, tags }
 * @param {Array} requests - build requests for this builder (incomplete only)
 * @param {Array} workers - workers configured for this builder
 * @param {Object} [options]
 * @param {boolean} [options.showIdleWorkers] - show Idle Workers column
 * @param {Object} [options.thresholds] - severity threshold overrides
 * @param {string} [options.buildbotBase] - base URL for buildbot links (e.g. "https://ews-build.webkit.org/")
 * @param {number} [options.columnCount] - total number of columns for detail row colspan
 * @returns {{ rows: HTMLTableRowElement[], severity: number }}
 */
export function renderQueueRow(builder, requests, workers, options = {}) {
    const { showIdleWorkers = false, thresholds = {}, buildbotBase, columnCount } = options;
    const now = Math.floor(Date.now() / 1000);

    // Split requests into pending (unclaimed) and running (claimed but not complete)
    const pending = requests.filter(r => !r.claimed);
    const running = requests.filter(r => r.claimed);

    // Oldest wait time among pending requests
    let oldestWaitSec = 0;
    for (const r of pending) {
        const wait = now - r.submitted_at;
        if (wait > oldestWaitSec)
            oldestWaitSec = wait;
    }

    // Worker stats
    const totalWorkers = workers.length;
    const connectedWorkers = workers.filter(w => w.connected_to.length > 0).length;
    const pausedWorkers = workers.filter(w => w.paused).length;

    const severity = classifySeverity(pending.length, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers, running.length, thresholds);

    // Builder name cell — name links to local detail page, with external buildbot link
    const nameCell = el("td", { className: "builderName" });
    if (buildbotBase) {
        // EWS: name links to local detail page with ews-builder param
        nameCell.appendChild(el("a", { href: `./builder.html?ews-builder=${builder.builderid}` }, [builder.name]));
        nameCell.appendChild(document.createTextNode(" ("));
        nameCell.appendChild(el("a", { href: `${buildbotBase}#/builders/${builder.builderid}`, target: "_blank" }, ["buildbot"]));
        nameCell.appendChild(document.createTextNode(")"));
    } else {
        nameCell.appendChild(el("a", { href: builderPageURL(builder.builderid) }, [builder.name]));
        nameCell.appendChild(document.createTextNode(" ("));
        nameCell.appendChild(el("a", { href: buildbotBuilderURL(builder.builderid), target: "_blank" }, ["buildbot"]));
        nameCell.appendChild(document.createTextNode(")"));
    }

    // Pending cell
    const pendingCell = el("td", { className: "queue-status", "data-sort": `${pending.length}` }, [
        pending.length > 0 ? `${pending.length} pending` : "0",
    ]);

    // Oldest wait cell
    const waitCell = el("td", { className: "queue-status", "data-sort": `${oldestWaitSec}` }, [
        pending.length > 0 ? formatDuration(oldestWaitSec) : "\u2014",
    ]);

    // Running cell
    let runningText;
    let longestRunningSec = 0;
    if (running.length === 0) {
        runningText = "\u2014";
    } else {
        const elapsed = running.map(r => now - r.claimed_at);
        longestRunningSec = Math.max(...elapsed);
        runningText = `${running.length} build${running.length > 1 ? "s" : ""} (${formatDuration(longestRunningSec)})`;
    }
    const stuckJobs = running.length > connectedWorkers;
    const runningCell = el("td", { className: `queue-status${stuckJobs ? " queue-stuck" : ""}`, "data-sort": `${longestRunningSec}` }, [
        stuckJobs ? `${runningText} ⚠` : runningText,
    ]);

    // Workers cell (with toggle indicator)
    let workersText = `${connectedWorkers}/${totalWorkers} connected`;
    if (pausedWorkers > 0)
        workersText += ` (${pausedWorkers} paused)`;
    const toggleIndicator = el("span", { className: "worker-toggle-indicator" }, ["\u25B6 "]);
    const workersCell = el("td", { className: "queue-status", "data-sort": `${connectedWorkers}` }, [toggleIndicator, workersText]);

    // Idle Workers cell (optional)
    let idleWorkersCell;
    if (showIdleWorkers) {
        const idleCount = Math.max(0, connectedWorkers - pausedWorkers - running.length);
        idleWorkersCell = el("td", { className: "queue-status", "data-sort": `${idleCount}` }, [`${idleCount}`]);
    }

    // Status cell
    const statusLabels = ["Idle", "Working", "Preparing", "Warning", "Critical"];
    const statusClasses = ["queue-idle", "queue-working", "queue-preparing", "queue-warning", "queue-critical"];
    const statusCell = el("td", { className: `queue-status ${statusClasses[severity]}`, "data-sort": `${severity}` }, [
        statusLabels[severity],
    ]);

    const cells = [nameCell, pendingCell, waitCell, runningCell, workersCell];
    if (idleWorkersCell)
        cells.push(idleWorkersCell);
    cells.push(statusCell);

    const mainRow = el("tr", { className: "queue-row-clickable" }, cells);

    // Detail row with per-worker breakdown
    const colSpan = columnCount || cells.length;
    const sortedWorkers = [...workers].sort((a, b) => {
        return WORKER_SORT_ORDER[classifyWorker(a)] - WORKER_SORT_ORDER[classifyWorker(b)];
    });
    const workerEntries = sortedWorkers.map(w => {
        const status = classifyWorker(w);
        const workerHref = buildbotBase
            ? `./worker.html?ews-worker=${w.workerid}`
            : workerPageURL(w.workerid);
        const attrs = { className: `worker-entry worker-${status}`, href: workerHref };
        let label = w.name;
        if (status === "paused") {
            label += " (paused)";
            const reason = w.pause_reason;
            if (reason)
                attrs.title = reason;
        } else if (status === "graceful") {
            label += " (graceful)";
        } else if (status === "disconnected") {
            label += " (offline)";
        }
        return el("a", attrs, [label]);
    });
    const grid = el("div", { className: "worker-detail-grid" }, workerEntries);
    const detailTd = el("td", { colSpan: `${colSpan}` }, [grid]);
    const detailRow = el("tr", { className: "worker-detail-row", style: "display:none" }, [detailTd]);
    detailRow._mainRow = mainRow;

    // Click handler to toggle detail row
    mainRow.addEventListener("click", (e) => {
        // Don't toggle when clicking links
        if (e.target.closest("a"))
            return;
        const visible = detailRow.style.display !== "none";
        detailRow.style.display = visible ? "none" : "table-row";
        toggleIndicator.textContent = visible ? "\u25B6 " : "\u25BC ";
    });

    return { rows: [mainRow, detailRow], severity };
}
