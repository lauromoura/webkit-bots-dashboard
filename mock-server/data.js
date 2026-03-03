// Mock data generation for local development.
// Produces realistic GTK/WPE builder and build data that exercises all
// tier-filtering paths in the dashboard.

// Seeded LCG random number generator (deterministic when seed is provided)
function createRNG(seed) {
    let state = seed >>> 0;
    return function () {
        state = (state * 1664525 + 1013904223) & 0xFFFFFFFF;
        return (state >>> 0) / 0x100000000;
    };
}

// Builder definitions — IDs 6 and 133 are hardcoded in unified.js
const BUILDERS = [
    { builderid: 6,   name: "WPE Linux 64-bit Release Build",                tags: ["Build", "WPE", "Release"] },
    { builderid: 20,  name: "WPE Linux 64-bit Debug Build",                  tags: ["Build", "WPE", "Debug"] },
    { builderid: 41,  name: "GTK Linux 64-bit Release Build",                tags: ["Build", "GTK", "Release"] },
    { builderid: 43,  name: "GTK Linux 64-bit Debug Build",                  tags: ["Build", "GTK", "Debug"] },
    { builderid: 40,  name: "WPE Linux 64-bit Release Tests",                tags: ["Tests", "WPE", "Release"] },
    { builderid: 44,  name: "WPE Linux 64-bit Release JS Tests",             tags: ["Tests", "WPE", "Release", "JS"] },
    { builderid: 57,  name: "GTK Linux 64-bit Release Tests",                tags: ["Tests", "GTK", "Release"] },
    { builderid: 58,  name: "GTK Linux 64-bit Release JS Tests",             tags: ["Tests", "GTK", "Release", "JS"] },
    { builderid: 80,  name: "GTK Linux 64-bit Release Skip Failing Tests",   tags: ["Tests", "GTK", "Release", "Skip", "Failing"] },
    { builderid: 100, name: "WPE Linux 64-bit Ubuntu LTS Release Build",     tags: ["Build", "WPE", "Release", "Ubuntu"] },
    { builderid: 101, name: "GTK Linux 64-bit Debian Stable Release Build",  tags: ["Build", "GTK", "Release", "Debian"] },
    { builderid: 102, name: "GTK Linux 64-bit Ubuntu LTS Release Build",     tags: ["Build", "GTK", "Release", "Ubuntu"] },
    { builderid: 120, name: "WPE Linux 64-bit Debug Tests",                  tags: ["Tests", "WPE", "Debug"] },
    { builderid: 121, name: "GTK Linux 64-bit Debug Tests",                  tags: ["Tests", "GTK", "Debug"] },
    { builderid: 130, name: "WPE Linux 64-bit Release WebDriver Tests",      tags: ["Tests", "WPE", "Release", "WebDriver"] },
    { builderid: 131, name: "GTK Linux 64-bit Release GTK4 Tests",           tags: ["Tests", "GTK", "Release", "GTK4"] },
    { builderid: 132, name: "GTK Linux 64-bit Release Wayland Tests",        tags: ["Tests", "GTK", "Release", "Wayland"] },
    { builderid: 133, name: "WPE Linux 64-bit Non-Unified Release Build",    tags: ["Build", "WPE", "Release", "Non", "Unified"] },
    { builderid: 134, name: "GTK Linux 64-bit Release Perf Tests",           tags: ["Tests", "GTK", "Release", "Perf"] },
    { builderid: 140, name: "WPE Linux 64-bit Release Packaging",            tags: ["Packaging", "WPE", "Release"] },
];

const FAILURE_STRINGS_BUILD = [
    "failed (failure)",
    "build failed",
    "failed compile-webkit",
];

const FAILURE_STRINGS_TEST = [
    "failed (failure)",
    "Exited early: 50 failures found",
    "layout-tests failed",
    "Exited early: too many crashes",
];

