import { el } from "./_dom.js";
import { buildbotBuilderURL } from "../lib/urls.js";

// Severity thresholds — adjust these to tune color coding
const PENDING_SLOW_THRESHOLD = 3;
const WAIT_SLOW_THRESHOLD_MIN = 30;

const SEVERITY_OK = 0;
const SEVERITY_MODERATE = 1;
const SEVERITY_SLOW = 2;
const SEVERITY_CRITICAL = 3;

export function classifySeverity(pendingCount, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers) {
    // Workers scale to zero when idle — only critical if jobs are waiting with no workers
    const noWorkersAvailable = connectedWorkers === 0 || pausedWorkers === totalWorkers;
    if (pendingCount > 0 && noWorkersAvailable)
        return SEVERITY_CRITICAL;
    if (pendingCount >= PENDING_SLOW_THRESHOLD || oldestWaitSec > WAIT_SLOW_THRESHOLD_MIN * 60)
        return SEVERITY_SLOW;
    if (pendingCount > 0)
        return SEVERITY_MODERATE;
    return SEVERITY_OK;
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

    const severity = classifySeverity(pending.length, oldestWaitSec, connectedWorkers, totalWorkers, pausedWorkers);

    // Builder name cell
    const nameCell = el("td", { className: "builderName" }, [
        el("a", { href: buildbotBuilderURL(builder.builderid) }, [builder.name]),
    ]);

    // Pending cell
    const pendingCell = el("td", { className: "queue-status" }, [
        pending.length > 0 ? `${pending.length} pending` : "0",
    ]);

    // Oldest wait cell
    const waitCell = el("td", { className: "queue-status" }, [
        pending.length > 0 ? formatDuration(oldestWaitSec) : "\u2014",
    ]);

    // Running cell
    let runningText;
    if (running.length === 0) {
        runningText = "\u2014";
    } else {
        const elapsed = running.map(r => now - r.claimed_at);
        const longest = Math.max(...elapsed);
        runningText = `${running.length} build${running.length > 1 ? "s" : ""} (${formatDuration(longest)})`;
    }
    const runningCell = el("td", { className: "queue-status" }, [runningText]);

    // Workers cell
    let workersText = `${connectedWorkers}/${totalWorkers} connected`;
    if (pausedWorkers > 0)
        workersText += ` (${pausedWorkers} paused)`;
    const workersCell = el("td", { className: "queue-status" }, [workersText]);

    // Status cell
    const statusLabels = ["OK", "Moderate", "Slow", "Critical"];
    const statusClasses = ["queue-ok", "queue-moderate", "queue-slow", "queue-critical"];
    const statusCell = el("td", { className: `queue-status ${statusClasses[severity]}` }, [
        statusLabels[severity],
    ]);

    const row = el("tr", null, [nameCell, pendingCell, waitCell, runningCell, workersCell, statusCell]);

    return { row, severity };
}
