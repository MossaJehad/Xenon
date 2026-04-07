import { jsonRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "vimeo";

const bearerCache = {
    token: "",
    expiry: 0,
};

const DEFAULT_AUTH_BASIC = "Basic NzRmYTg5YjgxMWExY2JiNzUwZDg1MjhkMTYzZjQ4YWYyOGEyZGJlMTp4OGx2NFd3QnNvY1lkamI2UVZsdjdDYlNwSDUrdm50YzdNNThvWDcwN1JrenJGZC9tR1lReUNlRjRSVklZeWhYZVpRS0tBcU9YYzRoTGY2Z1dlVkJFYkdJc0dMRHpoZWFZbU0reDRqZ1dkZ1diZmdIdGUrNUM5RVBySlM0VG1qcw==";
const APP_UA = "com.vimeo.android.videoapp (Google, Pixel 7a, google, Android 16/36 Version 11.8.1) Kotlin VimeoNetworking/3.12.0";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "vimeo.com")) {
        return null;
    }

    if (parts[0] === "video" && parts[1]) {
        return { id: parts[1], password: undefined };
    }

    if (/^\d+$/.test(parts[0] || "")) {
        return {
            id: parts[0],
            password: parts[1] || undefined,
        };
    }

    if (["channels", "groups"].includes(parts[0]) && /^\d+$/.test(parts[parts.length - 1] || "")) {
        return {
            id: parts[parts.length - 1],
            password: undefined,
        };
    }

    return null;
}

async function getBearer(env) {
    if (bearerCache.token && bearerCache.expiry > Date.now() + 15_000) {
        return bearerCache.token;
    }

    const oauth = await jsonRequest("https://api.vimeo.com/oauth/authorize/client", {
        method: "POST",
        headers: {
            Accept: "application/vnd.vimeo.*+json; version=3.4.10",
            "User-Agent": APP_UA,
            Authorization: env.XENON_VIMEO_AUTH_BASIC || DEFAULT_AUTH_BASIC,
            "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            scope: "private public create edit delete interact upload purchased stats",
            grant_type: "client_credentials",
        }).toString(),
    });

    if (!oauth?.access_token) {
        throw new Error("fetch.fail");
    }

    bearerCache.token = oauth.access_token;
    bearerCache.expiry = Date.now() + 60 * 60 * 1000;

    return bearerCache.token;
}

export async function extract({ match, env, quality = "1080" }) {
    const bearer = await getBearer(env);
    const targetId = match.password ? `${match.id}:${match.password}` : match.id;

    const info = await jsonRequest(`https://api.vimeo.com/videos/${targetId}`, {
        headers: {
            Accept: "application/vnd.vimeo.*+json; version=3.4.10",
            "User-Agent": APP_UA,
            Authorization: `Bearer ${bearer}`,
            "Accept-Language": "en",
        },
    });

    if (!info || info.error_code) {
        throw new Error("fetch.empty");
    }

    const files = (info.files || []).filter((file) => String(file.rendition || "").endsWith("p") && file.link);
    if (!files.length) {
        throw new Error("fetch.empty");
    }

    const target = Number(quality === "max" ? 9999 : quality) || 1080;
    const picked = files.reduce((a, b) => {
        const qa = Number(String(a.rendition).replace(/[^0-9]/g, "")) || 0;
        const qb = Number(String(b.rendition).replace(/[^0-9]/g, "")) || 0;
        const da = Math.abs(qa - target);
        const db = Math.abs(qb - target);
        return da <= db ? a : b;
    });

    if (!picked?.link) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `vimeo_${match.id}`, {
        videoUrl: picked.link,
    });
}