function generateBuilds(seed) {
    const rng = createRNG(seed);
    const now = Math.floor(Date.now() / 1000);
    const buildsMap = new Map();

    // Assign health profiles: 0=healthy(90%), 1=flaky(60%), 2=broken(first 3 fail)
    const healthProfiles = new Map();
    for (const builder of BUILDERS) {
        const roll = rng();
        if (roll < 0.5) healthProfiles.set(builder.builderid, "healthy");
        else if (roll < 0.8) healthProfiles.set(builder.builderid, "flaky");
        else healthProfiles.set(builder.builderid, "broken");
    }

    // Decide which ~30% of builders have an in-progress newest build
    const inProgressBuilders = new Set();
    for (const builder of BUILDERS) {
        if (rng() < 0.3) inProgressBuilders.add(builder.builderid);
    }

    // Shared identifier counter for builders 6 and 133
    let sharedIdentifierCounter = 280456;

    // Per-builder identifier counters for all other builders
    const identifierCounters = new Map();
    for (const builder of BUILDERS) {
        if (builder.builderid !== 6 && builder.builderid !== 133) {
            // Start at a slightly different offset per builder for variety
            identifierCounters.set(builder.builderid, 280456 - Math.floor(rng() * 50));
        }
    }

    // Generate builds for builders 6 and 133 first (shared identifiers, 350 builds each)
    const sharedBuilders = BUILDERS.filter(b => b.builderid === 6 || b.builderid === 133);
    // Generate a shared sequence of identifiers
    const sharedIdentifiers = [];
    for (let i = 0; i < 350; i++) {
        sharedIdentifiers.push(sharedIdentifierCounter - i);
    }

    for (const builder of sharedBuilders) {
        const isBuildTagged = builder.tags.includes("Build");
        const health = healthProfiles.get(builder.builderid);
        const hasInProgress = inProgressBuilders.has(builder.builderid);
        const buildCount = 350;
        const builds = [];
        let cursor = now;

        for (let i = 0; i < buildCount; i++) {
            const buildNumber = buildCount - i + 100; // offset so numbers look realistic
            const isFirst = i === 0;
            const isInProgress = isFirst && hasInProgress;

            // Duration: 15-45 min for Build tagged, 30-90 min for Tests tagged
            const minDuration = isBuildTagged ? 15 * 60 : 30 * 60;
            const maxDuration = isBuildTagged ? 45 * 60 : 90 * 60;
            const duration = Math.floor(minDuration + rng() * (maxDuration - minDuration));

            // Gap between builds: 5-30 min
            const gap = Math.floor(5 * 60 + rng() * 25 * 60);

            let complete, results, stateString;
            if (isInProgress) {
                complete = false;
                results = null;
                stateString = isBuildTagged ? "building" : "running layout-tests";
                cursor -= Math.floor(duration * rng()); // partially through
            } else {
                complete = true;
                // Determine success/failure based on health profile
                let success;
                if (health === "healthy") {
                    success = rng() < 0.9;
                } else if (health === "flaky") {
                    success = rng() < 0.6;
                } else {
                    // broken: first 3 completed builds fail
                    const completedIndex = hasInProgress ? i - 1 : i;
                    success = completedIndex >= 3 ? rng() < 0.85 : false;
                }
                results = success ? 0 : 2;
                stateString = success ? "build successful" : pickFailureString(builder, rng);
            }

            const completedAt = isInProgress ? null : cursor;
            const startedAt = isInProgress ? cursor : cursor - duration;

            builds.push({
                builderid: builder.builderid,
                buildid: builder.builderid * 10000 + buildNumber,
                number: buildNumber,
                complete,
                results,
                state_string: stateString,
                started_at: startedAt,
                complete_at: completedAt,
                _identifier: `${sharedIdentifiers[i]}@main`,
            });

            if (!isInProgress) {
                cursor = startedAt - gap;
            }
        }

        buildsMap.set(builder.builderid, builds);
    }

    // Generate builds for all other builders (10 builds each)
    const otherBuilders = BUILDERS.filter(b => b.builderid !== 6 && b.builderid !== 133);
    for (const builder of otherBuilders) {
        const isBuildTagged = builder.tags.includes("Build");
        const health = healthProfiles.get(builder.builderid);
        const hasInProgress = inProgressBuilders.has(builder.builderid);
        const buildCount = 10;
        const builds = [];
        let cursor = now;
        let idCounter = identifierCounters.get(builder.builderid);

        for (let i = 0; i < buildCount; i++) {
            const buildNumber = buildCount - i + 50;
            const isFirst = i === 0;
            const isInProgress = isFirst && hasInProgress;

            const minDuration = isBuildTagged ? 15 * 60 : 30 * 60;
            const maxDuration = isBuildTagged ? 45 * 60 : 90 * 60;
            const duration = Math.floor(minDuration + rng() * (maxDuration - minDuration));
            const gap = Math.floor(5 * 60 + rng() * 25 * 60);

            let complete, results, stateString;
            if (isInProgress) {
                complete = false;
                results = null;
                stateString = isBuildTagged ? "building" : "running layout-tests";
                cursor -= Math.floor(duration * rng());
            } else {
                complete = true;
                let success;
                if (health === "healthy") {
                    success = rng() < 0.9;
                } else if (health === "flaky") {
                    success = rng() < 0.6;
                } else {
                    const completedIndex = hasInProgress ? i - 1 : i;
                    success = completedIndex >= 3 ? rng() < 0.85 : false;
                }
                results = success ? 0 : 2;
                stateString = success ? "build successful" : pickFailureString(builder, rng);
            }

            const completedAt = isInProgress ? null : cursor;
            const startedAt = isInProgress ? cursor : cursor - duration;

            builds.push({
                builderid: builder.builderid,
                buildid: builder.builderid * 10000 + buildNumber,
                number: buildNumber,
                complete,
                results,
                state_string: stateString,
                started_at: startedAt,
                complete_at: completedAt,
                _identifier: `${idCounter - i}@main`,
            });

            if (!isInProgress) {
                cursor = startedAt - gap;
            }
        }

        buildsMap.set(builder.builderid, builds);
    }

    return buildsMap;
}

