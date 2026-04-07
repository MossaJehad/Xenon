import { jsonRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "loom";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEnds(host, "loom.com") && ["share", "embed"].includes(parts[0]) && parts[1]) {
        return { id: parts[1].slice(-32) };
    }

    return null;
}

function headers(id, env) {
    return {
        "user-agent": env.XENON_BROWSER_UA,
        "content-type": "application/json",
        origin: "https://www.loom.com",
        referer: `https://www.loom.com/share/${id}`,
        cookie: `loom_referral_video=${id};`,
        "x-loom-request-source": "loom_web_be851af",
    };
}

export async function extract({ match, env }) {
    const head = headers(match.id, env);

    const transcode = await jsonRequest(`https://www.loom.com/api/campaigns/sessions/${match.id}/transcoded-url`, {
        method: "POST",
        headers: head,
        body: JSON.stringify({
            force_original: false,
            password: null,
            anonID: null,
            deviceID: null,
        }),
    });

    let videoUrl = transcode?.url || "";

    if (!videoUrl) {
        const raw = await jsonRequest(`https://www.loom.com/api/campaigns/sessions/${match.id}/raw-url`, {
            method: "POST",
            headers: head,
            body: JSON.stringify({
                anonID: crypto.randomUUID(),
                client_name: "web",
                client_version: "be851af",
                deviceID: null,
                force_original: false,
                password: null,
                supported_mime_types: ["video/mp4"],
            }),
        });
        videoUrl = raw?.url || "";
    }

    if (!videoUrl) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `loom_${match.id}`, {
        videoUrl,
    });
}
