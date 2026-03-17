import { el } from "../components/_dom.js";
import { renderPageHeader } from "../components/page-header.js";
import { computeMetrics, formatPercent, formatDuration, renderCardDetail } from "./_digest-utils.js";

// --- Date helpers ---

function formatDateStr(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    const dd = String(date.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function todayStr() {
    return formatDateStr(new Date());
}

function getDefaultDates(n = 5) {
    const dates = [];
    const today = new Date();
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(formatDateStr(d));
    }
    return dates;
}

function getDateRange(fromStr, toStr) {
    let from = new Date(fromStr + "T00:00:00");
    let to = new Date(toStr + "T00:00:00");
    if (from > to) [from, to] = [to, from];

    const MAX_DAYS = 30;
    const diffDays = Math.round((to - from) / (86400000)) + 1;
    if (diffDays > MAX_DAYS) {
        from = new Date(to);
        from.setDate(from.getDate() - MAX_DAYS + 1);
    }

    const dates = [];
    const cur = new Date(from);
    while (cur <= to) {
        dates.push(formatDateStr(cur));
        cur.setDate(cur.getDate() + 1);
    }
    return { dates, truncated: diffDays > MAX_DAYS };
}

// --- URL parameter support ---

function getDateParams() {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const to = params.get("to");
    if (from && to) return { from, to };
    return null;
}

function setDateParams(from, to) {
    const url = new URL(window.location);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    history.replaceState(null, "", url);
}

// --- Earliest date probe ---

let cachedEarliestDate = null;

async function probeEarliestDate() {
    if (cachedEarliestDate) return cachedEarliestDate;
    const today = new Date();
    let consecutive404 = 0;
    let earliest = todayStr();
    for (let i = 0; i < 60; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = formatDateStr(d);
        const resp = await fetch(`./digest/data/daily/${dateStr}.json`, { method: "HEAD", cache: "no-store" }).catch(() => null);
        if (resp && resp.ok) {
            earliest = dateStr;
            consecutive404 = 0;
        } else {
            consecutive404++;
            if (consecutive404 >= 3) break;
        }
    }
    cachedEarliestDate = earliest;
    return earliest;
}

async function fetchDailyFile(dateStr) {
    const url = `./digest/data/daily/${dateStr}.json`;
    try {
        const resp = await fetch(url, { cache: "no-store" });
        if (!resp.ok) return null;
        return await resp.json();
    } catch {
        return null;
    }
}

async function fetchAllDays(dates) {
    const results = await Promise.all(dates.map(async (dateStr) => {
        const data = await fetchDailyFile(dateStr);
        return { date: dateStr, data };
    }));
    return results.filter((r) => r.data !== null);
}

// --- Data merging ---

function mergeBuilderDays(dayResults) {
    const builderMap = new Map();

    for (const { date, data } of dayResults) {
        for (const builder of data.builders) {
            if (!builderMap.has(builder.builderid)) {
                builderMap.set(builder.builderid, {
                    builderid: builder.builderid,
                    name: builder.name,
                    days: {},
                });
            }
            const metrics = computeMetrics(builder);
            builderMap.get(builder.builderid).days[date] = {
                passRate: metrics.passRate,
                healthStatus: metrics.healthStatus,
                builder,
            };
        }
    }

    return Array.from(builderMap.values());
}

// --- Trend calculation ---

function computeTrend(builderEntry, dates) {
    const loadedDates = dates.filter((d) => builderEntry.days[d]);
    if (loadedDates.length < 2) return { arrow: "\u2192", className: "digest-trend-arrow-stable" };

    const latestDate = loadedDates[loadedDates.length - 1];
    const latestRate = builderEntry.days[latestDate].passRate;
    if (latestRate == null) return { arrow: "\u2192", className: "digest-trend-arrow-stable" };

    const previousRates = loadedDates.slice(0, -1)
        .map((d) => builderEntry.days[d].passRate)
        .filter((r) => r != null);

    if (previousRates.length === 0) return { arrow: "\u2192", className: "digest-trend-arrow-stable" };

    const avg = previousRates.reduce((a, b) => a + b, 0) / previousRates.length;

    if (latestRate > avg + 0.05) return { arrow: "\u2191", className: "digest-trend-arrow-up" };
    if (latestRate < avg - 0.05) return { arrow: "\u2193", className: "digest-trend-arrow-down" };
    return { arrow: "\u2192", className: "digest-trend-arrow-stable" };
}

// --- Rendering ---

function cellClass(healthStatus) {
    const map = { green: "digest-trend-cell-green", yellow: "digest-trend-cell-yellow", red: "digest-trend-cell-red" };
    return map[healthStatus] || "digest-trend-cell-gray";
}

function renderDayDetail(builderEntry, dates) {
    const sections = [];
    for (const date of dates) {
        const dayData = builderEntry.days[date];
        if (!dayData) {
            sections.push(el("div", { className: "digest-trend-day-section" }, [
                el("h4", { textContent: date }),
                el("span", { textContent: "No data" }),
            ]));
            continue;
        }
        sections.push(el("div", { className: "digest-trend-day-section" }, [
            el("h4", { textContent: date }),
            renderCardDetail(dayData.builder),
        ]));
    }
    return el("div", { className: "digest-trend-detail" }, sections);
}

function renderGroupTable(title, builders, dates) {
    if (builders.length === 0) return null;

    const headerCells = [
        el("th", { textContent: "Builder" }),
        ...dates.map((d) => el("th", { textContent: d.slice(5) })),
        el("th", { textContent: "Trend" }),
    ];

    const rows = [];
    for (const entry of builders) {
        const trend = computeTrend(entry, dates);

        const dayCells = dates.map((d) => {
            const dayData = entry.days[d];
            if (!dayData || dayData.passRate == null) {
                return el("td", { className: "digest-trend-cell-gray", textContent: "\u2014" });
            }
            return el("td", {
                className: cellClass(dayData.healthStatus),
                textContent: formatPercent(dayData.passRate),
            });
        });

        const dataRow = el("tr", { className: "digest-trend-row" }, [
            el("td", null, [
                el("a", { href: `./builder.html?builder=${entry.builderid}` }, [entry.name]),
            ]),
            ...dayCells,
            el("td", { className: trend.className, textContent: trend.arrow }),
        ]);

        const detailRow = el("tr", { className: "digest-trend-detail-row", style: "display: none;" }, [
            el("td", { colSpan: String(dates.length + 2) }, [renderDayDetail(entry, dates)]),
        ]);

        dataRow.addEventListener("click", (e) => {
            if (e.target.closest("a")) return;
            const visible = detailRow.style.display !== "none";
            detailRow.style.display = visible ? "none" : "";
            dataRow.classList.toggle("expanded", !visible);
        });

        rows.push(dataRow, detailRow);
    }

    return el("div", { className: "digest-trend-group" }, [
        el("h3", { textContent: title }),
        el("table", { className: "digest-trend-table" }, [
            el("thead", null, [el("tr", null, headerCells)]),
            el("tbody", null, rows),
        ]),
    ]);
}

function renderTrendPage(mergedBuilders, dates) {
    const gtk = mergedBuilders.filter((b) => b.name.startsWith("GTK")).sort((a, b) => a.name.localeCompare(b.name));
    const wpe = mergedBuilders.filter((b) => b.name.startsWith("WPE")).sort((a, b) => a.name.localeCompare(b.name));

    const container = el("div", null, []);
    const gtkTable = renderGroupTable("GTK", gtk, dates);
    const wpeTable = renderGroupTable("WPE", wpe, dates);
    if (gtkTable) container.appendChild(gtkTable);
    if (wpeTable) container.appendChild(wpeTable);

    return container;
}

// --- Resolve current dates from URL or defaults ---

function resolveDates() {
    const params = getDateParams();
    if (params) {
        const { dates, truncated } = getDateRange(params.from, params.to);
        return { dates, truncated };
    }
    return { dates: getDefaultDates(5), truncated: false };
}

// --- Page init ---

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("Daily Trend"));

    const controlsArea = el("div", { className: "digest-controls" });
    const feedbackArea = el("div");
    const contentArea = el("div", { id: "digest-content" });
    app.appendChild(controlsArea);
    app.appendChild(feedbackArea);
    app.appendChild(contentArea);

    const earliestPromise = probeEarliestDate();

    const fromInput = el("input", { type: "date", className: "digest-trend-date-input" });
    const toInput = el("input", { type: "date", className: "digest-trend-date-input" });

    earliestPromise.then((earliest) => {
        fromInput.min = earliest;
        toInput.min = earliest;
        fromInput.max = todayStr();
        toInput.max = todayStr();
    });

    function applyRange(from, to) {
        fromInput.value = from;
        toInput.value = to;
        setDateParams(from, to);
        loadAndRender();
    }

    function quickSelect(n) {
        const today = new Date();
        const from = new Date(today);
        from.setDate(from.getDate() - n + 1);
        applyRange(formatDateStr(from), todayStr());
    }

    const goBtn = el("button", { className: "digest-trend-quick-btn", textContent: "Go", onclick: () => {
        if (fromInput.value && toInput.value) applyRange(fromInput.value, toInput.value);
    }});

    const controlsRow = el("div", { className: "digest-trend-controls" }, [
        el("label", null, ["From ", fromInput]),
        el("label", null, ["To ", toInput]),
        goBtn,
        el("button", { className: "digest-trend-quick-btn", textContent: "5 days", onclick: () => quickSelect(5) }),
        el("button", { className: "digest-trend-quick-btn", textContent: "7 days", onclick: () => quickSelect(7) }),
        el("button", { className: "digest-trend-quick-btn", textContent: "14 days", onclick: () => quickSelect(14) }),
        el("button", { className: "digest-refresh-btn", textContent: "Refresh", onclick: () => loadAndRender() }),
    ]);

    controlsArea.appendChild(controlsRow);

    async function loadAndRender() {
        contentArea.innerHTML = "";
        feedbackArea.innerHTML = "";

        const { dates, truncated } = resolveDates();
        fromInput.value = dates[0];
        toInput.value = dates[dates.length - 1];

        if (truncated) {
            feedbackArea.appendChild(el("div", { className: "digest-trend-missing", textContent: "Range exceeded 30 days — showing latest 30." }));
        }

        const dayResults = await fetchAllDays(dates);

        if (dayResults.length === 0) {
            contentArea.appendChild(
                el("div", { className: "digest-error" }, [
                    "No daily data found. Ensure digest/data/daily/ contains JSON files.",
                ])
            );
            return;
        }

        // Missing dates feedback
        if (dayResults.length < dates.length) {
            const loadedSet = new Set(dayResults.map((r) => r.date));
            const missing = dates.filter((d) => !loadedSet.has(d));
            feedbackArea.appendChild(el("div", { className: "digest-trend-missing",
                textContent: `Loaded ${dayResults.length} of ${dates.length} days (missing: ${missing.join(", ")})` }));
        }

        const loadedDates = dayResults.map((r) => r.date);
        const mergedBuilders = mergeBuilderDays(dayResults);
        contentArea.appendChild(renderTrendPage(mergedBuilders, loadedDates));
    }

    await loadAndRender();
}

init().catch((err) => {
    console.error("Daily trend init failed:", err);
    document.getElementById("app").textContent = "Failed to load daily trend. See console for details.";
});
