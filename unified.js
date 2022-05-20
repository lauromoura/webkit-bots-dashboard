import * as utils from "./modules/utils.js";

let API = "https://build.webkit.org/api/v2/builders/{}/builds?property=identifier&limit=300&order=-number&complete=1&results=0";


function buildLink(builder, job) {
    return `https://build.webkit.org/#/builders/${builder}/builds/${job}`;
}

window.onload = async () => {
    // Fetch unified results
    let unified = await fetch(API.replace("{}", "6"));
    if (!unified.ok) {
        alert("Failed to fetch unified build data. Please refresh");
        return;
    }
    // Fetch non-unified results

    let nonunified = await fetch(API.replace("{}", "133"));
    if (!nonunified.ok) {
        alert("Failed to fetch non-unified build data. Please refresh");
    }
    // Transform data

    let unified_data = await unified.json();
    let nonunified_data = await nonunified.json();

    let unified_results = {};
    // For stats later
    let durations = []
    for (const build of unified_data.builds) {
        let revision = build.properties.identifier[0];
        let duration_seconds = build.complete_at - build.started_at;
        let current = {}
        current.duration = duration_seconds;
        current.job = build.number;
        unified_results[revision] = current;
    }

    let common_results = [];
    let non_unified_durations = [];
    let unified_durations = [];
    for (const build of nonunified_data.builds) {
        let revision = build.properties.identifier[0];
        let duration_seconds = build.complete_at - build.started_at;
        if (revision in unified_results) {
            let current = {}
            current.started = build.started_at;
            current.nonunified_duration = duration_seconds;
            non_unified_durations.push(duration_seconds);
            current.nonunified_job = build.number;
            current.unified_duration = unified_results[revision].duration;
            unified_durations.push(unified_results[revision].duration);
            current.unified_job = unified_results[revision].job;
            current.gap = current.nonunified_duration - current.unified_duration;
            current.revision = revision;
            common_results.push(current);
        }
    }
    const target = document.getElementById("buildsTable");
    const template = document.getElementById("resultTemplate");
    for (const result of common_results) {
        let clone = template.content.firstElementChild.cloneNode(true);

        let started_cell = clone.querySelector(".started");
        let started = new Date(result.started * 1000);
        started_cell.innerText = started.toLocaleString(started);

        let revision_cell = clone.querySelector(".revision");
        let revision = result.revision;
        let revisionURL = `https://commits.webkit.org/${revision}`;
        let revisionLink = utils.createLinkFor(revisionURL, revision);
        revision_cell.appendChild(revisionLink);

        let nonunified_result_cell = clone.querySelector(".nonunified");
        let nonunified_duration = utils.formatSeconds(result.nonunified_duration);
        let nonunifiedURL = buildLink(133, result.nonunified_job);
        let nonunifiedLink = utils.createLinkFor(nonunifiedURL, nonunified_duration);
        nonunified_result_cell.appendChild(nonunifiedLink)

        let unified_result_cell = clone.querySelector(".unified");
        let unified_duration = utils.formatSeconds(result.unified_duration);
        let unifiedURL = buildLink(6, result.unified_job);
        let unifiedLink = utils.createLinkFor(unifiedURL, unified_duration);
        unified_result_cell.appendChild(unifiedLink);

        let gap_cell = clone.querySelector(".gap");
        let gap = result.gap;
        let prefix = "";
        if (gap < 0) {
            gap = - gap;
            prefix = "-";
        }
        gap_cell.innerText = prefix + utils.formatSeconds(gap);

        let mult_cell = clone.querySelector(".comparison");
        let mult = result.nonunified_duration / result.unified_duration;
        mult = mult.toFixed(2);
        if (mult > 1) {
            mult_cell.classList.add("slower");
        } else if (mult < 1) {
            mult_cell.classList.add("faster");
        }
        mult_cell.innerText = mult.toString() + "x";

        target.appendChild(clone);
    }

    //Stats
    let numBuildsNonUnified = document.getElementById("numBuildsNonUnified");
    let numBuildsUnified = document.getElementById("numBuildsUnified");
    numBuildsUnified.innerText = `${unified_durations.length}`;
    numBuildsNonUnified.innerText = `${non_unified_durations.length}`;

    let averageUnifiedCell = document.getElementById("averageUnified");
    let averageNonUnifiedCell = document.getElementById("averageNonUnified");

    let averageUnified = unified_durations.reduce((a,b) => a + b, 0)/unified_durations.length;
    let averageNonUnified = non_unified_durations.reduce((a,b) => a + b, 0)/non_unified_durations.length;

    averageUnifiedCell.innerText = `${utils.formatSeconds(averageUnified)}`;
    averageNonUnifiedCell.innerText = `${utils.formatSeconds(averageNonUnified)}`;

    unified_durations = unified_durations.sort((a,b) => a - b);
    non_unified_durations = non_unified_durations.sort((a,b) => a - b);

    let pct25UnifiedCell = document.getElementById("pct25Unified");
    let pct25NonUnifiedCell = document.getElementById("pct25NonUnified");

    let rank = Math.ceil(25 / 100 * unified_durations.length);
    pct25UnifiedCell.innerText = `${utils.formatSeconds(unified_durations[rank])}`;
    pct25NonUnifiedCell.innerText = `${utils.formatSeconds(non_unified_durations[rank])}`;

    let pct50UnifiedCell = document.getElementById("pct50Unified");
    let pct50NonUnifiedCell = document.getElementById("pct50NonUnified");
    rank = Math.ceil(50 / 100 * unified_durations.length);
    pct50UnifiedCell.innerText = `${utils.formatSeconds(unified_durations[rank])}`;
    pct50NonUnifiedCell.innerText = `${utils.formatSeconds(non_unified_durations[rank])}`;

    let pct75UnifiedCell = document.getElementById("pct75Unified");
    let pct75NonUnifiedCell = document.getElementById("pct75NonUnified");
    rank = Math.ceil(75 / 100 * unified_durations.length);
    pct75UnifiedCell.innerText = `${utils.formatSeconds(unified_durations[rank])}`;
    pct75NonUnifiedCell.innerText = `${utils.formatSeconds(non_unified_durations[rank])}`;

    let pct90UnifiedCell = document.getElementById("pct90Unified");
    let pct90NonUnifiedCell = document.getElementById("pct90NonUnified");
    rank = Math.ceil(90 / 100 * unified_durations.length);
    pct90UnifiedCell.innerText = `${utils.formatSeconds(unified_durations[rank])}`;
    pct90NonUnifiedCell.innerText = `${utils.formatSeconds(non_unified_durations[rank])}`;
};
