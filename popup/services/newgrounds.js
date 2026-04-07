import { jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, splitPath, extFromUrl } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "newgrounds";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "newgrounds.com")) {
        return null;
    }

    if (parts[0] === "portal" && parts[1] === "view" && parts[2]) {
        return { id: parts[2] };
    }

    if (parts[0] === "audio" && parts[1] === "listen" && parts[2]) {
        return { audioId: parts[2] };
    }

    return null;
}

async function extractVideo(id, env) {
    const data = await jsonRequest(`https://www.newgrounds.com/portal/video/${id}`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
            "x-requested-with": "XMLHttpRequest",
        },
    });

    const sources = data?.sources;
    if (!sources) {
        throw new Error("fetch.empty");
    }

    const ordered = ["4k", "1080p", "720p", "480p", "360p", "240p", "144p"];
    let picked = null;

    for (const quality of ordered) {
        const candidate = sources[quality]?.[0];
        if (candidate?.src && String(candidate.type || "").includes("mp4")) {
            picked = candidate;
            break;
        }
    }

    if (!picked?.src) {
        const fallback = Object.values(sources).find((group) => group?.[0]?.src);
        picked = fallback?.[0] || null;
    }

    if (!picked?.src) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `newgrounds_${id}`, {
        videoUrl: picked.src,
    });
}

async function extractAudio(audioId, env) {
    const html = await textRequest(`https://www.newgrounds.com/audio/listen/${audioId}`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    const paramsRaw = html?.match(/,"params":\{(.*?)\},"images":/)?.[1];
    if (!paramsRaw) {
        throw new Error("fetch.empty");
    }

    const params = JSON.parse(`{${paramsRaw}}`);
    if (!params?.filename) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `newgrounds_${audioId}`, {
        audioUrl: params.filename,
        preferredAudioExt: extFromUrl(params.filename, "mp3"),
    });
}

export async function extract({ match, env }) {
    if (match.id) {
        return extractVideo(match.id, env);
    }

    return extractAudio(match.audioId, env);
}
