import { el } from "./_dom.js";

const NAV_LINKS = [
    { href: "./index.html",         label: "Index", bold: true },
    { href: "./results-stats.html", label: "Results Stats" },
    { href: "./job-duration.html",  label: "Job Duration" },
    { href: "./queue.html",         label: "Queues overview" },
    { href: "./ews-queue.html",     label: "EWS Queues" },
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
