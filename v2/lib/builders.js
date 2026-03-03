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

export function isRetired(builder) {
    return !builder.masterids || builder.masterids.length === 0;
}

export function isJSCOnly(builder) {
    return builder.tags.includes("JSCOnly");
}

export function isJSCOnlyLinux(builder) {
    return isJSCOnly(builder) && builder.tags.includes("Linux");
}

export function isRelevantPlatform(builder) {
    return isWPE(builder) || isGTK(builder) || isJSCOnlyLinux(builder);
}

export function isTier1(builder) {
    if (isNonUnified(builder))
        return false;
    if (isStable(builder))
        return false;
    if (isPerf(builder))
        return false;
    if (!isBuilder(builder))
        return false;
    return isWPE(builder) || isGTK(builder);
}

export function isTier2(builder) {
    if (!isRelease(builder))
        return false;
    if (!isTester(builder))
        return false;
    if (isNonUnified(builder))
        return false;
    if (isGTK4(builder) || isWayland(builder))
        return false;
    if (isStable(builder))
        return false;
    if (isPerf(builder))
        return false;
    if (isWebDriver(builder))
        return false;
    return isWPE(builder) || isGTK(builder);
}

export function isTier4(builder) {
    if (!isBuilder(builder))
        return false;
    if (!isStable(builder))
        return false;
    return isWPE(builder) || isGTK(builder);
}

export function isLowTier(builder) {
    if (!(isWPE(builder) || isGTK(builder)))
        return false;
    return !(isTier1(builder) || isTier2(builder) || isTier4(builder));
}

export function classifyByTier(builders) {
    const tiers = { tier1: [], tier2: [], tier4: [], tier5: [], jsconly: [], retired: [] };
    for (const builder of builders) {
        if (isRetired(builder)) {
            if (isRelevantPlatform(builder))
                tiers.retired.push(builder);
        } else if (isTier1(builder))
            tiers.tier1.push(builder);
        else if (isTier2(builder))
            tiers.tier2.push(builder);
        else if (isTier4(builder))
            tiers.tier4.push(builder);
        else if (isLowTier(builder))
            tiers.tier5.push(builder);
        else if (isJSCOnlyLinux(builder))
            tiers.jsconly.push(builder);
    }
    return tiers;
}

export function findWPEReleaseTester(builders) {
    return builders.find(b => isWPE(b) && isTier2(b));
}

export function findGTKReleaseTester(builders) {
    return builders.find(b => isGTK(b) && isTier2(b) && !isSkipFailing(b));
}
