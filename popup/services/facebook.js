import { followUrl, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { decodeQuotedValue, mediaResult } from "../utils/result.js";

export const service = "facebook";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!(hostEnds(host, "facebook.com") || host === "fb.watch")) {
        return null;
    }

    if (parts[0] === "_shortLink" && parts[1]) {
        return { shortLink: parts[1] };
    }

    if (parts[0] === "reel" && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "share" && parts[1] && parts[2]) {
        return { shareType: parts[1], id: parts[2] };
    }

    if (parts[1] === "videos") {
        return { id: parts[parts.length - 1] };
    }

    return null;
}

export async function extract({ match, env }) {
    let target = `https://www.facebook.com/reel/${match.id || ""}`;

    if (match.shareType && match.id) {
        target = `https://www.facebook.com/share/${match.shareType}/${match.id}`;
    }

    if (match.shortLink) {
        const redirected = await followUrl(`https://fb.watch/${match.shortLink}`, {
            "user-agent": env.XENON_BROWSER_UA,
        });
        if (redirected) {
            target = redirected.toString();
        }
    }

    const html = await textRequest(target, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
        },
    });

    const hd = html?.match(/"browser_native_hd_url":(".*?")/);
    const sd = html?.match(/"browser_native_sd_url":(".*?")/);

    const videoUrl = decodeQuotedValue(hd?.[1]) || decodeQuotedValue(sd?.[1]);
    if (!videoUrl) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `facebook_${match.id || match.shortLink || "video"}`, {
        videoUrl,
    });
}
