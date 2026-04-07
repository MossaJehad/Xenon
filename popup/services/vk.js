import { jsonRequest } from "../utils/http.js";
import { hostEnds } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "vk";

const tokenCache = {
    token: "",
    expiry: 0,
    deviceId: "",
};

const FALLBACK_CLIENT_ID = "51552953";
const FALLBACK_CLIENT_SECRET = "qgr0yWwXCrsxA1jnRtRX";
const FALLBACK_VERSION = "5.274";
const FALLBACK_UA = "com.vk.vkvideo.prod/1955 (iPhone, iOS 16.7.15, iPhone10,4, Scale/2.0) SAK/1.135";

export function match(url) {
    const host = url.hostname.toLowerCase();

    if (!(hostEnds(host, "vk.com") || ["vkvideo.ru", "vk.ru"].includes(host))) {
        return null;
    }

    const pathValue = url.pathname;
    let parsed = pathValue.match(/\/(?:video|clip)(-?\d+)_(-?\d+)(?:_([A-Za-z0-9]+))?/i);

    if (!parsed) {
        const zipped = url.searchParams.get("z") || "";
        parsed = zipped.match(/(?:video|clip)(-?\d+)_(-?\d+)(?:_([A-Za-z0-9]+))?/i);
    }

    if (!parsed) {
        return null;
    }

    return {
        ownerId: parsed[1],
        videoId: parsed[2],
        accessKey: parsed[3] || undefined,
    };
}

async function getToken(env) {
    if (tokenCache.token && tokenCache.expiry > Math.floor(Date.now() / 1000) + 10) {
        return tokenCache.token;
    }

    const clientId = env.XENON_VK_CLIENT_ID || FALLBACK_CLIENT_ID;
    const clientSecret = env.XENON_VK_CLIENT_SECRET || FALLBACK_CLIENT_SECRET;
    const version = env.XENON_VK_CLIENT_VERSION || FALLBACK_VERSION;
    const deviceId = crypto.randomUUID().toUpperCase();

    const endpoint = new URL("https://api.vk.ru/method/auth.getAnonymToken");
    endpoint.searchParams.set("client_id", clientId);
    endpoint.searchParams.set("client_secret", clientSecret);
    endpoint.searchParams.set("device_id", deviceId);
    endpoint.searchParams.set("v", version);

    const response = await jsonRequest(endpoint, {
        headers: {
            "user-agent": env.XENON_VK_CLIENT_UA || FALLBACK_UA,
        },
    });

    const token = response?.response?.token;
    const expiry = response?.response?.expired_at;

    if (!token || !expiry) {
        throw new Error("fetch.fail");
    }

    tokenCache.token = token;
    tokenCache.expiry = expiry;
    tokenCache.deviceId = deviceId;

    return token;
}

export async function extract({ match, env, quality = "1080" }) {
    await getToken(env);

    const version = env.XENON_VK_CLIENT_VERSION || FALLBACK_VERSION;
    const ua = env.XENON_VK_CLIENT_UA || FALLBACK_UA;

    const body = new URLSearchParams({
        anonymous_token: tokenCache.token,
        device_id: tokenCache.deviceId,
        lang: "en",
        v: version,
        videos: `${match.ownerId}_${match.videoId}${match.accessKey ? `_${match.accessKey}` : ""}`,
    }).toString();

    const data = await jsonRequest("https://api.vkvideo.ru/method/video.get", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded; charset=utf-8",
            "user-agent": ua,
        },
        body,
    });

    const item = data?.response?.items?.[0];
    if (!item?.files) {
        throw new Error("fetch.empty");
    }

    const ladder = ["2160", "1440", "1080", "720", "480", "360", "240", "144"];
    const target = quality === "max" ? 9000 : Number(quality) || 1080;

    let selected = "";
    for (const r of ladder) {
        const key = `mp4_${r}`;
        if (item.files[key] && Number(r) <= target) {
            selected = item.files[key];
            break;
        }
    }

    if (!selected) {
        for (const r of ladder) {
            const key = `mp4_${r}`;
            if (item.files[key]) {
                selected = item.files[key];
                break;
            }
        }
    }

    if (!selected) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `vk_${match.ownerId}_${match.videoId}`, {
        videoUrl: selected,
    });
}
