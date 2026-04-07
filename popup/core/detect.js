import { cleanTrailingSlash, splitPath, tryUrl } from "../utils/url.js";
import { SERVICES } from "../services/index.js";

function normalizeIncomingUrl(rawInput) {
    const normalized = tryUrl(rawInput);
    if (!normalized) {
        return null;
    }

    const url = cleanTrailingSlash(normalized);
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (["x.com", "vxtwitter.com", "fixvx.com"].includes(host)) {
        url.hostname = "twitter.com";
    }

    if (host === "clips.twitch.tv" && parts[0]) {
        url.hostname = "twitch.tv";
        url.pathname = `/_/clip/${parts[0]}`;
        url.search = "";
    }

    if (host === "dai.ly" && parts[0]) {
        url.hostname = "dailymotion.com";
        url.pathname = `/video/${parts[0]}`;
        url.search = "";
    }

    if (host === "b23.tv" && parts[0]) {
        url.hostname = "bilibili.com";
        url.pathname = `/_shortLink/${parts[0]}`;
        url.search = "";
    }

    if (host === "fb.watch" && parts[0]) {
        url.hostname = "web.facebook.com";
        url.pathname = `/_shortLink/${parts[0]}`;
        url.search = "";
    }

    if (host === "pin.it" && parts[0]) {
        url.hostname = "pinterest.com";
        url.pathname = `/url_shortener/${parts[0]}`;
        url.search = "";
    }

    if (host === "v.redd.it" && parts[0]) {
        url.hostname = "www.reddit.com";
        url.pathname = `/video/${parts[0]}`;
        url.search = "";
    }

    if (["vkvideo.ru", "vk.ru"].includes(host)) {
        url.hostname = "vk.com";
    }

    if (host === "youtu.be" && parts[0]) {
        url.hostname = "youtube.com";
        url.pathname = "/watch";
        url.search = `?v=${encodeURIComponent(parts[0])}`;
    }

    return cleanTrailingSlash(url);
}

function detectPlatformByUrl(normalizedUrl) {
    for (const entry of SERVICES) {
        const match = entry.match?.(normalizedUrl);
        if (match) {
            return {
                service: entry.service,
                url: normalizedUrl,
                match,
            };
        }
    }

    return null;
}

export function detectPlatform(rawInput) {
    const normalizedUrl = normalizeIncomingUrl(rawInput);
    if (!normalizedUrl) {
        return {
            error: "link.invalid",
            message: "invalid url",
        };
    }

    const detected = detectPlatformByUrl(normalizedUrl);
    if (!detected) {
        return {
            error: "link.unsupported",
            message: "unsupported service or url format",
            normalizedUrl,
        };
    }

    return {
        ...detected,
        normalizedUrl,
    };
}
