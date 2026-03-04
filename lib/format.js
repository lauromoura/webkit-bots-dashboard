export function formatRelativeDate(from, to, suffix, onlyDays) {
    let ret = "";
    const distance = to - from;

    const dayDiv = 3600 * 24;
    const days = Math.floor(distance / dayDiv);
    let remainder = distance % dayDiv;

    if (days > 0) {
        ret += days > 1 ? `${days} days ` : `${days} day `;
        if (onlyDays)
            return ret + suffix;
    }

    const hourDiv = 3600;
    const hours = Math.floor(remainder / hourDiv);
    remainder = remainder % hourDiv;

    const minuteDiv = 60;
    const minutes = Math.floor(remainder / minuteDiv);
    remainder = remainder % minuteDiv;

    const seconds = remainder;

    const n = (v) => `${v}`.padStart(2, "0");

    if (hours > 0)
        ret += ` ${n(hours)}h`;
    return ret + ` ${n(minutes)}m ${n(seconds)}s${suffix}`;
}

export function formatRelativeDateFromNow(target, suffix = " ago", onlyDays = false) {
    const now = new Date();
    const utcSecondsSinceEpoch = Math.round(now.getTime() / 1000);
    return formatRelativeDate(target, utcSecondsSinceEpoch, suffix, onlyDays);
}

export function formatSeconds(seconds) {
    const t = new Date(null);
    t.setSeconds(seconds);
    return t.toISOString().substr(11, 8);
}
