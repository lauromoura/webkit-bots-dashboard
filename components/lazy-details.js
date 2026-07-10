import { el } from "./_dom.js";

/**
 * A collapsed <details> whose content is built — and therefore fetched — only
 * the first time it is opened. Keeps low-priority builder groups off the initial
 * page load: their per-builder API calls fire on expand, not on render.
 *
 * @param {Object} opts
 * @param {string} opts.id - id for the <details> (or the empty-note element)
 * @param {string} opts.title - summary heading text; a "(count)" is appended
 * @param {number} opts.count - number of items behind the toggle
 * @param {function(function():void):Node} opts.build - builds and returns the
 *     content node; receives an `onLoaded` callback to call once its async
 *     loading has settled, which clears the pending indicator
 * @param {string} [opts.emptyLabel] - note rendered instead of a toggle when
 *     count is 0 (defaults to a short "No <title> right now." line)
 * @returns {HTMLElement}
 */
export function lazyDetails({ id, title, count, build, emptyLabel }) {
    if (!count) {
        const shortTitle = title.split(" - ")[0];
        return el("p", { id, className: "lazy-empty" },
            [emptyLabel || `No ${shortTitle} right now.`]);
    }

    const status = el("span", { className: "lazy-status" });
    const summary = el("summary", null, [
        el("h2", { style: "display:inline" }, [`${title} (${count})`]),
        status,
    ]);

    let loaded = false;
    const details = el("details", {
        id,
        ontoggle: () => {
            if (!details.open || loaded)
                return;
            loaded = true;
            status.textContent = " loading…";
            details.appendChild(build(() => { status.textContent = ""; }));
        },
    }, [summary]);

    return details;
}