function pickFailureString(builder, rng) {
    const strings = builder.tags.includes("Build") ? FAILURE_STRINGS_BUILD : FAILURE_STRINGS_TEST;
    return strings[Math.floor(rng() * strings.length)];
}

// Apply query parameters to a builds array and return the filtered/shaped result.
function queryBuilds(builds, params) {
    let filtered = builds.slice();

    // complete=1 or complete=true
    if (params.complete === "1" || params.complete === "true") {
        filtered = filtered.filter(b => b.complete === true);
    }

    // results=0
    if (params.results === "0") {
        filtered = filtered.filter(b => b.results === 0);
    }

    // order: default is -number (descending), already sorted that way
    if (params.order === "number") {
        filtered = filtered.slice().reverse();
    }

    // limit
    if (params.limit) {
        const limit = parseInt(params.limit, 10);
        if (!isNaN(limit) && limit > 0) {
            filtered = filtered.slice(0, limit);
        }
    }

    // property=identifier → include properties.identifier on each build
    const includeIdentifier = params.property === "identifier";

    const serialized = filtered.map(b => {
        const obj = {
            builderid: b.builderid,
            buildid: b.buildid,
            number: b.number,
            complete: b.complete,
            results: b.results,
            state_string: b.state_string,
            started_at: b.started_at,
            complete_at: b.complete_at,
        };
        if (includeIdentifier) {
            obj.properties = { identifier: [b._identifier, "Change"] };
        }
        return obj;
    });

    return { builds: serialized, meta: { total: serialized.length } };
}

module.exports = { BUILDERS, generateBuilds, queryBuilds };
