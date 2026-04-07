import { followUrl, jsonRequest, textRequest } from "../utils/http.js";
import { hostEquals, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "soundcloud";

const cache = {
    version: "",
    clientId: "",
};

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEquals(host, "on.soundcloud.com") && parts[0]) {
        return { shortLink: parts[0] };
    }

    if (hostEquals(host, "soundcloud.com") && parts[0] && parts[1]) {
        const out = {
            author: parts[0],
            song: parts[1],
        };

        if (parts[2] && parts[2].startsWith("s-")) {
            out.accessKey = parts[2].slice(2);
        }

        return out;
    }

    return null;
}

async function resolveClientId(env) {
    if (env.XENON_SOUNDCLOUD_CLIENT_ID) {
        return env.XENON_SOUNDCLOUD_CLIENT_ID;
    }

    const root = await textRequest("https://soundcloud.com/");
    if (!root) {
        return "";
    }

    const version = root.match(/<script>window\.__sc_version="([0-9]{10})"<\/script>/)?.[1] || "";
    if (version && version === cache.version && cache.clientId) {
        return cache.clientId;
    }

    let clientId = root.match(/"hydratable"\s*:\s*"apiClient"\s*,\s*"data"\s*:\s*\{\s*"id"\s*:\s*"([^"]+)"/)?.[1] || "";

    if (!clientId) {
        const scripts = [...root.matchAll(/<script.+src="(.+)">/g)];
        for (const script of scripts) {
            const src = script[1];
            if (!src?.startsWith("https://a-v2.sndcdn.com/")) {
                continue;
            }

            const js = await textRequest(src);
            const id = js?.match(/,client_id:"([A-Za-z0-9]{32})",/)?.[1] || "";
            if (id) {
                clientId = id;
                break;
            }
        }
    }

    if (!clientId) {
        return "";
    }

    cache.version = version;
    cache.clientId = clientId;

    return clientId;
}

function pickTranscoding(transcodings, preferred) {
    let preferredEntry = null;
    let fallbackEntry = null;

    for (const entry of transcodings || []) {
        const protocol = entry?.format?.protocol || "";
        if (entry?.snipped || protocol.includes("encrypted")) {
            continue;
        }

        if (entry?.preset?.startsWith(`${preferred}_`)) {
            if (protocol === "progressive") {
                return entry;
            }
            preferredEntry ||= entry;
        }

        if (!fallbackEntry && protocol === "progressive") {
            fallbackEntry = entry;
        }
    }

    return preferredEntry || fallbackEntry;
}

export async function extract({ match, mode = "auto", detectPlatform, env }) {
    const clientId = await resolveClientId(env);
    if (!clientId) {
        throw new Error("fetch.fail");
    }

    let params = { ...match };

    if (params.shortLink) {
        const redirected = await followUrl(`https://on.soundcloud.com/${params.shortLink}`);
        if (redirected) {
            const rematch = detectPlatform(redirected.toString());
            if (!rematch.error && rematch.service === service) {
                params = { ...params, ...rematch.match };
            }
        }
    }

    if (!params.author || !params.song) {
        throw new Error("fetch.short_link");
    }

    let permalink = `https://soundcloud.com/${params.author}/${params.song}`;
    if (params.accessKey) {
        permalink += `/s-${params.accessKey}`;
    }

    const resolveUrl = new URL("https://api-v2.soundcloud.com/resolve");
    resolveUrl.searchParams.set("url", permalink);
    resolveUrl.searchParams.set("client_id", clientId);

    const resolved = await jsonRequest(resolveUrl);
    if (!resolved?.media?.transcodings?.length) {
        throw new Error("fetch.empty");
    }

    const preferred = mode === "audio" ? "mp3" : "opus";
    let transcoding = pickTranscoding(resolved.media.transcodings, preferred);
    if (!transcoding) {
        transcoding = pickTranscoding(resolved.media.transcodings, "mp3");
    }

    if (!transcoding?.url) {
        throw new Error("fetch.empty");
    }

    const signed = new URL(transcoding.url);
    signed.searchParams.set("client_id", clientId);
    if (resolved.track_authorization) {
        signed.searchParams.set("track_authorization", resolved.track_authorization);
    }

    const stream = await jsonRequest(signed);
    const audioUrl = stream?.url;
    if (!audioUrl) {
        throw new Error("fetch.empty");
    }

    const ext = audioUrl.includes(".m3u8") ? "m3u8" : (audioUrl.includes(".mp3") ? "mp3" : "m4a");
    return mediaResult(service, `soundcloud_${resolved.id || params.song}`, {
        audioUrl,
        preferredAudioExt: ext,
    });
}
