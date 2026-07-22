/**
 * Buildbot result codes, shared by build- and step-level logic.
 *
 * Kept in their own module (rather than lib/api.js) so pure logic such as
 * lib/steps.js can use them without pulling in api.js, which reads browser
 * globals at module load.
 */
export const RESULT_CODES = {
    SUCCESS: 0,
    WARNINGS: 1,
    FAILURE: 2,
    SKIPPED: 3,
    EXCEPTION: 4,
    RETRY: 5,
    CANCELLED: 6,
};
