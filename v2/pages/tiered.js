import { getBuilders } from "../lib/api.js";
import { classifyByTier, findWPEReleaseTester, findGTKReleaseTester } from "../lib/builders.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuilderTable } from "../components/builder-table.js";
import { renderTimeLimitTable } from "../components/time-limit-table.js";
import { el } from "../components/_dom.js";

const TIER_SECTIONS = [
    { key: "tier1", title: "Tier 1 bots - Builders - Must be green" },
    { key: "tier2", title: "Tier 2 bots - Test bots - Must not exit early" },
    { key: "tier4", title: "Tier 4 bots - Stable/LTS must be green" },
    { key: "tier5", title: "Tier 5 bots - Remaining bots" },
    { key: "jsconly", title: "JSCOnly Linux bots" },
    { key: "retired", title: "Retired builders (no active master)" },
];

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("Tiered webkit bots dashboard"));

    const builders = await getBuilders();
    if (!builders) {
        app.appendChild(el("p", null, ["Failed to fetch builders."]));
        return;
    }

    console.log(`Found ${builders.length} bots`);

    const tiers = classifyByTier(builders);

    // Tier 1, 2, 4, 5 — standard builder tables; retired in collapsed <details>
    for (const { key, title } of TIER_SECTIONS) {
        if (key === "retired") {
            if (tiers.retired.length === 0)
                continue;
            const details = el("details", { id: key }, [
                el("summary", null, [el("h2", { style: "display:inline" }, [title])]),
                renderBuilderTable(tiers[key]),
            ]);
            app.appendChild(details);
        } else {
            const section = el("div", { id: key }, [
                el("h2", null, [title]),
                renderBuilderTable(tiers[key]),
            ]);
            app.appendChild(section);
        }
    }

    // Tier 3 — release tester time limits
    const wpeBot = findWPEReleaseTester(builders);
    const gtkBot = findGTKReleaseTester(builders);

    const tier3Children = [el("h2", null, ["Tier 3 bots - Release test bot time limit"])];

    if (wpeBot) {
        tier3Children.push(el("h3", null, ["WPE main Release tester"]));
        tier3Children.push(renderTimeLimitTable(wpeBot));
    }

    if (gtkBot) {
        tier3Children.push(el("h3", null, ["GTK main Release tester"]));
        tier3Children.push(renderTimeLimitTable(gtkBot));
    }

    // Insert tier 3 after tier 2
    const tier2Section = document.getElementById("tier2");
    const tier3Section = el("div", { id: "tier3" }, tier3Children);
    tier2Section.after(tier3Section);
}

init();
