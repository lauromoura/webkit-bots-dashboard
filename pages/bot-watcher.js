import { startAutoRefresh } from "../lib/auto-refresh.js";
import { getBuilders } from "../lib/api.js";
import { classifyByPriority, findWPEReleaseTester, findGTKReleaseTester } from "../lib/builders.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuilderTable } from "../components/builder-table.js";
import { renderTimeLimitTable } from "../components/time-limit-table.js";
import { lazyDetails } from "../components/lazy-details.js";
import { el } from "../components/_dom.js";

const PRIORITY_SECTIONS = [
    { key: "p1", title: "Priority 1 - Release build bots - Must be green" },
    { key: "p2", title: "Priority 2 - Release test bots - Must not exit early" },
    { key: "p3", title: "Priority 3 - Debug test bots - Must build" },
    { key: "p5", title: "Priority 5 - Stable/LTS release bots - Must be green" },
    { key: "other", title: "Priority 6 - Other bots" },
    { key: "jsconly", title: "JSCOnly Linux bots" },
    { key: "retired", title: "Retired builders (no active master)" },
];

// Low-priority groups: collapsed by default and fetched only when opened.
const LAZY_KEYS = new Set(["other", "jsconly", "retired"]);

// Debug bots build and test in one job, so a red job may still have compiled.
// P3's criterion is "must build", so judge it by its build steps (lib/steps.js).
const STEP_AWARE_KEYS = new Set(["p3"]);

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("Bot Watcher - Priority-based dashboard"));
    app.appendChild(el("p", { style: "font-style:italic; color:#666" },
        ["Priority list based on the original bot watching priorities used in past WebKit gardening workflows."]));

    const builders = await getBuilders();
    if (!builders) {
        app.appendChild(el("p", null, ["Failed to fetch builders."]));
        return;
    }

    console.log(`Found ${builders.length} bots`);

    const priorities = classifyByPriority(builders);

    // P1/P2/P3/P5 render eagerly (priority — always visible). Other, JSCOnly and
    // Retired are collapsed by default and fetch their bots only when expanded.
    for (const { key, title } of PRIORITY_SECTIONS) {
        if (LAZY_KEYS.has(key)) {
            app.appendChild(lazyDetails({
                id: key,
                title,
                count: priorities[key].length,
                build: (onLoaded) => renderBuilderTable(priorities[key], onLoaded),
            }));
        } else {
            const section = el("div", { id: key }, [
                el("h2", null, [title]),
                renderBuilderTable(priorities[key], undefined,
                    { stepAware: STEP_AWARE_KEYS.has(key) }),
            ]);
            app.appendChild(section);
        }
    }

    // Priority 4 — release tester time limits
    const wpeBot = findWPEReleaseTester(builders);
    const gtkBot = findGTKReleaseTester(builders);

    const p4Children = [el("h2", null, ["Priority 4 - Release test bot time limit"])];

    if (wpeBot) {
        p4Children.push(el("h3", null, ["WPE main Release tester"]));
        p4Children.push(renderTimeLimitTable(wpeBot));
    }

    if (gtkBot) {
        p4Children.push(el("h3", null, ["GTK main Release tester"]));
        p4Children.push(renderTimeLimitTable(gtkBot));
    }

    // Insert Priority 4 after Priority 3 (Debug), so the on-screen order matches
    // the priority table: P1, P2, P3, P4, P5, P6.
    const p3Section = document.getElementById("p3");
    const p4Section = el("div", { id: "p4" }, p4Children);
    p3Section.after(p4Section);
}

startAutoRefresh();
init();
