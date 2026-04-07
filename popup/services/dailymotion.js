import { jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { parseM3u8Variants, bestByBandwidth } from "../utils/m3u8.js";
import { mediaResult } from "../utils/result.js";

export const service = "dailymotion";

const tokenCache = {
    token: "",
    expiry: 0,
};

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEnds(host, "dailymotion.com") && parts[0] === "video" && parts[1]) {
        return { id: parts[1] };
    }

    return null;
}

async function getToken(env) {
    if (tokenCache.token && tokenCache.expiry > Date.now() + 15_000) {
        return tokenCache.token;
    }

    const token = await jsonRequest("https://graphql.api.dailymotion.com/oauth/token", {
        method: "POST",
        headers: {
            "content-type": "application/x-www-form-urlencoded; charset=utf-8",
            "user-agent": env.XENON_DAILYMOTION_UA,
            authorization: env.XENON_DAILYMOTION_AUTH_BASIC,
        },
        body: "traffic_segment=&grant_type=client_credentials",
    });

    if (!token?.access_token) {
        throw new Error("fetch.fail");
    }

    tokenCache.token = token.access_token;
    tokenCache.expiry = Date.now() + 25 * 60 * 1000;

    return tokenCache.token;
}

export async function extract({ match, env }) {
    const token = await getToken(env);

    const data = await jsonRequest("https://graphql.api.dailymotion.com/", {
        method: "POST",
        headers: {
            "user-agent": env.XENON_DAILYMOTION_UA,
            authorization: `Bearer ${token}`,
            "content-type": "application/json",
            "x-dm-appinfo-version": "7.16.0_240213162706",
            "x-dm-appinfo-type": "iosapp",
            "x-dm-appinfo-id": "com.dailymotion.dailymotion",
        },
        body: JSON.stringify({
            operationName: "Media",
            query: "query Media($xid: String!, $password: String) { media(xid: $xid, password: $password) { __typename ... on Video { xid hlsURL } } }",
            variables: { xid: match.id },
        }),
    });

    const hls = data?.data?.media?.hlsURL;
    if (!hls) {
        throw new Error("fetch.empty");
    }

    const manifest = await textRequest(hls);
    const variants = parseM3u8Variants(manifest, hls).filter((entry) =>
        String(entry.raw.CODECS || "").includes("avc1"),
    );
    const best = bestByBandwidth(variants);

    if (!best?.uri) {
        throw new Error("fetch.empty");
    }

    return mediaResult(service, `dailymotion_${match.id}`, {
        videoUrl: best.uri,
        preferredVideoExt: best.uri.includes(".m3u8") ? "m3u8" : "mp4",
    });
}
