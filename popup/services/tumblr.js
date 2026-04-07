import { followUrl, jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, hostEquals, splitPath, extFromUrl } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "tumblr";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);
    const hostParts = host.split(".");
    const subdomain = hostParts.length > 2 ? hostParts[0] : "";

    if (hostEquals(host, "tmblr.co") && parts[0]) {
        return { short: parts[0] };
    }

    if (!hostEnds(host, "tumblr.com")) {
        return null;
    }

    if (parts[0] === "post" && parts[1]) {
        return {
            id: parts[1],
            user: ["www", "at"].includes(subdomain) ? undefined : subdomain,
        };
    }

    if (parts[0] === "blog" && parts[1] === "view" && parts[2] && parts[3]) {
        return {
            user: parts[2],
            id: parts[3],
        };
    }

    if (parts[0] && /^\d+$/.test(parts[1] || "")) {
        return {
            user: parts[0],
            id: parts[1],
        };
    }

    return null;
}

function cleanup(value) {
    return String(value || "")
        .replaceAll("&amp;", "&")
        .replaceAll("\\/", "/")
        .replaceAll("\\u002F", "/");
}

function pickVideoFromHtml(html) {
    const og = html.match(/property="og:video:secure_url" content="([^"]+)"/);
    if (og?.[1]) {
        return og[1];
    }

    const mediaPattern = new RegExp('"media_url":"(https?:\\\\/\\\\/[^"\\\\]+\\\\.mp4[^"\\\\]*)"');
    const media = html.match(mediaPattern);
    if (media?.[1]) {
        return media[1];
    }

    const fallbackPattern = new RegExp('"url":"(https?:\\\\/\\\\/[^"\\\\]+tumblr[^"\\\\]+\\\\.mp4[^"\\\\]*)"');
    const fallback = html.match(fallbackPattern);
    return fallback?.[1] || "";
}

function pickImageFromHtml(html) {
    const og = html.match(/property="og:image" content="([^"]+)"/);
    if (og?.[1]) {
        return og[1];
    }

    const imagePattern = new RegExp('"media_url":"(https?:\\\\/\\\\/[^"\\\\]+\\\\.(?:jpg|jpeg|png|gif)[^"\\\\]*)"');
    const media = html.match(imagePattern);
    return media?.[1] || "";
}

async function extractByApi(id, user, apiKey) {
    const endpoint = new URL(
        `https://api-http2.tumblr.com/v2/blog/${user}.tumblr.com/posts/${id}/permalink`,
    );

    endpoint.searchParams.set("api_key", apiKey);
    endpoint.searchParams.set("fields[blogs]", "uuid,name,url,title");

    const data = await jsonRequest(endpoint, {
        headers: {
            "user-agent": "Tumblr/iPhone/33.3/333010/17.3.1/tumblr",
            "x-version": "iPhone/33.3/333010/17.3.1/tumblr",
        },
    });

    const element = data?.response?.timeline?.elements?.[0];
    if (!element) {
        return null;
    }

    const content = [
        ...(element.content || []),
        ...(element.trail || []).flatMap((entry) => entry.content || []),
    ];

    const audio = content.find((entry) => entry.type === "audio" && entry.provider === "tumblr");
    if (audio?.media?.url) {
        return mediaResult(service, `tumblr_${id}`, {
            audioUrl: audio.media.url,
            preferredAudioExt: extFromUrl(audio.media.url, "mp3"),
        });
    }

    const video = content.find((entry) => entry.type === "video" && entry.provider === "tumblr");
    if (video?.media?.url) {
        return mediaResult(service, `tumblr_${id}`, {
            videoUrl: video.media.url,
        });
    }

    return null;
}

async function extractByHtml(url) {
    const html = await textRequest(url);
    if (!html) {
        throw new Error("fetch.empty");
    }

    const video = cleanup(pickVideoFromHtml(html));
    if (video) {
        return mediaResult(service, "tumblr_post", {
            videoUrl: video,
        });
    }

    const image = cleanup(pickImageFromHtml(html));
    if (!image) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, "tumblr_post", {
        imageUrl: image,
        preferredImageExt: image.endsWith(".gif") ? "gif" : "jpg",
    });
}

export async function extract({ match, originalUrl, env, detectPlatform }) {
    let params = { ...match };

    if (params.short) {
        const redirected = await followUrl(`https://tmblr.co/${params.short}`);
        if (!redirected) {
            throw new Error("fetch.short_link");
        }

        const rematch = detectPlatform(redirected.toString());
        if (rematch.error || rematch.service !== service) {
            return extractByHtml(redirected.toString());
        }

        params = { ...params, ...rematch.match };
    }

    if (params.id && params.user && env.XENON_TUMBLR_API_KEY) {
        const apiResult = await extractByApi(params.id, params.user, env.XENON_TUMBLR_API_KEY);
        if (apiResult) {
            return apiResult;
        }
    }

    return extractByHtml(originalUrl);
}
