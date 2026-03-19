import { startAutoRefresh } from "../lib/auto-refresh.js";
import { getBuilders, createAPI } from "../lib/api.js";
import { isRelevantPlatform, isRetired } from "../lib/builders.js";
import { renderPageHeader } from "../components/page-header.js";
import { renderBuilderTable } from "../components/builder-table.js";
import { renderEWSBuilderTable } from "../components/ews-builder-table.js";
import { el } from "../components/_dom.js";

// ── Bot name lists (matched by name, not ID) ──

const MAIN_BUILDER_NAMES = [
    "WPE-Linux-64-bit-Release-Build",
    "WPE-Linux-64-bit-Debug-Build",
    "WPE-Linux-ARM64-bit-Release-Build",
    "GTK-Linux-64-bit-Release-Build",
    "GTK-Linux-64-bit-Debug-Build",
];

const MAIN_TESTER_NAMES = [
    "WPE-Linux-64-bit-Release-Tests",
    "WPE-Linux-64-bit-Release-JS-Tests",
    "WPE-Linux-ARM64-bit-Release-Tests",
    "WPE-Linux-ARM64-bit-Release-JS-Tests",
    "GTK-Linux-64-bit-Release-Tests",
    "GTK-Linux-64-bit-Release-JS-Tests",
];

const EWS_BUILDER_NAMES = [
    "WPE-Build-EWS",
    "GTK-Build-EWS",
];

const EWS_TESTER_NAMES = [
    "WPE-WK2-Tests-EWS",
    "GTK-WK2-Tests-EWS",
    "API-Tests-WPE-EWS",
    "API-Tests-GTK-EWS",
];

// Tester sub-groups for Section 2
const TESTER_GROUPS = [
    {
        label: "WPE x86_64",
        names: ["WPE-Linux-64-bit-Release-Tests", "WPE-Linux-64-bit-Release-JS-Tests"],
    },
    {
        label: "WPE ARM64",
        names: ["WPE-Linux-ARM64-bit-Release-Tests", "WPE-Linux-ARM64-bit-Release-JS-Tests"],
    },
    {
        label: "GTK x86_64",
        names: ["GTK-Linux-64-bit-Release-Tests", "GTK-Linux-64-bit-Release-JS-Tests"],
    },
];

const ALL_NAMED_POSTCOMMIT = new Set([...MAIN_BUILDER_NAMES, ...MAIN_TESTER_NAMES]);

// ── Helpers ──

function filterByNames(builders, names) {
    const nameSet = new Set(names);
    return names.map(name => builders.find(b => b.name === name)).filter(Boolean);
}

function warnMissing(label, builders, expectedNames) {
    const found = new Set(builders.map(b => b.name));
    for (const name of expectedNames) {
        if (!found.has(name))
            console.warn(`[Gardening] Expected ${label} builder not found: "${name}"`);
    }
}

// ── EWS API client ──

const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const EWS_BASE_URL = isLocal ? "/ews/api/v2/" : "https://ews-build.webkit.org/api/v2/";
const ewsAPI = createAPI(EWS_BASE_URL);

// ── Page init ──

async function init() {
    const app = document.getElementById("app");
    app.appendChild(renderPageHeader("Gardening Dashboard"));

    // Fetch builders from both APIs in parallel
    const [postCommitBuilders, ewsBuilders] = await Promise.all([
        getBuilders(),
        ewsAPI.getBuilders(),
    ]);

    if (!postCommitBuilders) {
        app.appendChild(el("p", null, ["Failed to fetch post-commit builders."]));
        return;
    }

    if (!ewsBuilders) {
        app.appendChild(el("p", null, ["Failed to fetch EWS builders."]));
        return;
    }

    // ── Section 1: Main Build Queues ──
    const section1 = el("div", { id: "build-bots" }, [
        el("h2", null, ["Build Bots \u2014 Must be green"]),
    ]);

    // Post-commit builders
    const mainBuilders = filterByNames(postCommitBuilders, MAIN_BUILDER_NAMES);
    warnMissing("post-commit build", postCommitBuilders, MAIN_BUILDER_NAMES);
    section1.appendChild(el("h3", null, ["Post-commit"]));
    section1.appendChild(renderBuilderTable(mainBuilders));

    // EWS builders
    const ewsBuildBots = filterByNames(ewsBuilders, EWS_BUILDER_NAMES);
    warnMissing("EWS build", ewsBuilders, EWS_BUILDER_NAMES);
    section1.appendChild(el("h3", null, ["EWS"]));
    section1.appendChild(renderEWSBuilderTable(ewsBuildBots, ewsAPI));

    app.appendChild(section1);

    // ── Section 2: Main Test Queues ──
    const section2 = el("div", { id: "test-bots" }, [
        el("h2", null, ["Test Bots \u2014 No crashes/timeouts/failures"]),
    ]);

    warnMissing("post-commit test", postCommitBuilders, MAIN_TESTER_NAMES);

    for (const group of TESTER_GROUPS) {
        const testers = filterByNames(postCommitBuilders, group.names);
        section2.appendChild(el("h3", null, [group.label]));
        section2.appendChild(renderBuilderTable(testers));
    }

    // EWS testers
    const ewsTestBots = filterByNames(ewsBuilders, EWS_TESTER_NAMES);
    warnMissing("EWS test", ewsBuilders, EWS_TESTER_NAMES);
    section2.appendChild(el("h3", null, ["EWS"]));
    section2.appendChild(renderEWSBuilderTable(ewsTestBots, ewsAPI));

    app.appendChild(section2);

    // ── Section 3: Performance Dashboard ──
    const section3 = el("div", { id: "performance" }, [
        el("h2", null, ["Performance \u2014 Check for regressions"]),
        el("p", null, [
            "Check the ",
            el("a", { href: "https://wpe-perf-dashboard.igalia.com", target: "_blank" },
                ["WPE/GTK Performance Dashboard"]),
            " for regressions over the last month.",
        ]),
        el("p", null, [
            "Benchmarks to review: MotionMark, Speedometer 3, JetStream 2 (both WPE and GTK).",
        ]),
    ]);
    app.appendChild(section3);

    // ── Section 4: Other Post-Commit Bots ──
    const otherBuilders = postCommitBuilders.filter(b =>
        isRelevantPlatform(b) && !isRetired(b) && !ALL_NAMED_POSTCOMMIT.has(b.name)
    );
    const retiredBuilders = postCommitBuilders.filter(b =>
        isRelevantPlatform(b) && isRetired(b) && !ALL_NAMED_POSTCOMMIT.has(b.name)
    );

    const section4 = el("div", { id: "other-bots" }, [
        el("h2", null, ["Other post-commit bots"]),
        renderBuilderTable(otherBuilders),
    ]);

    if (retiredBuilders.length > 0) {
        section4.appendChild(el("details", null, [
            el("summary", null, [el("h3", { style: "display:inline" },
                ["Retired builders (no active master)"])]),
            renderBuilderTable(retiredBuilders),
        ]));
    }

    app.appendChild(section4);
}

startAutoRefresh();
init().catch(err => {
    console.error("Gardening page failed to initialize:", err);
    document.getElementById("app").appendChild(
        el("p", null, ["Something went wrong loading this page."])
    );
});
