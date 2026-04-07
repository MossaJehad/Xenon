import { jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { parseM3u8Variants, bestByBandwidth, closestHeight } from "../utils/m3u8.js";
import { mediaResult } from "../utils/result.js";

export const service = "rutube";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "rutube.ru")) {
        return null;
    }

    if (parts[0] === "video" && parts[1] === "private" && parts[2]) {
        return { id: parts[2], key: url.searchParams.get("p") || undefined };
    }

    if (parts[0] === "video" && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "play" && parts[1] === "embed" && parts[2]) {
        return { id: parts[2] };
    }

    if (parts[0] === "shorts" && parts[1]) {
        return { id: parts[1] };
    }

    if (parts[0] === "yappy" && parts[1]) {
        return { yappyId: parts[1] };
    }

    return null;
}

export async function extract({ match, quality = "1080" }) {
    if (match.yappyId) {
        const yappy = await jsonRequest(`https://rutube.ru/pangolin/api/web/yappy/v4/yappypage/?client=wdp&videoId=${match.yappyId}&page=1&page_size=1`);
        const link = yappy?.results?.find((entry) => entry.id === match.yappyId)?.link;
        if (!link) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, `rutube_yappy_${match.yappyId}`, { videoUrl: link });
    }

    const endpoint = new URL(`https://rutube.ru/api/play/options/${match.id}/?no_404=true&referer&pver=v2`);
    if (match.key) {
        endpoint.searchParams.set("p", match.key);
    }

    const data = await jsonRequest(endpoint);
    const hls = data?.video_balancer?.m3u8;
    if (!hls) {
        throw new Error("fetch.empty");
    }

    const manifest = await textRequest(hls);
    const variants = parseM3u8Variants(manifest, hls);

    const picked = closestHeight(variants, quality) || bestByBandwidth(variants);
    if (!picked?.uri) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `rutube_${match.id}`, {
        videoUrl: picked.uri,
        preferredVideoExt: picked.uri.includes(".m3u8") ? "m3u8" : "mp4",
    });
}
