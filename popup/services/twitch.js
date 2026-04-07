import { jsonRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "twitch";

const DEFAULT_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "twitch.tv")) {
        return null;
    }

    if (parts[0] === "_" && parts[1] === "clip" && parts[2]) {
        return { channel: "_", clip: parts[2] };
    }

    if (parts[0] && parts[1] === "clip" && parts[2]) {
        return { channel: parts[0], clip: parts[2] };
    }

    return null;
}

export async function extract({ match, env, quality = "1080" }) {
    const clipId = match.clip;
    const clientId = env.XENON_TWITCH_CLIENT_ID || DEFAULT_CLIENT_ID;

    const metadata = await jsonRequest("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
            "client-id": clientId,
        },
        body: JSON.stringify({
            query: `{
                clip(slug: "${clipId}") {
                    id
                    title
                    durationSeconds
                    videoQualities {
                        quality
                        sourceURL
                    }
                }
            }`,
        }),
    });

    const clip = metadata?.data?.clip;
    const qualities = clip?.videoQualities || [];
    if (!qualities.length) {
        throw new Error("fetch.empty");
    }

    const target = Number(quality === "max" ? 9999 : quality) || 1080;
    const picked = qualities.reduce((a, b) => {
        const da = Math.abs(Number(a.quality) - target);
        const db = Math.abs(Number(b.quality) - target);
        return da <= db ? a : b;
    });

    if (!picked?.sourceURL) {
        throw new Error("fetch.empty");
    }

    const tokenData = await jsonRequest("https://gql.twitch.tv/gql", {
        method: "POST",
        headers: {
            "client-id": clientId,
        },
        body: JSON.stringify([
            {
                operationName: "VideoAccessToken_Clip",
                variables: { slug: clipId },
                extensions: {
                    persistedQuery: {
                        version: 1,
                        sha256Hash: "36b89d2507fce29e5ca551df756d27c1cfe079e2609642b4390aa4c35796eb11",
                    },
                },
            },
        ]),
    });

    const tokenValue = tokenData?.[0]?.data?.clip?.playbackAccessToken?.value;
    const tokenSig = tokenData?.[0]?.data?.clip?.playbackAccessToken?.signature;

    let videoUrl = picked.sourceURL;
    if (tokenValue && tokenSig) {
        const params = new URLSearchParams({ token: tokenValue, sig: tokenSig });
        videoUrl = `${videoUrl}?${params.toString()}`;
    }

    return mediaResult(service, `twitchclip_${clip?.id || clipId}`, {
        videoUrl,
    });
}
