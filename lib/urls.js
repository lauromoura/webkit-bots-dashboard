export function buildbotBuilderURL(id) {
    return `https://build.webkit.org/#/builders/${id}`;
}

export function buildbotBuildURL(id, number) {
    return `https://build.webkit.org/#/builders/${id}/builds/${number}`;
}

export function buildbotBuildRequestURL(id) {
    return `https://build.webkit.org/#/buildrequests/${id}`;
}

export function builderPageURL(id) {
    return `./builder.html?builder=${id}`;
}

export function workerPageURL(id) {
    return `./worker.html?worker=${id}`;
}
