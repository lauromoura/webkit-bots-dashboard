export function urlFor(path) {
    const BASE_URL = "https://build.webkit.org/api/v2/";
    const URL_SUFFIX = "";
    return BASE_URL + path + URL_SUFFIX;
}

export function urlForBuilder(path) {
    return `https://build.webkit.org/#/builders/${path}`;
}

export function urlForJob(builderId, jobNumber) {
    return `${urlForBuilder(builderId)}/builds/${jobNumber}`
}

export async function getLastBuild(builderId, number) {
    const path = urlFor(`builders/${builderId}/builds?order=-number&limit=${number+1}`);
    console.log("Fetching path: " + path);
    const response = await fetch(path);
    return response.json().then(data => {
        return data;
    });
}

export function isBuilder(builder) {
    return builder.tags.includes("Build");
}

export function isTester(builder) {
    return builder.tags.includes("Tests");
}

export function isPackaging(builder) {
    return builder.tags.includes("Packaging");
}

export function isWPE(builder) {
    return builder.tags.includes("WPE");
}

export function isGTK(builder) {
    return builder.tags.includes("GTK");
}

export function isRelease(builder) {
    return builder.tags.includes("Release");
}

export function isDebug(builder) {
    return builder.tags.includes("Debug");
}

export function isStable(builder) {
    return builder.tags.includes("Ubuntu") || builder.tags.includes("Debian");
}

export function isNonUnified(builder) {
    // buildbot parses "Non-Unified" to "Non" and "Unified" tags
    return builder.tags.includes("Unified");
}

export function isPerf(builder) {
    return builder.tags.includes("Perf");
}

export function isWebDriver(builder) {
    return builder.tags.includes("WebDriver");
}

export function isJSTest(builder) {
    return builder.tags.includes("JS");
}

export function isGTK4(builder) {
    return builder.tags.includes("GTK4");
}

export function isWayland(builder) {
    return builder.tags.includes("Wayland");
}

export function isSkipFailing(builder) {
    return builder.tags.includes("Skip") && builder.tags.includes("Failing");
}

export function isTier1(builder) {
    if (isNonUnified(builder))
        return false;

    if (isStable(builder))
        return false;

    if (isPerf(builder))
        return false;

    if (!isRelease(builder))
        return false;

    if (!isBuilder(builder))
        return false

    return isWPE(builder) || isGTK(builder);
}

export function isTier2(builder) {

    if (!isRelease(builder))
        return false;

    if (!isTester(builder))
        return false

    if (isNonUnified(builder))
        return false;

    if (isGTK4(builder) || isWayland(builder)) {
        return false;
    }

    if (isStable(builder))
        return false;

    if (isPerf(builder))
        return false;

    if (isWebDriver(builder))
        return false;

    if (isJSTest(builder))
        return false;


    return isWPE(builder) || isGTK(builder);
}

export function isTier3(builder) {
    if (isNonUnified(builder))
        return false;

    if (isStable(builder))
        return false;

    if (isPerf(builder))
        return false;

    if (!isDebug(builder))
        return false;

    if (!isBuilder(builder))
        return false

    return isWPE(builder) || isGTK(builder);
}

export function isTier5(builder) {
    if (!isBuilder(builder))
        return false;

    if (!isStable(builder))
        return false;

    return isWPE(builder) || isGTK(builder);
}

export function isLowTier(builder) {
    if (!(isWPE(builder) || isGTK(builder)))
        return false;

    return !(isTier1(builder) || isTier2(builder) || isTier3(builder) || isTier5(builder));
}

export function createLinkFor(href, text) {
    let link = document.createElement("a");
    link.setAttribute("href", href);
    link.textContent = text;
    return link;
}

export function createLinkForJob(builderId, jobNumber, text) {
    let link = document.createElement("a");
    link.setAttribute("href", urlForJob(builderId, jobNumber));
    link.textContent = text;
    return link;
}

export function formatRelativeDate(from, to, suffix, only_days) {
    let ret = '';
    let distance = to - from;

    // FIXME replace with some lib?
    let day_div = 3600 * 24;
    let days = Math.floor(distance / day_div);
    let remainder = distance % day_div;

    if (days > 0) {
        if (days > 1)
            ret += `${days} days `;
        else
            ret += `${days} day `;

        if (only_days) {
            return ret + `${suffix}`;
        }

    }

    let hour_div = 3600;
    let hours = Math.floor(remainder / hour_div);
    remainder = remainder % hour_div;

    let minute_div = 60;
    let minutes = Math.floor(remainder / minute_div);
    remainder = remainder % minute_div;

    let seconds = remainder;

    let n = function(arg) {
        return `${arg}`.padStart(2, '0');
    }

    if (hours > 0)
        ret += ` ${n(hours)}h`
    return  ret + ` ${n(minutes)}m ${n(seconds)}s${suffix}`;
}


export function formatRelativeDateFromNow(target, suffix=" ago", only_days=false) {
    let ret = '';
    let now = new Date();
    let utcSecondsSinceEpoch = Math.round(now.getTime() / 1000);

    return formatRelativeDate(target, utcSecondsSinceEpoch, suffix, only_days);
}

export function formatSeconds(seconds) {
    let t = new Date(null);
    t.setSeconds(seconds);
    return t.toISOString().substr(11, 8);
}
