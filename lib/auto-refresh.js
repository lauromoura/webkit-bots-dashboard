const REFRESH_INTERVAL_MS = 120_000; // 2 minutes

let timerId = null;
let scheduledAt = 0;

function scheduleRefresh(delayMs = REFRESH_INTERVAL_MS) {
    if (timerId) return;
    scheduledAt = Date.now();
    timerId = setTimeout(() => location.reload(), delayMs);
}

function cancelRefresh() {
    if (timerId) {
        clearTimeout(timerId);
        timerId = null;
    }
}

export function startAutoRefresh() {
    if (!document.hidden) {
        scheduleRefresh();
    }
    document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
            cancelRefresh();
        } else {
            const elapsed = Date.now() - scheduledAt;
            if (elapsed >= REFRESH_INTERVAL_MS) {
                location.reload();
            } else {
                scheduleRefresh(REFRESH_INTERVAL_MS - elapsed);
            }
        }
    });
}
