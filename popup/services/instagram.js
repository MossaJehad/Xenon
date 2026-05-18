import { followUrl, jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { decodeQuotedValue, mediaResult } from "../utils/result.js";

export const service = "instagram";

const FALLBACK_APP_ID = "936619743392459";
const FALLBACK_MOBILE_UA = "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!(hostEnds(host, "instagram.com") || hostEnds(host, "ddinstagram.com"))) {
        return null;
    }

    if (["p", "tv", "reel", "reels"].includes(parts[0]) && parts[1]) {
        return { postId: parts[1] };
    }

    if (parts[0] === "stories" && parts[1] && parts[2]) {
        return {
            username: parts[1],
            storyId: parts[2],
        };
    }

    if (parts[0] === "share") {
        const shareId = parts[parts.length - 1];
        if (shareId) {
            return { shareId };
        }
    }

    if (parts.length >= 3 && ["p", "reel"].includes(parts[1])) {
        return { postId: parts[2] };
    }

    return null;
}

function mobileHeaders(env) {
    const ua = env.XENON_IG_MOBILE_UA || FALLBACK_MOBILE_UA;

    return {
        "x-ig-app-locale": "en_US",
        "x-ig-device-locale": "en_US",
        "x-ig-mapped-locale": "en_US",
        "user-agent": ua,
        "accept-language": "en-US",
        "x-fb-http-engine": "Liger",
        "x-fb-client-ip": "True",
        "x-fb-server-cluster": "True",
    };
}

async function getMediaId(postId, env) {
    const endpoint = new URL("https://i.instagram.com/api/v1/oembed/");
    endpoint.searchParams.set("url", `https://www.instagram.com/p/${postId}/`);

    const data = await jsonRequest(endpoint, {
        headers: {
            ...mobileHeaders(env),
            "x-ig-app-id": env.XENON_IG_APP_ID || FALLBACK_APP_ID,
        },
    });

    return data?.media_id || "";
}

const IG_FETCH_HEADERS = { fetchHeaders: { "referer": "https://www.instagram.com/" } };

function pickMedia(item, baseId) {
    if (!item) {
        return null;
    }

    if (item.carousel_media?.length) {
        const first = item.carousel_media.find((entry) => entry?.video_versions?.length || entry?.image_versions2?.candidates?.length);
        if (!first) {
            return null;
        }

        if (first.video_versions?.length) {
            const best = first.video_versions.reduce((a, b) => (Number(a.width) * Number(a.height) >= Number(b.width) * Number(b.height) ? a : b));
            return mediaResult(service, `instagram_${baseId}`, { videoUrl: best.url, ...IG_FETCH_HEADERS });
        }

        if (first.image_versions2?.candidates?.length) {
            return mediaResult(service, `instagram_${baseId}`, {
                imageUrl: first.image_versions2.candidates[0].url,
                preferredImageExt: "jpg",
                ...IG_FETCH_HEADERS,
            });
        }
    }

    if (item.video_versions?.length) {
        const best = item.video_versions.reduce((a, b) => (Number(a.width) * Number(a.height) >= Number(b.width) * Number(b.height) ? a : b));
        return mediaResult(service, `instagram_${baseId}`, { videoUrl: best.url, ...IG_FETCH_HEADERS });
    }

    if (item.image_versions2?.candidates?.length) {
        return mediaResult(service, `instagram_${baseId}`, {
            imageUrl: item.image_versions2.candidates[0].url,
            preferredImageExt: "jpg",
            ...IG_FETCH_HEADERS,
        });
    }

    return null;
}

export async function extract({ match, env, detectPlatform }) {
    const original = { ...match };
    let { postId, shareId } = match;

    if (shareId) {
        const resolved = await followUrl(`https://www.instagram.com/share/${shareId}/`, {
            "user-agent": "curl/7.88.1",
        });

        if (!resolved) {
            throw new Error("fetch.short_link");
        }

        const rematch = detectPlatform(resolved.toString());
        if (rematch.error || rematch.service !== service) {
            throw new Error("fetch.short_link");
        }

        postId = rematch.match.postId;
    }

    if (!postId) {
        if (original.storyId && original.username) {
            throw new Error("content.post.private");
        }

        throw new Error("fetch.empty");
    }

    const mediaId = await getMediaId(postId, env);
    if (mediaId) {
        const info = await jsonRequest(`https://i.instagram.com/api/v1/media/${mediaId}/info/`, {
            headers: {
                ...mobileHeaders(env),
                "x-ig-app-id": env.XENON_IG_APP_ID || FALLBACK_APP_ID,
            },
        });

        const picked = pickMedia(info?.items?.[0], postId);
        if (picked) {
            return picked;
        }
    }

    const html = await textRequest(`https://www.instagram.com/p/${postId}/embed/captioned/`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    if (!html) {
        throw new Error("fetch.fail");
    }

    const videoRaw = html.match(/"video_url":"([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1];
    const imageRaw = html.match(/"display_url":"([^"\\]*(?:\\.[^"\\]*)*)"/)?.[1];

    const videoUrl = decodeQuotedValue(videoRaw ? `"${videoRaw}"` : "");
    if (videoUrl) {
        return mediaResult(service, `instagram_${postId}`, { videoUrl, ...IG_FETCH_HEADERS });
    }

    const imageUrl = decodeQuotedValue(imageRaw ? `"${imageRaw}"` : "");
    if (imageUrl) {
        return mediaResult(service, `instagram_${postId}`, {
            imageUrl,
            preferredImageExt: "jpg",
            ...IG_FETCH_HEADERS,
        });
    }

    throw new Error("fetch.empty");
}
