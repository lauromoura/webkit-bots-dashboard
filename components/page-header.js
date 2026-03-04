import { el } from "./_dom.js";
import { renderNavBar } from "./nav-bar.js";

/**
 * Render the page header: title, sync timestamp, and navigation bar.
 *
 * @param {string} title
 * @returns {DocumentFragment}
 */
export function renderPageHeader(title) {
    const fragment = document.createDocumentFragment();

    fragment.appendChild(el("div", { id: "header" }, [
        el("h1", null, [title]),
    ]));

    const timestampSpan = el("span", { id: "timestamp", textContent: new Date().toString() });
    fragment.appendChild(el("div", { id: "metadata" }, [
        "Last sync: ",
        timestampSpan,
    ]));

    fragment.appendChild(el("br"));
    fragment.appendChild(renderNavBar());

    return fragment;
}
