import { followUrl, jsonRequest, headOk } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "reddit";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "reddit.com")) {
        return null;
    }

    if (parts[0] === "video" && parts[1]) {
        return { shortId: parts[1] };
    }

    if (parts[0] === "comments" && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "r" && parts[2] === "comments" && parts[3]) {
        return { sub: parts[1], id: parts[3] };
    }

    if (parts[0] === "r" && parts[2] === "s" && parts[3]) {
        return { sub: parts[1], shareId: parts[3] };
    }

    if (parts[0] === "user" && parts[2] === "comments" && parts[3]) {
        return { user: parts[1], id: parts[3] };
    }

    return null;
}

export async function extract({ match, env, detectPlatform }) {
    let params = { ...match };

    if (params.shortId) {
        const redirected = await followUrl(`https://www.reddit.com/video/${params.shortId}`, {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "application/json",
        });

        if (redirected) {
            const rematch = detectPlatform(redirected.toString());
            if (!rematch.error && rematch.service === service) {
                params = { ...params, ...rematch.match };
            }
        }
    }

    if (!params.id && params.shareId && params.sub) {
        const redirected = await followUrl(`https://www.reddit.com/r/${params.sub}/s/${params.shareId}`, {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "application/json",
        });

        if (redirected) {
            const rematch = detectPlatform(redirected.toString());
            if (!rematch.error && rematch.service === service) {
                params = { ...params, ...rematch.match };
            }
        }
    }

    if (!params.id) {
        throw new Error("fetch.short_link");
    }

    const data = await jsonRequest(`https://www.reddit.com/comments/${params.id}.json`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "application/json",
        },
    });

    const post = data?.[0]?.data?.children?.[0]?.data;
    if (!post) {
        throw new Error("fetch.empty");
    }

    if (String(post.url || "").endsWith(".gif")) {
        return mediaResult(service, `reddit_${params.id}`, {
            imageUrl: post.url,
            preferredImageExt: "gif",
        });
    }

    const video = post?.secure_media?.reddit_video?.fallback_url?.split("?")[0] || "";
    if (!video) {
        throw new Error("fetch.empty");
    }

    let audio = `${video.split("DASH")[0]}audio`;
    if (video.includes(".mp4")) {
        audio = `${video.split("_")[0]}_audio.mp4`;
    }

    let hasAudio = await headOk(audio);
    if (!hasAudio) {
        audio = `${video.split("_")[0]}_AUDIO_128.mp4`;
        hasAudio = await headOk(audio);
    }

    return mediaResult(service, `reddit_${params.id}`, {
        videoUrl: video,
        audioUrl: hasAudio ? audio : "",
        preferredAudioExt: "mp4",
    });
}
