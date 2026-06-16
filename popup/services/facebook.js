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
        // include cookies so a logged-in user can pull videos that sit behind
        // Facebook's login / consent wall (host_permissions cover facebook.com).
        credentials: "include",
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "accept-language": "en-US,en;q=0.5",
        },
    });

    if (!html) {
        throw new Error("fetch.fail");
    }

    // Facebook ships the media URL under several keys depending on surface.
    const pick = (re) => decodeQuotedValue(html.match(re)?.[1]);
    const videoUrl =
        pick(/"browser_native_hd_url":(".*?")/) ||
        pick(/"browser_native_sd_url":(".*?")/) ||
        pick(/"playable_url_quality_hd":(".*?")/) ||
        pick(/"playable_url":(".*?")/) ||
        pick(/"hd_src":(".*?")/) ||
        pick(/"sd_src":(".*?")/);

    if (!videoUrl) {
        // No media + a login form in the response means we were served the wall.
        if (/login|checkpoint|"loginInline"|You must log in/i.test(html)) {
            throw new Error("content.login_required");
        }
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `facebook_${match.id || match.shortLink || "video"}`, {
        videoUrl,
        fetchHeaders: { "referer": "https://www.facebook.com/" },
    });
}
