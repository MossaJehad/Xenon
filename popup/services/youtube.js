import { textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";
import { getYoutubeDecipher, getYoutubeNTransform, applyNParam, parseCipherUrl } from "../utils/youtube-decipher.js";

export const service = "youtube";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!(hostEnds(host, "youtube.com") || host === "youtu.be")) {
        return null;
    }

    if (host === "youtu.be" && parts[0]) {
        return { id: parts[0] };
    }

    if (parts[0] === "watch" && url.searchParams.get("v")) {
        return { id: url.searchParams.get("v") };
    }

    if (["shorts", "embed", "live"].includes(parts[0]) && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "clip" && url.searchParams.get("v")) {
        return { id: url.searchParams.get("v") };
    }

    return null;
}

function readBalancedObject(source, startIndex) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = startIndex; i < source.length; i += 1) {
        const ch = source[i];
        if (inString) {
            if (!escaped && ch === "\\") {
                escaped = true;
                continue;
            }
            if (!escaped && ch === '"') {
                inString = false;
            }
            escaped = false;
            continue;
        }
        if (ch === '"') {
            inString = true;
            continue;
        }
        if (ch === "{") {
            depth += 1;
        } else if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return source.slice(startIndex, i + 1);
            }
        }
    }

    return "";
}

function parseObjectAfter(source, marker) {
    const start = source.indexOf(marker);
    if (start < 0) {
        return null;
    }
    const objectStart = source.indexOf("{", start + marker.length);
    if (objectStart < 0) {
        return null;
    }
    const raw = readBalancedObject(source, objectStart);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function extractPlayerResponse(html) {
    return (
        parseObjectAfter(html, "var ytInitialPlayerResponse =") ||
        parseObjectAfter(html, 'window["ytInitialPlayerResponse"] =') ||
        parseObjectAfter(html, '"ytInitialPlayerResponse":')
    );
}

function extFromMime(mime, fallback) {
    if (String(mime || "").includes("webm")) return "webm";
    if (String(mime || "").includes("mp4")) return "mp4";
    return fallback;
}

function normalizeEntry(raw, decipher) {
    const directUrl = raw.url || parseCipherUrl(raw.signatureCipher || raw.cipher || "", decipher);
    if (!directUrl) {
        return null;
    }
    const mime = String(raw.mimeType || "");
    const isAudio = mime.startsWith("audio/");
    const isVideo = mime.startsWith("video/");

    return {
        url: directUrl,
        mime,
        isAudio,
        isVideo,
        hasAudio: Boolean(raw.audioQuality || raw.audioChannels || (!isVideo && isAudio) || (isVideo && !raw.qualityLabel)),
        bitrate: Number(raw.bitrate || 0),
        height: Number(raw.height || 0),
    };
}

function chooseByHeight(entries, quality) {
    if (!entries.length) {
        return null;
    }

    const target = Number(quality === "max" ? 9999 : quality) || 1080;
    return entries.reduce((a, b) => {
        const da = Math.abs((a.height || Number.MAX_SAFE_INTEGER) - target);
        const db = Math.abs((b.height || Number.MAX_SAFE_INTEGER) - target);
        if (da === db) {
            return a.bitrate >= b.bitrate ? a : b;
        }

        return da <= db ? a : b;
    });
}

function chooseBestBitrate(entries) {
    if (!entries.length) return null;
    return entries.reduce((a, b) => (a.bitrate >= b.bitrate ? a : b));
}

const YT_HEADERS = {
    fetchHeaders: {
        "referer": "https://www.youtube.com/",
        "origin": "https://www.youtube.com",
    },
};

export async function extract({ match, env, mode = "auto", quality = "1080" }) {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(match.id)}&hl=en`;
    const html = await textRequest(watchUrl, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
            accept: "text/html,application/xhtml+xml",
        },
    });

    if (!html) {
        throw new Error("fetch.fail");
    }

    const player = extractPlayerResponse(html);
    if (!player) {
        throw new Error("fetch.empty");
    }

    const status = player?.playabilityStatus?.status || "";
    if (status && status !== "OK" && status !== "LIVE_STREAM_OFFLINE") {
        throw new Error("fetch.empty");
    }
    const streaming = player.streamingData;
    const rawFormats = [...(streaming?.formats || []), ...(streaming?.adaptiveFormats || [])];

    if (!rawFormats.length) {
        throw new Error("fetch.empty");
    }

    const needsDecipher = rawFormats.some((entry) => !entry.url && (entry.signatureCipher || entry.cipher));
    const decipher = needsDecipher ? await getYoutubeDecipher(html) : null;
    const entries = rawFormats.map((entry) => normalizeEntry(entry, decipher)).filter(Boolean);

    if (!entries.length) {
        throw new Error("fetch.empty");
    }

    const nTransform = await getYoutubeNTransform(html).catch(() => null);

    function fixUrl(url) {
        return nTransform ? applyNParam(url, nTransform) : url;
    }

    const audioOnly = entries.filter((entry) => entry.isAudio);
    const muxed = entries.filter((entry) => entry.isVideo && entry.hasAudio);
    const videoOnly = entries.filter((entry) => entry.isVideo && !entry.hasAudio);

    if (mode === "audio") {
        const audio = chooseBestBitrate(audioOnly) || chooseBestBitrate(muxed);
        if (!audio?.url) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, `youtube_${match.id}`, {
            audioUrl: fixUrl(audio.url),
            preferredAudioExt: extFromMime(audio.mime, "m4a"),
            ...YT_HEADERS,
        });
    }

    if (mode === "mute") {
        const video = chooseByHeight(videoOnly, quality) || chooseByHeight(muxed, quality);
        if (!video?.url) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, `youtube_${match.id}`, {
            videoUrl: fixUrl(video.url),
            preferredVideoExt: extFromMime(video.mime, "mp4"),
            ...YT_HEADERS,
        });
    }

    const bestMuxed = chooseByHeight(muxed, quality);
    if (bestMuxed?.url) {
        return mediaResult(service, `youtube_${match.id}`, {
            videoUrl: fixUrl(bestMuxed.url),
            preferredVideoExt: extFromMime(bestMuxed.mime, "mp4"),
            ...YT_HEADERS,
        });
    }

    const bestVideo = chooseByHeight(videoOnly, quality);
    const bestAudio = chooseBestBitrate(audioOnly);

    if (!bestVideo?.url) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `youtube_${match.id}`, {
        videoUrl: fixUrl(bestVideo.url),
        audioUrl: bestAudio?.url ? fixUrl(bestAudio.url) : "",
        preferredVideoExt: extFromMime(bestVideo.mime, "mp4"),
        preferredAudioExt: extFromMime(bestAudio?.mime || "", "m4a"),
        ...YT_HEADERS,
    });
}
