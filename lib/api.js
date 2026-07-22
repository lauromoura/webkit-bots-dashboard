const isLocal = location.hostname === "localhost" || location.hostname === "127.0.0.1";
const BASE_URL = isLocal ? "/api/v2/" : "https://build.webkit.org/api/v2/";

const FETCH_TIMEOUT_MS = 30_000;

// Re-exported so existing importers keep working; defined in lib/results.js so
// browser-free modules (lib/steps.js) can use the codes too.
export { RESULT_CODES } from "./results.js";

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

    let workerNamesCache = null;
    let workerNamesCacheTime = 0;
    const WORKER_NAMES_TTL_MS = 60 * 60 * 1000; // 1 hour

    async function getWorkerNames() {
        if (workerNamesCache && (Date.now() - workerNamesCacheTime) < WORKER_NAMES_TTL_MS)
            return workerNamesCache;
        const workers = await getAllWorkers();
        const map = new Map();
        if (workers) {
            for (const w of workers)
                map.set(w.workerid, w.name);
        }
        workerNamesCache = map;
        workerNamesCacheTime = Date.now();
        return map;
    }

    return { baseURL, fetchAPI, getBuilders, getAllPendingRequests, getAllWorkers, getWorkerNames };
}

// Default API client (post-commit build.webkit.org)
const defaultAPI = createAPI(BASE_URL);

export const fetchAPI = defaultAPI.fetchAPI;
export const getBuilders = defaultAPI.getBuilders;
export const getAllPendingRequests = defaultAPI.getAllPendingRequests;
export const getAllWorkers = defaultAPI.getAllWorkers;
export const getWorkerNames = defaultAPI.getWorkerNames;

const STEP_CACHE_PREFIX = "stepcache-";
const STEP_CACHE_MAX = 50;

/**
 * Drop the oldest step-cache entries so the key set stays bounded — build ids
 * keep advancing, so these would otherwise accumulate forever.
 */
function pruneStepCache() {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(STEP_CACHE_PREFIX));
    if (keys.length <= STEP_CACHE_MAX)
        return;
    const entries = keys.map(key => {
        let ts = 0;
        try {
            ts = JSON.parse(localStorage.getItem(key))?.timestamp || 0;
        } catch {
            ts = 0; // unparseable: treat as oldest so it is evicted first
        }
        return { key, ts };
    });
    entries.sort((a, b) => a.ts - b.ts);
    for (const { key } of entries.slice(0, entries.length - STEP_CACHE_MAX))
        localStorage.removeItem(key);
}

/**
 * Fetch the steps of a single build. Steps of a completed build are immutable,
 * so results are cached per build (separate from the per-builder build cache,
 * whose whole-builder invalidation would discard them on every new build).
 *
 * The cache key includes the API base URL: build ids are only unique per server,
 * so post-commit and EWS builds can share a buildid and would otherwise collide.
 *
 * @param {number} buildId
 * @param {Object} [opts]
 * @param {boolean} [opts.complete=true] - whether the build finished (only then cached)
 * @param {Object} [opts.api] - API client from createAPI(); defaults to post-commit
 * @returns {Promise<Array<Object>|undefined>}
 */
export async function getBuildSteps(buildId, { complete = true, api = defaultAPI } = {}) {
    const cacheKey = `${STEP_CACHE_PREFIX}${api.baseURL}${buildId}`;
    if (complete) {
        try {
            const cached = JSON.parse(localStorage.getItem(cacheKey));
            if (cached && cached.steps)
                return cached.steps;
        } catch {
            localStorage.removeItem(cacheKey);
        }
    }

    const data = await api.fetchAPI(
        `builds/${buildId}/steps?field=number&field=name&field=results&field=state_string`);
    if (!data || !data.steps)
        return undefined;

    if (complete) {
        try {
            localStorage.setItem(cacheKey,
                JSON.stringify({ steps: data.steps, timestamp: Date.now() }));
            pruneStepCache();
        } catch {
            // Storage full or unavailable — caching is an optimisation, carry on.
        }
    }
    return data.steps;
}

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
