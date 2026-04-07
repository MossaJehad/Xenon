import { jsonRequest } from "../utils/http.js";
import { hostEquals, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "streamable";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEquals(host, "streamable.com") && parts[0]) {
        return { id: parts[0] };
    }

    return null;
}

function pickVideo(files) {
    if (!files) {
        return null;
    }

    return files.mp4 || files.mp4_mobile || files.mp4_hd || null;
}

export async function extract({ match }) {
    const data = await jsonRequest(`https://api.streamable.com/videos/${match.id}`);
    const file = pickVideo(data?.files);

    if (!file?.url) {
        throw new Error("fetch.empty");
    }

    const url = file.url.startsWith("http") ? file.url : `https:${file.url}`;
    return mediaResult(service, `streamable_${match.id}`, {
        videoUrl: url,
    });
}
