export function ensureHttp(input) {
    const trimmed = String(input || "").trim();
    if (!trimmed) {
        return "";
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    return `https://${trimmed}`;
}

export function tryUrl(input) {
    try {
        return new URL(ensureHttp(input));
    } catch {
        return null;
    }
}

export function hostEquals(host, value) {
    return String(host || "").toLowerCase() === String(value || "").toLowerCase();
}

export function hostEnds(host, suffix) {
    const left = String(host || "").toLowerCase();
    const right = String(suffix || "").toLowerCase();
    return left === right || left.endsWith(`.${right}`);
}

export function splitPath(url) {
    return url.pathname.split("/").filter(Boolean);
}

export function cleanTrailingSlash(url) {
    if (url.pathname.endsWith("/")) {
        url.pathname = url.pathname.slice(0, -1);
    }
    return url;
}

export function extFromUrl(urlValue, fallbackExt = "bin") {
    try {
        const pathname = new URL(urlValue).pathname;
        const file = pathname.split("/").pop() || "";
        const dot = file.lastIndexOf(".");
        if (dot > -1 && dot < file.length - 1) {
            return file.slice(dot + 1).toLowerCase();
        }
    } catch {
        // no-op
    }

    return fallbackExt;
}
