import { el } from "../components/_dom.js";

// --- Metric computation ---

export function computeMetrics(builder) {
    const { completed, outcomes, timing } = builder;
    const skipped = outcomes.Skipped || 0;
    const executed = completed - skipped;
    if (executed === 0) {
        return { passRate: null, healthStatus: "idle", primaryFailureType: null, medianTotalTime: null };
    }

    const passed = (outcomes.Success || 0) + (outcomes.Warnings || 0);
    const passRate = passed / executed;

    let healthStatus = "red";
    if (passRate >= 0.9) healthStatus = "green";
    else if (passRate >= 0.7) healthStatus = "yellow";

    // Find primary failure type (highest count among non-success outcomes)
    let primaryFailureType = null;
    let maxFail = 0;
    for (const [type, count] of Object.entries(outcomes)) {
        if (type === "Success" || type === "Warnings" || type === "Skipped") continue;
        if (count > maxFail) {
            maxFail = count;
            primaryFailureType = type;
        }
    }

    const medianTotalTime = timing.total ? timing.total.median_s : null;

    return { passRate, healthStatus, primaryFailureType, medianTotalTime };
}

// --- Formatting ---

export function formatDuration(seconds) {
    if (seconds == null) return "\u2014";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    const rem = s % 60;
    if (m < 60) return `${m}m ${rem}s`;
    const h = Math.floor(m / 60);
    const remM = m % 60;
    return `${h}h ${remM}m`;
}

export function formatPercent(rate) {
    if (rate == null) return "\u2014";
    return (rate * 100).toFixed(1) + "%";
}

// --- Rendering helpers ---

export function renderTimingRow(label, stats) {
    if (!stats || stats.n === 0) return null;
    return el("tr", null, [
        el("td", { textContent: label }),
        el("td", { textContent: formatDuration(stats.avg_s) }),
        el("td", { textContent: formatDuration(stats.median_s) }),
        el("td", { textContent: formatDuration(stats.p90_s) }),
        el("td", { textContent: formatDuration(stats.max_s) }),
    ]);
}

export function renderCardDetail(builder) {
    const { outcomes, timing } = builder;

    // Outcome counts
    const outcomeItems = Object.entries(outcomes)
        .filter(([, v]) => v > 0)
        .map(([k, v]) => el("span", { className: "digest-outcome-chip", textContent: `${k}: ${v}` }));

    const outcomeRow = el("div", { className: "digest-detail-outcomes" }, outcomeItems);

    // Timing table
    const timingRows = [
        renderTimingRow("Queue wait", timing.queue_wait),
        renderTimingRow("Execution", timing.execution),
        renderTimingRow("Total", timing.total),
        renderTimingRow("Skip wait", timing.skip_wait),
    ].filter(Boolean);

    const timingTable = el("table", { className: "digest-timing-table" }, [
        el("thead", null, [
            el("tr", null, [
                el("th", { textContent: "Phase" }),
                el("th", { textContent: "Avg" }),
                el("th", { textContent: "Median" }),
                el("th", { textContent: "P90" }),
                el("th", { textContent: "Max" }),
            ]),
        ]),
        el("tbody", null, timingRows),
    ]);

    return el("div", { className: "digest-card-detail" }, [
        el("h4", { textContent: "Outcome breakdown" }),
        outcomeRow,
        el("h4", { textContent: "Timing breakdown" }),
        timingTable,
    ]);
}
