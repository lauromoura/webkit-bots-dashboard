const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const BASE_URL = isLocal ? "/api/v2/" : "https://build.webkit.org/api/v2/";

const FETCH_TIMEOUT_MS = 30_000;

export const RESULT_CODES = {
    SUCCESS: 0,
    WARNINGS: 1,
    FAILURE: 2,
    SKIPPED: 3,
    EXCEPTION: 4,
    RETRY: 5,
    CANCELLED: 6,
};

/**
 * Create an API client for a given Buildbot base URL.
 * Returns fetch helpers bound to that base.
 */
export function createAPI(baseURL) {
    async function fetchAPI(path) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            const response = await fetch(baseURL + path, { signal: controller.signal });
            if (!response.ok)
                return undefined;
            return await response.json();
        } catch (e) {
            console.error(`fetchAPI(${path}):`, e);
            return undefined;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async function getBuilders() {
        const data = await fetchAPI("builders?field=builderid&field=name&field=tags&field=masterids");
        return data?.builders;
    }

    async function getAllPendingRequests() {
        const data = await fetchAPI("buildrequests?complete__eq=false");
        return data?.buildrequests;
    }

    async function getAllWorkers() {
        const data = await fetchAPI("workers");
        return data?.workers;
    }

    return { fetchAPI, getBuilders, getAllPendingRequests, getAllWorkers };
}

// Default API client (post-commit build.webkit.org)
const defaultAPI = createAPI(BASE_URL);

export const fetchAPI = defaultAPI.fetchAPI;
export const getBuilders = defaultAPI.getBuilders;
export const getAllPendingRequests = defaultAPI.getAllPendingRequests;
export const getAllWorkers = defaultAPI.getAllWorkers;

export async function getLastBuilds(builderId, count = 6) {
    const cacheKey = `buildcache-${builderId}`;
    let cached;
    try {
        cached = JSON.parse(localStorage.getItem(cacheKey));
    } catch {
        localStorage.removeItem(cacheKey);
        cached = null;
    }

    // Quick probe: fetch just 2 builds to check current state
    const probeData = await fetchAPI(`builders/${builderId}/builds?order=-number&limit=2`);
    if (!probeData)
        return undefined;

    if (!probeData.builds || probeData.builds.length === 0)
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
