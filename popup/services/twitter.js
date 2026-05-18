import { jsonRequest } from "../utils/http.js";
import { hostEnds, splitPath, extFromUrl } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "twitter";

function tokenFromId(id) {
    return ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, "");
}

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!(["x.com", "twitter.com", "vxtwitter.com", "fixvx.com"].some((h) => hostEnds(host, h)))) {
        return null;
    }

    const status = url.pathname.match(/^\/([^/]+)\/status\/(\d+)(?:\/(?:video|photo)\/(\d+))?/i);
    if (status) {
        return {
            user: status[1],
            id: status[2],
            index: status[3] ? Number(status[3]) : 1,
        };
    }

    if (parts[0] === "i" && parts[1] === "bookmarks" && url.searchParams.get("post_id")) {
        return {
            id: url.searchParams.get("post_id"),
            index: 1,
        };
    }

    return null;
}

export async function extract({ match, env }) {
    const id = match.id;
    const index = Math.max(1, Number(match.index || 1));

    const endpoint = new URL("https://cdn.syndication.twimg.com/tweet-result");
    endpoint.searchParams.set("id", id);
    endpoint.searchParams.set("token", tokenFromId(id));

    const tweet = await jsonRequest(endpoint, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    const media = tweet?.mediaDetails || [];
    if (!media.length) {
        throw new Error("fetch.empty");
    }

    const entry = media[Math.min(index - 1, media.length - 1)];
    if (!entry) {
        throw new Error("fetch.empty");
    }

    if (entry.type === "photo") {
        const imageUrl = `${entry.media_url_https}?name=4096x4096`;
        return mediaResult(service, `twitter_${id}`, {
            imageUrl,
            preferredImageExt: extFromUrl(imageUrl, "jpg"),
            fetchHeaders: { "referer": "https://twitter.com/" },
        });
    }

    const variants = (entry.video_info?.variants || [])
        .filter((variant) => variant.content_type === "video/mp4" && variant.url)
        .map((variant) => {
            const clean = new URL(variant.url);
            clean.searchParams.delete("tag");
            return {
                bitrate: Number(variant.bitrate || 0),
                url: clean.toString(),
            };
        });

    if (!variants.length) {
        throw new Error("fetch.empty");
    }

    const best = variants.reduce((a, b) => (a.bitrate > b.bitrate ? a : b));
    return mediaResult(service, `twitter_${id}`, {
        videoUrl: best.url,
        fetchHeaders: { "referer": "https://twitter.com/" },
    });
}
