import { jsonRequest, textRequest, followUrl } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { bestByBandwidth } from "../utils/m3u8.js";
import { mediaResult } from "../utils/result.js";

export const service = "bilibili";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEnds(host, "bilibili.com")) {
        if (parts[0] === "video" && parts[1]) {
            return { comId: parts[1], partId: url.searchParams.get("p") || undefined };
        }

        if (parts[0] === "_shortLink" && parts[1]) {
            return { comShortLink: parts[1] };
        }

        if (parts[0] === "_tv" && parts.includes("video")) {
            const idx = parts.indexOf("video");
            if (idx > -1 && parts[idx + 1]) {
                return { tvId: parts[idx + 1] };
            }
        }
    }

    if (hostEnds(host, "bilibili.tv") && parts.includes("video")) {
        const idx = parts.indexOf("video");
        if (idx > -1 && parts[idx + 1]) {
            return { tvId: parts[idx + 1] };
        }
    }

    return null;
}

function pickBest(list) {
    return bestByBandwidth(
        (list || [])
            .map((entry) => ({ ...entry, baseUrl: entry.baseUrl || entry.url }))
            .filter((entry) => entry.baseUrl),
    );
}

async function extractCom(info) {
    let { comId, partId, comShortLink } = info;

    if (comShortLink) {
        const redirected = await followUrl(`https://b23.tv/${comShortLink}`);
        if (redirected) {
            const rematch = match(redirected);
            comId = rematch?.comId;
            partId = rematch?.partId;
        }
    }

    if (!comId) {
        throw new Error("fetch.short_link");
    }

    const source = new URL(`https://bilibili.com/video/${comId}`);
    if (partId) {
        source.searchParams.set("p", String(partId));
    }

    const html = await textRequest(source, {
        headers: {
            "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
        },
    });

    const token = "<script>window.__playinfo__=";
    const start = html?.indexOf(token) ?? -1;
    if (!html || start < 0) {
        throw new Error("fetch.empty");
    }

    const jsonStart = start + token.length;
    const jsonEnd = html.indexOf("</script>", jsonStart);
    const parsed = JSON.parse(html.slice(jsonStart, jsonEnd));

    const dash = parsed?.data?.dash;
    const durl = parsed?.data?.durl?.[0]?.url || "";

    if (durl) {
        return mediaResult(service, `bilibili_${comId}${partId ? `_${partId}` : ""}`, {
            videoUrl: durl,
        });
    }

    const bestVideo = pickBest(dash?.video);
    const bestAudio = pickBest(dash?.audio);

    if (!bestVideo?.baseUrl && !bestAudio?.baseUrl) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `bilibili_${comId}${partId ? `_${partId}` : ""}`, {
        videoUrl: bestVideo?.baseUrl || "",
        audioUrl: bestAudio?.baseUrl || "",
        preferredAudioExt: "m4a",
    });
}

async function extractTv(tvId) {
    const api = new URL("https://api.bilibili.tv/intl/gateway/web/playurl?s_locale=en_US&platform=web&qn=64&type=0&device=wap&tf=0");
    api.searchParams.set("aid", tvId);

    const data = await jsonRequest(api);
    const play = data?.data?.playurl;
    if (!play) {
        throw new Error("fetch.empty");
    }

    const videos = (play.video || [])
        .map((entry) => entry.video_resource)
        .filter((entry) => entry?.url)
        .filter((entry) => String(entry.codecs || "").includes("avc1"));

    const audios = play.audio_resource || [];

    const bestVideo = pickBest(videos);
    const bestAudio = pickBest(audios);

    return mediaResult(service, `bilibili_tv_${tvId}`, {
        videoUrl: bestVideo?.baseUrl || bestVideo?.url || "",
        audioUrl: bestAudio?.baseUrl || bestAudio?.url || "",
        preferredAudioExt: "m4a",
    });
}

export async function extract({ match }) {
    if (match.tvId) {
        return extractTv(match.tvId);
    }

    return extractCom(match);
}
