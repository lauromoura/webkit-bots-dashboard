import { startAutoRefresh } from "../lib/auto-refresh.js";
import { getBuilders } from "../lib/api.js";
import { classifyByPriority, findWPEReleaseTester, findGTKReleaseTester } from "../lib/builders.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuilderTable } from "../components/builder-table.js";
import { renderTimeLimitTable } from "../components/time-limit-table.js";
import { el } from "../components/_dom.js";

const PRIORITY_SECTIONS = [
    { key: "p1", title: "Priority 1 - Release build bots - Must be green" },
    { key: "p2", title: "Priority 2 - Release test bots - Must not exit early" },
    { key: "p3", title: "Priority 3 - Debug build bots - Must be green" },
    { key: "p5", title: "Priority 5 - Stable/LTS release bots - Must be green" },
    { key: "other", title: "Priority 6 - Other bots" },
    { key: "jsconly", title: "JSCOnly Linux bots" },
    { key: "retired", title: "Retired builders (no active master)" },
];

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

    for (const { key, title } of PRIORITY_SECTIONS) {
        if (key === "retired") {
            if (priorities.retired.length === 0)
                continue;
            const details = el("details", { id: key }, [
                el("summary", null, [el("h2", { style: "display:inline" }, [title])]),
                renderBuilderTable(priorities[key]),
            ]);
            app.appendChild(details);
        } else {
            const section = el("div", { id: key }, [
                el("h2", null, [title]),
                renderBuilderTable(priorities[key]),
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

    // Insert Priority 4 after Priority 2
    const p2Section = document.getElementById("p2");
    const p4Section = el("div", { id: "p4" }, p4Children);
    p2Section.after(p4Section);
}

startAutoRefresh();
init();
