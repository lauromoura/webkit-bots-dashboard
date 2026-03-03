#!/usr/bin/env node
// Mock Buildbot server for local dashboard development.
// Zero npm dependencies — uses only Node.js built-ins.
//
// Usage:
//   node mock-server/server.js                # random seed, port 3000
//   node mock-server/server.js --port 8080    # custom port
//   node mock-server/server.js --seed 42      # deterministic data

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { BUILDERS, generateBuilds, queryBuilds } = require("./data.js");

// Parse CLI arguments
const args = process.argv.slice(2);
let port = 3000;
let seed = Math.floor(Math.random() * 0xFFFFFFFF);

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) {
        port = parseInt(args[++i], 10);
    } else if (args[i] === "--seed" && args[i + 1]) {
        seed = parseInt(args[++i], 10);
    }
}

// Generate all mock data at startup
console.log(`Generating mock data with seed ${seed}...`);
const buildsMap = generateBuilds(seed);
const builderById = new Map(BUILDERS.map(b => [b.builderid, b]));
console.log(`Generated builds for ${BUILDERS.length} builders.`);

// MIME types for static file serving
const MIME_TYPES = {
    ".html": "text/html",
    ".js":   "application/javascript",
    ".css":  "text/css",
    ".json": "application/json",
    ".png":  "image/png",
    ".svg":  "image/svg+xml",
    ".ico":  "image/x-icon",
};

// Project root is the parent of mock-server/
const STATIC_ROOT = path.resolve(__dirname, "..");

// Route patterns
const BUILDERS_LIST = /^\/api\/v2\/builders\/?$/;
const BUILDER_BY_ID = /^\/api\/v2\/builders\/(\d+)\/?$/;
const BUILDER_BUILDS = /^\/api\/v2\/builders\/(\d+)\/builds\/?$/;

const server = http.createServer((req, res) => {
    const parsed = url.parse(req.url, true);
    const pathname = parsed.pathname;
    const params = parsed.query;

    // API routes
    let match;

    if ((match = pathname.match(BUILDERS_LIST))) {
        const response = {
            builders: BUILDERS,
            meta: { total: BUILDERS.length },
        };
        sendJSON(res, response);
        return;
    }

    if ((match = pathname.match(BUILDER_BUILDS))) {
        const builderId = parseInt(match[1], 10);
        const builds = buildsMap.get(builderId);
        if (!builds) {
            sendJSON(res, { builds: [], meta: { total: 0 } });
            return;
        }
        const response = queryBuilds(builds, params);
        sendJSON(res, response);
        return;
    }

    if ((match = pathname.match(BUILDER_BY_ID))) {
        const builderId = parseInt(match[1], 10);
        const builder = builderById.get(builderId);
        if (!builder) {
            res.writeHead(404, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: "Builder not found" }));
            return;
        }
        sendJSON(res, { builders: [builder] });
        return;
    }

    // Static file serving
    serveStatic(req, res, pathname);
});

function sendJSON(res, data) {
    const body = JSON.stringify(data);
    res.writeHead(200, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
    });
    res.end(body);
}

function serveStatic(req, res, pathname) {
    // Default to index.html for directory paths
    if (pathname.endsWith("/")) pathname += "index.html";

    // Block directory traversal
    const safePath = path.normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, "");
    const filePath = path.join(STATIC_ROOT, safePath);

    // Ensure the resolved path is still under STATIC_ROOT
    if (!filePath.startsWith(STATIC_ROOT)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || "application/octet-stream";
        res.writeHead(200, { "Content-Type": contentType });
        res.end(data);
    });
}

server.listen(port, "localhost", () => {
    console.log(`Mock Buildbot server running at http://localhost:${port}/`);
    console.log(`Serving ${BUILDERS.length} builders with mock build data.`);
    console.log("Press Ctrl+C to stop.");
});
