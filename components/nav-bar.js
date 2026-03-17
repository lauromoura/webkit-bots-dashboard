import { el } from "./_dom.js";

const NAV_LINKS = [
    { href: "./index.html",         label: "Index", bold: true },
    { href: "./results-stats.html", label: "Results Stats" },
    { href: "./job-duration.html",  label: "Job Duration" },
    { href: "./queue.html",         label: "Queues overview" },
    { href: "./ews-queue.html",     label: "EWS Queues" },
    { href: "./pass-ratio.html",     label: "Pass Ratio" },
    { href: "./daily-trend.html",    label: "Daily Trend" },
];

/**
 * Render the navigation bar.
 *
 * @returns {HTMLElement}
 */
export function renderNavBar() {
    const currentPath = location.pathname.replace(/\/$/, "/index.html");
    const links = NAV_LINKS.map(({ href, label, bold }) => {
        const isActive = currentPath.endsWith(href.replace("./", "/"));
        const classes = "linkButton" + (isActive ? " active" : "");
        const content = bold ? el("b", null, [label]) : label;
        return el("a", { className: classes, href }, [content]);
    });
    return el("nav", null, links);
}
