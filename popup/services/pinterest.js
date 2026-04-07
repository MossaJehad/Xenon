import { followUrl, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "pinterest";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "pinterest.com")) {
        return null;
    }

    if (parts[0] === "pin" && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "url_shortener" && parts[1]) {
        return { shortLink: parts[1] };
    }

    return null;
}

export async function extract({ match, env, detectPlatform }) {
    let id = match.id;

    if (!id && match.shortLink) {
        const redirected = await followUrl(`https://api.pinterest.com/url_shortener/${match.shortLink}/redirect/`);
        if (redirected) {
            const rematch = detectPlatform(redirected.toString());
            if (!rematch.error && rematch.service === service) {
                id = rematch.match.id;
            }
        }
    }

    if (!id) {
        throw new Error("fetch.short_link");
    }

    if (id.includes("--")) {
        id = id.split("--")[1];
    }

    const html = await textRequest(`https://www.pinterest.com/pin/${id}/`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    if (!html || html.includes('"__typename":"PinNotFound"')) {
        throw new Error("fetch.empty");
    }

    const video = [...html.matchAll(/"url":"(https:\/\/v1\.pinimg\.com\/videos\/.*?)"/g)]
        .map((m) => m[1].replaceAll("\\/", "/"))
        .find((url) => url.endsWith(".mp4"));

    if (video) {
        return mediaResult(service, `pinterest_${id}`, { videoUrl: video });
    }

    const image = [...html.matchAll(/src="(https:\/\/i\.pinimg\.com\/.*?\.(?:jpg|gif))"/g)]
        .map((m) => m[1].replaceAll("\\/", "/"))[0];

    if (!image) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `pinterest_${id}`, {
        imageUrl: image,
        preferredImageExt: image.endsWith(".gif") ? "gif" : "jpg",
    });
}
