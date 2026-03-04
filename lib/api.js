const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const BASE_URL = isLocal ? "/api/v2/" : "https://build.webkit.org/api/v2/";

export const RESULT_CODES = {
    SUCCESS: 0,
    WARNINGS: 1,
    FAILURE: 2,
    SKIPPED: 3,
    EXCEPTION: 4,
    RETRY: 5,
    CANCELLED: 6,
};

export async function fetchAPI(path) {
    try {
        const response = await fetch(BASE_URL + path);
        if (!response.ok)
            return undefined;
        return await response.json();
    } catch (e) {
        console.error(`fetchAPI(${path}):`, e);
        return undefined;
    }
}

export async function getBuilders() {
    const data = await fetchAPI("builders?field=builderid&field=name&field=tags&field=masterids");
    return data?.builders;
}

export async function getAllPendingRequests() {
    const data = await fetchAPI("buildrequests?complete__eq=false");
    return data?.buildrequests;
}

export async function getAllWorkers() {
    const data = await fetchAPI("workers");
    return data?.workers;
}

export async function getLastBuilds(builderId, count = 6) {
    const cacheKey = `buildcache-${builderId}`;
    const cached = JSON.parse(localStorage.getItem(cacheKey));

    // Quick probe: fetch just 2 builds to check current state
    const probeData = await fetchAPI(`builders/${builderId}/builds?order=-number&limit=2`);
    if (!probeData)
        return undefined;

    if (probeData.builds.length === 0)
        return probeData;

    const latestBuild = probeData.builds[0];
    const lastCompleted = latestBuild.complete ? latestBuild : probeData.builds[1];

    // Cache hit: latest completed build matches cache
    if (cached && lastCompleted && cached.latestNumber === lastCompleted.number) {
        if (latestBuild.complete) {
            return cached.data;
        } else {
            // Builder is active: merge fresh in-progress build with cached older builds
            return { builds: [latestBuild, ...cached.data.builds] };
        }
    }

    // Cache miss: full fetch
    const fullData = await fetchAPI(`builders/${builderId}/builds?order=-number&limit=${count + 1}`);
    if (!fullData)
        return undefined;

    // Cache completed builds
    const completedBuilds = fullData.builds.filter(b => b.complete);
    if (completedBuilds.length > 0) {
        const cacheData = {
            builds: completedBuilds,
            latestNumber: completedBuilds[0].number,
            data: { builds: completedBuilds },
            timestamp: Date.now(),
        };
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    }

    return fullData;
}
