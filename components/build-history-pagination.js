import { el } from "./_dom.js";

// Shared build-history paging controls used by the builder and worker detail
// pages. State is carried in the URL (?count=, ?page=) so it survives the
// 5-minute auto-refresh (a full location.reload()).

export const ALLOWED_COUNTS = [25, 50, 100, 200];
export const DEFAULT_COUNT = 100;

/**
 * Read paging state from a URLSearchParams. Count is clamped to ALLOWED_COUNTS
 * (default DEFAULT_COUNT); page is at least 1.
 *
 * @param {URLSearchParams} params
 * @returns {{ count: number, page: number, offset: number }}
 */
export function readPagingParams(params) {
    const rawCount = parseInt(params.get("count"), 10);
    const count = ALLOWED_COUNTS.includes(rawCount) ? rawCount : DEFAULT_COUNT;
    const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    const offset = (page - 1) * count;
    return { count, page, offset };
}

/**
 * Count dropdown shown next to the Build history heading. On change it navigates
 * to the same page at the new size, resetting to page 1 (the old offset is
 * meaningless at a different page size).
 *
 * @param {number} count - currently selected count
 * @param {(count: number, page: number) => string} hrefFor - builds a query string
 * @returns {HTMLLabelElement}
 */
export function renderCountSelector(count, hrefFor) {
    const select = el("select", { id: "buildCount", className: "build-count-select" },
        ALLOWED_COUNTS.map(n => {
            const opt = el("option", { value: String(n), textContent: String(n) });
            if (n === count) opt.selected = true;
            return opt;
        }));
    select.addEventListener("change", () => {
        location.search = hrefFor(parseInt(select.value, 10), 1);
    });
    return el("label", { className: "build-history-controls" }, ["Show ", select, " jobs"]);
}

/**
 * Prev/next controls + status line rendered below the table. Bounds render as
 * disabled spans rather than links.
 *
 * When `total` is a number, the total is trusted: it shows "Page X of N" and
 * disables Next past the last page. When `total` is null/undefined the total is
 * unknown (e.g. a worker's builds on an EWS builder pool, where build numbers
 * have gaps), so it shows "Page X" and enables Next only while the current page
 * came back full (shown === count).
 *
 * @param {Object} opts
 * @param {number} opts.count
 * @param {number} opts.page
 * @param {number} opts.shown - number of rows on the current page
 * @param {(count: number, page: number) => string} opts.hrefFor
 * @param {number} [opts.total] - total build count, if known
 * @returns {HTMLElement}
 */
export function renderPagination({ count, page, shown, hrefFor, total }) {
    const hasTotal = total != null;
    const totalPages = hasTotal ? Math.max(1, Math.ceil(total / count)) : null;
    const first = (hasTotal && total === 0) ? 0 : (page - 1) * count + 1;
    const last = (page - 1) * count + shown;

    const hasNext = hasTotal ? page < totalPages : shown >= count;

    const prev = page > 1
        ? el("a", { href: hrefFor(count, page - 1) }, ["‹ Prev"])
        : el("span", { className: "pagination-disabled" }, ["‹ Prev"]);
    const next = hasNext
        ? el("a", { href: hrefFor(count, page + 1) }, ["Next ›"])
        : el("span", { className: "pagination-disabled" }, ["Next ›"]);

    const statusText = hasTotal
        ? `Page ${page} of ${totalPages} — showing ${first}-${last} of ${total}`
        : `Page ${page} — showing ${first}-${last}`;
    const status = el("span", { className: "pagination-status" }, [statusText]);

    return el("nav", { className: "build-history-pagination" }, [prev, status, next]);
}
