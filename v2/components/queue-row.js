import { el } from "./_dom.js";
import { buildbotBuilderURL, builderPageURL } from "../lib/urls.js";

// Severity thresholds — adjust these to tune color coding
const SPINUP_THRESHOLD_SEC = 600;        // 10 minutes — normal worker spin-up time
const PENDING_WARN_THRESHOLD = 3;
const WAIT_WARN_THRESHOLD_SEC = 1800;    // 30 minutes

const SEVERITY_IDLE = 0;
const SEVERITY_WORKING = 1;
const SEVERITY_PREPARING = 2;
const SEVERITY_WARNING = 3;
const SEVERITY_CRITICAL = 4;

export function classifySeverity(pendingCount, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers, runningCount) {
    if (pendingCount === 0 && runningCount === 0)
        return SEVERITY_IDLE;

    if (runningCount > 0) {
        // When builds are running, oldest wait grows to match build duration —
        // only the pending COUNT indicates a real backlog.
        if (pendingCount >= PENDING_WARN_THRESHOLD)
            return SEVERITY_WARNING;
        return SEVERITY_WORKING;
    }

    // From here: pending > 0, running == 0
    const workersAvailable = connectedWorkers > 0 && pausedWorkers < totalWorkers;
    if (workersAvailable) {
        // Nothing running despite available workers — long wait IS abnormal
        if (pendingCount >= PENDING_WARN_THRESHOLD || oldestWaitSec > WAIT_WARN_THRESHOLD_SEC)
            return SEVERITY_WARNING;
        return SEVERITY_WORKING;
    }

    // No workers available, pending > 0, running == 0
    if (oldestWaitSec >= SPINUP_THRESHOLD_SEC)
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

/**
 * Render a single queue status row.
 *
 * @param {Object} builder - { builderid, name, tags }
 * @param {Array} requests - build requests for this builder (incomplete only)
 * @param {Array} workers - workers configured for this builder
 * @returns {{ row: HTMLTableRowElement, severity: number }}
 */
export function renderQueueRow(builder, requests, workers) {
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

    const severity = classifySeverity(pending.length, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers, running.length);

    // Builder name cell
    const nameCell = el("td", { className: "builderName" }, [
        el("a", { href: builderPageURL(builder.builderid) }, [builder.name]),
        " (",
        el("a", { href: buildbotBuilderURL(builder.builderid), target: "_blank" }, ["buildbot"]),
        ")",
    ]);

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
    const runningCell = el("td", { className: "queue-status", "data-sort": `${longestRunningSec}` }, [runningText]);

    // Workers cell
    let workersText = `${connectedWorkers}/${totalWorkers} connected`;
    if (pausedWorkers > 0)
        workersText += ` (${pausedWorkers} paused)`;
    const workersCell = el("td", { className: "queue-status", "data-sort": `${connectedWorkers}` }, [workersText]);

    // Status cell
    const statusLabels = ["Idle", "Working", "Preparing", "Warning", "Critical"];
    const statusClasses = ["queue-idle", "queue-working", "queue-preparing", "queue-warning", "queue-critical"];
    const statusCell = el("td", { className: `queue-status ${statusClasses[severity]}`, "data-sort": `${severity}` }, [
        statusLabels[severity],
    ]);

    const row = el("tr", null, [nameCell, pendingCell, waitCell, runningCell, workersCell, statusCell]);

    return { row, severity };
}
