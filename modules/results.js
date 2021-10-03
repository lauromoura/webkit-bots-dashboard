export async function WPEReleaseLayout() {
    return fetch("https://results.webkit.org/api/results/layout-tests?platform=WPE&style=release").then(
        response => {
            console.log("Fetch from server worked");
            return response.json();
        },
        _ => {
            console.log("Fetch from server failed. Fallback to local file");
            return fetch("./layout-tests-wpe-release.json").then(response => response.json());
        }
    )
}

export async function WPEDebugLayout() {
    return fetch("https://results.webkit.org/api/results/layout-tests?platform=WPE&style=debug").then(
        response => {
            console.log("Fetch from server worked");
            return response.json();
        },
        _ => {
            console.log("Fetch from server failed. Fallback to local file");
            return fetch("./layout-tests-wpe-debug.json").then(response => response.json());
        }
    )
}