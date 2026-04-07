import { textRequest } from "../utils/http.js";
import { hostEquals, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "ok";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEquals(host, "ok.ru") && ["video", "videoembed"].includes(parts[0]) && parts[1]) {
        return { id: parts[1] };
    }

    return null;
}

export async function extract({ match, env }) {
    const html = await textRequest(`https://ok.ru/video/${match.id}`, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    const optionsRaw = html?.match(/<div data-module="OKVideo" .*? data-options="({.*?})"( .*?)>/)?.[1];
    if (!optionsRaw) {
        throw new Error("fetch.empty");
    }

    const metadata = JSON.parse(JSON.parse(optionsRaw.replaceAll("&quot;", '"')).flashvars.metadata);
    const available = (metadata?.videos || []).filter((item) => !item.disallowed);
    const best = available[available.length - 1];

    if (!best?.url) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `ok_${match.id}`, {
        videoUrl: best.url,
    });
}
