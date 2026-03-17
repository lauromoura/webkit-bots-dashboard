import { el } from "../components/_dom.js";
import { renderPageHeader } from "../components/page-header.js";
import { computeMetrics, formatPercent, formatDuration, renderCardDetail } from "./_digest-utils.js";

// --- Data loading ---

async function fetchSnapshot(window) {
    const url = `./digest/data/current/${window}.json`;
    try {
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

function classifyBuilders(builders) {
    const attention = [];
    const healthy = [];
    const idle = [];

    for (const b of builders) {
        const metrics = computeMetrics(b);
        const entry = { ...b, metrics };
        if (b.total_requests === 0 || metrics.passRate === null) {
            idle.push(entry);
        } else if (metrics.passRate < 0.9) {
            attention.push(entry);
        } else {
            healthy.push(entry);
        }
    }

    // Sort attention worst-first
    attention.sort((a, b) => (a.metrics.passRate ?? -1) - (b.metrics.passRate ?? -1));
    // Sort healthy by name
    healthy.sort((a, b) => a.name.localeCompare(b.name));
    idle.sort((a, b) => a.name.localeCompare(b.name));

    return { attention, healthy, idle };
}

// --- Rendering ---

function renderAttentionCard(entry) {
    const { metrics } = entry;
    const statusClass = `digest-card-${metrics.healthStatus}`;

    const card = el("div", { className: `digest-card ${statusClass}` });
    let expanded = false;
    let detailEl = null;

    const header = el("div", { className: "digest-card-header" }, [
        el("a", {
            className: "digest-card-name",
            href: `./builder.html?builder=${entry.builderid}`,
            onclick: (e) => e.stopPropagation(),
        }, [entry.name]),
        el("span", { className: "digest-badge", textContent: formatPercent(metrics.passRate) }),
    ]);

    const summary = el("div", { className: "digest-card-summary" }, [
        el("span", { textContent: `${entry.total_requests} requests` }),
        metrics.medianTotalTime != null
            ? el("span", { textContent: `Median: ${formatDuration(metrics.medianTotalTime)}` })
            : null,
        metrics.primaryFailureType
            ? el("span", { className: "digest-failure-type", textContent: metrics.primaryFailureType })
            : null,
    ].filter(Boolean));

    card.appendChild(header);
    card.appendChild(summary);

    card.addEventListener("click", () => {
        if (expanded) {
            detailEl.remove();
            detailEl = null;
            expanded = false;
            card.classList.remove("expanded");
        } else {
            detailEl = renderCardDetail(entry);
            card.appendChild(detailEl);
            expanded = true;
            card.classList.add("expanded");
        }
    });

    return card;
}

function renderAttentionSection(builders) {
    if (builders.length === 0) {
        return el("div", { className: "digest-section" }, [
            el("h2", { textContent: "Needs attention" }),
            el("div", { className: "digest-all-green" }, [
                "All builders are healthy!",
            ]),
        ]);
    }

    const cards = builders.map(renderAttentionCard);
    return el("div", { className: "digest-section" }, [
        el("h2", { textContent: `Needs attention (${builders.length})` }),
        el("div", { className: "digest-card-grid" }, cards),
    ]);
}

function renderHealthySection(builders) {
    if (builders.length === 0) return null;

    const rows = [];
    builders.forEach((entry) => {
        const { metrics } = entry;
        const dataRow = el("tr", { className: "digest-healthy-row" }, [
            el("td", null, [
                el("a", { href: `./builder.html?builder=${entry.builderid}` }, [entry.name]),
            ]),
            el("td", { textContent: formatPercent(metrics.passRate) }),
            el("td", { textContent: String(entry.total_requests) }),
            el("td", { textContent: formatDuration(metrics.medianTotalTime) }),
        ]);
        const detailRow = el("tr", { className: "digest-healthy-detail", style: "display: none;" }, [
            el("td", { colSpan: 4 }, [renderCardDetail(entry)]),
        ]);

        dataRow.addEventListener("click", (e) => {
            if (e.target.closest("a")) return;
            const visible = detailRow.style.display !== "none";
            detailRow.style.display = visible ? "none" : "";
            dataRow.classList.toggle("expanded", !visible);
        });

        rows.push(dataRow, detailRow);
    });

    return el("div", { className: "digest-section" }, [
        el("h2", { textContent: `Healthy (${builders.length})` }),
        el("table", { className: "digest-healthy-table" }, [
            el("thead", null, [
                el("tr", null, [
                    el("th", { textContent: "Builder" }),
                    el("th", { textContent: "Pass Rate" }),
                    el("th", { textContent: "Requests" }),
                    el("th", { textContent: "Median Time" }),
                ]),
            ]),
            el("tbody", null, rows),
        ]),
    ]);
}

function renderIdleSection(builders) {
    if (builders.length === 0) return null;

    const items = builders.map((entry) =>
        el("li", null, [
            el("a", { href: `./builder.html?builder=${entry.builderid}` }, [entry.name]),
        ])
    );

    return el("details", { className: "digest-section digest-idle" }, [
        el("summary", null, [`Idle (${builders.length} builders with 0 requests)`]),
        el("ul", null, items),
    ]);
}

function renderWindowToggle(activeWindow, onSelect) {
    const windows = ["1h", "6h", "24h"];
    const buttons = windows.map((w) =>
        el("button", {
            className: "digest-window-btn" + (w === activeWindow ? " active" : ""),
            textContent: w,
            onclick: () => onSelect(w),
        })
    );
    return el("div", { className: "digest-window-toggle" }, buttons);
}

function renderMeta(data, onRefresh) {
    const genDate = new Date(data.generated_at);
    const windowStart = new Date(data.window.start);
    const windowEnd = new Date(data.window.end);

    return el("div", { className: "digest-meta" }, [
        el("span", null, [
            `Window: ${windowStart.toLocaleString()} — ${windowEnd.toLocaleString()}`,
        ]),
        el("span", null, [
            `Generated: ${genDate.toLocaleString()}`,
        ]),
        el("button", { className: "digest-refresh-btn", textContent: "Refresh", onclick: onRefresh }),
    ]);
}

// --- Page init ---

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("Pass Ratio"));

    let currentWindow = "24h";
    const contentArea = el("div", { id: "digest-content" });

    // Toggle and content container
    const controlsArea = el("div", { className: "digest-controls" });
    app.appendChild(controlsArea);
    app.appendChild(contentArea);

    async function loadAndRender() {
        contentArea.innerHTML = "";
        controlsArea.innerHTML = "";

        // Render toggle
        controlsArea.appendChild(renderWindowToggle(currentWindow, async (w) => {
            currentWindow = w;
            await loadAndRender();
        }));

        const data = await fetchSnapshot(currentWindow);

        if (!data) {
            contentArea.appendChild(
                el("div", { className: "digest-error" }, [
                    `Failed to load data for ${currentWindow} window. Ensure digest/data/current/${currentWindow}.json exists.`,
                ])
            );
            return;
        }

        // Meta line with refresh
        controlsArea.appendChild(renderMeta(data, loadAndRender));

        const { attention, healthy, idle } = classifyBuilders(data.builders);

        contentArea.appendChild(renderAttentionSection(attention));

        const healthyEl = renderHealthySection(healthy);
        if (healthyEl) contentArea.appendChild(healthyEl);

        const idleEl = renderIdleSection(idle);
        if (idleEl) contentArea.appendChild(idleEl);
    }

    await loadAndRender();
}

init().catch((err) => {
    console.error("Digest init failed:", err);
    document.getElementById("app").textContent = "Failed to load digest. See console for details.";
});
