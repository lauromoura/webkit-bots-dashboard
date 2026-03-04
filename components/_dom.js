/**
 * Concise DOM element creation helper.
 *
 * @param {string} tag - HTML tag name
 * @param {Object|null} attrs - attribute key/value pairs (className, textContent,
 *     style, and event handlers like onclick are handled specially; everything
 *     else is set via setAttribute)
 * @param {Array<Node|string>} children - child nodes or text strings
 * @returns {HTMLElement}
 */
export function el(tag, attrs, children) {
    const node = document.createElement(tag);

    if (attrs) {
        for (const [key, value] of Object.entries(attrs)) {
            if (key === "className") {
                node.className = value;
            } else if (key === "textContent") {
                node.textContent = value;
            } else if (key === "style" && typeof value === "object") {
                Object.assign(node.style, value);
            } else if (key.startsWith("on")) {
                node.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                node.setAttribute(key, value);
            }
        }
    }

    if (children) {
        for (const child of children) {
            if (typeof child === "string") {
                node.appendChild(document.createTextNode(child));
            } else if (child) {
                node.appendChild(child);
            }
        }
    }

    return node;
}
