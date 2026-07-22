/**
 * Build-step classification, ported from the gardening tooling.
 *
 * SOURCE OF TRUTH: wk-garden/scripts/bots.py (TEST_STEPS, NOISE_STEPS, step_kind)
 * and wk-garden/scripts/fetch-build-status.py (classify). Keep the sets below in
 * sync with bots.py — they are duplicated across two languages.
 *
 * Why this exists: debug bots now build *and* test in one job, so the job goes red
 * on test failures even when compilation succeeded. "Is the build broken?" has to
 * be answered from the steps, not the job result.
 */

import { RESULT_CODES } from "./results.js";

// Results that do not indicate a problem on their own (bots.py OK_RESULTS).
const OK_RESULTS = [RESULT_CODES.SUCCESS, RESULT_CODES.WARNINGS, RESULT_CODES.SKIPPED];

// Steps that run tests. A failure here is test breakage, not a broken build.
//
// Everything NOT listed here (compile-webkit, jhbuild, download-built-product,
// extract-built-product, clean-and-update-working-directory, ...) counts as a
// build/infrastructure step, and a failure there IS a broken build. This
// build-by-default rule is deliberate: an unknown or renamed step is reported
// loudly as a build break rather than silently ignored.
export const TEST_STEPS = new Set([
    "layout-test",
    "run-api-tests",
    "jscore-test",
    "test262-test",
    "webkitpy-test",
    "webkitperl-test",
    "bindings-generation-tests",
    "builtins-generator-tests",
    "dashboard-tests",
    "webdriver-test",
    "run-javascriptcore-tests",
]);

// Steps that are pure result plumbing; never interesting either way.
export const NOISE_STEPS = new Set([
    "generate-s3-url",
    "upload-file-to-s3",
    "upload",
    "archive-test-results",
    "extract-test-results",
    "set-permissions",
    "worker_preparation",
]);

export function isOkResult(results) {
    return OK_RESULTS.includes(results);
}

/**
 * Classify a buildbot step as "test", "noise" or "build".
 *
 * Buildbot suffixes duplicate step names (`layout-test_1`), so match the raw name
 * and again with any trailing digits/underscores stripped — the JS equivalent of
 * bots.py's `step_name.rstrip("_0123456789")`.
 *
 * @param {string} stepName
 * @returns {"test"|"noise"|"build"}
 */
export function stepKind(stepName) {
    const base = stepName.replace(/[_0-9]+$/, "") || stepName;
    if (TEST_STEPS.has(stepName) || TEST_STEPS.has(base))
        return "test";
    if (NOISE_STEPS.has(stepName) || NOISE_STEPS.has(base))
        return "noise";
    return "build";
}

/**
 * Decide whether a red build represents broken *build* state, from its steps.
 * Mirrors fetch-build-status.py classify(): build-step failures take precedence
 * over test-step failures.
 *
 * @param {Array<Object>} steps - as returned by getBuildSteps()
 * @returns {{buildOk: boolean, failedBuildSteps: string[], failedTestSteps: string[], reason: string}}
 */
export function classifyBuildHealth(steps) {
    const failed = (steps || []).filter(
        s => s.results !== null && s.results !== undefined && !isOkResult(s.results));

    const failedBuildSteps = failed.filter(s => stepKind(s.name) === "build").map(s => s.name);
    const failedTestSteps = failed.filter(s => stepKind(s.name) === "test").map(s => s.name);

    if (failedBuildSteps.length) {
        return {
            buildOk: false, failedBuildSteps, failedTestSteps,
            reason: `build step failed: ${failedBuildSteps.join(", ")}`,
        };
    }
    if (failedTestSteps.length) {
        return {
            buildOk: true, failedBuildSteps, failedTestSteps,
            reason: `test failures only (${failedTestSteps.join(", ")})`,
        };
    }
    if (failed.length) {
        // Noise-only failure. fetch-build-status.py flags this as a problem even
        // though NOISE_STEPS are documented as "never interesting"; replicated
        // here for parity rather than diverging silently.
        return {
            buildOk: false, failedBuildSteps, failedTestSteps,
            reason: `step failed: ${failed.map(s => s.name).join(", ")}`,
        };
    }
    // Red build with no red step — unusual; surface rather than swallow.
    return {
        buildOk: false, failedBuildSteps, failedTestSteps,
        reason: "build red but no failing step found",
    };
}
