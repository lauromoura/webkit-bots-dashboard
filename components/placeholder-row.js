/**
 * Turn an empty builder row (rendered without data: name and links only) into
 * a placeholder showing `status` ("loading…", "Failed to load") in its
 * current-build cell. Used to keep table rows in a fixed order while each
 * row's data loads independently.
 *
 * @param {HTMLTableRowElement} row - e.g. renderBuilderRow(builder)
 * @param {string} status
 * @returns {HTMLTableRowElement} the same row
 */
export function renderPlaceholderRow(row, status) {
    row.classList.add("placeholder-row");
    const cell = row.querySelector("td.currentBuild");
    if (cell)
        cell.textContent = status;
    return row;
}
