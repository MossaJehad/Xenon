import { followUrl, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "tiktok";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "tiktok.com")) {
        return null;
    }

    if ((host.startsWith("vt.") || host.startsWith("vm.") || host === "t.tiktok.com") && parts[0]) {
        return { shortLink: parts[0] };
    }

    if (parts[0] === "t" && parts[1]) {
        return { shortLink: parts[1] };
    }

    if (parts[0] === "i18n" && parts[1] === "share" && parts[2] === "video" && parts[3]) {
        return { postId: parts[3] };
    }

    if (parts[1] === "video" && parts[2]) {
        return { postId: parts[2] };
    }

    if (parts[0] === "v" && parts[1]?.endsWith(".html")) {
        return { postId: parts[1].replace(/\.html$/, "") };
    }

    if (parts[1] === "photo" && parts[2]) {
        return { postId: parts[2] };
    }

    return null;
}

async function resolvePostId(params, env, detectPlatform) {
    if (params.postId) {
        return params.postId;
    }

    if (!params.shortLink) {
        return "";
    }

    const shortUrl = `https://vt.tiktok.com/${params.shortLink}`;

    const manual = await fetch(shortUrl, {
        redirect: "manual",
        headers: {
            "user-agent": env.XENON_BROWSER_UA.split(" Chrome/1")[0],
        },
    }).catch(() => null);

    const location = manual?.headers?.get("location") || "";
    if (location) {
        const rematch = detectPlatform(location);
        if (!rematch.error && rematch.service === service && rematch.match.postId) {
            return rematch.match.postId;
        }
    }

    const html = await textRequest(shortUrl, {
        redirect: "manual",
        headers: {
            "user-agent": env.XENON_BROWSER_UA.split(" Chrome/1")[0],
        },
        allowAnyStatus: true,
    });

    if (html?.startsWith('<a href="https://')) {
        const extracted = html.split('<a href="')[1].split('"')[0];
        const rematch = detectPlatform(extracted);
        if (!rematch.error && rematch.service === service) {
            return rematch.match.postId || "";
        }
    }

    const followed = await followUrl(shortUrl, {
        "user-agent": env.XENON_BROWSER_UA,
    });

    if (followed) {
        const rematch = detectPlatform(followed.toString());
        if (!rematch.error && rematch.service === service) {
            return rematch.match.postId || "";
        }
    }

    return "";
}

export async function extract({ match, mode = "auto", detectPlatform, env }) {
    const postId = await resolvePostId(match, env, detectPlatform);
    if (!postId) {
        throw new Error("fetch.short_link");
    }

    const html = await textRequest(`https://www.tiktok.com/@i/video/${postId}`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    if (!html) {
        throw new Error("fetch.fail");
    }

    const marker = '<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">';
    const start = html.indexOf(marker);
    if (start < 0) {
        throw new Error("fetch.empty");
    }

    const jsonStart = start + marker.length;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    if (jsonEnd < 0) {
        throw new Error("fetch.empty");
    }

    const all = JSON.parse(html.slice(jsonStart, jsonEnd));
    const detail = all?.["__DEFAULT_SCOPE__"]?.["webapp.video-detail"]?.itemInfo?.itemStruct;

    if (!detail) {
        throw new Error("fetch.empty");
    }

    const base = `tiktok_${detail.author?.uniqueId || "user"}_${postId}`;
    const videoPlay = detail?.video?.playAddr || "";
    const musicPlay = detail?.music?.playUrl || "";
    const images = detail?.imagePost?.images || [];

    if (images.length) {
        const firstImage = images[0]?.imageURL?.urlList?.find((url) => url.includes(".jpeg?")) || "";
        const audioUrl = musicPlay || videoPlay;

        if (mode === "audio" && audioUrl) {
            return mediaResult(service, base, {
                audioUrl,
                preferredAudioExt: audioUrl.includes("audio_mpeg") ? "mp3" : "m4a",
            });
        }

        if (firstImage) {
            return mediaResult(service, base, {
                imageUrl: firstImage,
                audioUrl,
                preferredImageExt: "jpg",
            });
        }

        if (audioUrl) {
            return mediaResult(service, base, {
                audioUrl,
                preferredAudioExt: audioUrl.includes("audio_mpeg") ? "mp3" : "m4a",
            });
        }

        throw new Error("fetch.empty");
    }

    if (mode === "audio") {
        const audioUrl = musicPlay || videoPlay;
        if (!audioUrl) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, base, {
            audioUrl,
            preferredAudioExt: audioUrl.includes("audio_mpeg") ? "mp3" : "m4a",
        });
    }

    if (!videoPlay) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, base, {
        videoUrl: videoPlay,
    });
}
