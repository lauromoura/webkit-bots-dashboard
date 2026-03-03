export function buildbotBuilderURL(id) {
    return `https://build.webkit.org/#/builders/${id}`;
}

export function buildbotBuildURL(id, number) {
    return `https://build.webkit.org/#/builders/${id}/builds/${number}`;
}

export function builderPageURL(id) {
    return `./builder.html?builder=${id}`;
}
