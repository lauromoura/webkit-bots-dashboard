import { siteBase } from "./config.js";

// Links into the post-commit Buildbot web UI.

export function buildbotBuilderURL(id) {
    return `${siteBase("postCommit")}#/builders/${id}`;
}

export function buildbotBuildURL(id, number) {
    return `${siteBase("postCommit")}#/builders/${id}/builds/${number}`;
}

export function buildbotBuildRequestURL(id) {
    return `${siteBase("postCommit")}#/buildrequests/${id}`;
}

export function builderPageURL(id) {
    return `./builder.html?builder=${id}`;
}

export function workerPageURL(id) {
    return `./worker.html?worker=${id}`;
}
