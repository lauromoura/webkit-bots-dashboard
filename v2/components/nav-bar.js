import { el } from "./_dom.js";

const NAV_LINKS = [
    { href: "../all-builders.html", label: "All builders", bold: true },
    { href: "../charts.html",       label: "Test run charts" },
    { href: "../unified.html",      label: "Unified build timing" },
    { href: "./queue.html",         label: "Queue status" },
];

/**
 * Render the navigation bar.
 *
 * @returns {HTMLElement}
 */
export function renderNavBar() {
    const links = NAV_LINKS.map(({ href, label, bold }) => {
        const content = bold ? el("b", null, [label]) : label;
        return el("a", { className: "linkButton", href }, [content]);
    });
    return el("nav", null, links);
}
