import { jsonRequest, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { parseM3u8Variants, bestByBandwidth } from "../utils/m3u8.js";
import { mediaResult } from "../utils/result.js";

export const service = "bluesky";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (hostEnds(host, "bsky.app") && parts[0] === "profile" && parts[1] && parts[2] === "post" && parts[3]) {
        return { user: parts[1], post: parts[3] };
    }

    return null;
}

export async function extract({ match, env }) {
    const endpoint = new URL("https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?depth=0&parentHeight=0");
    endpoint.searchParams.set("uri", `at://${match.user}/app.bsky.feed.post/${match.post}`);

    const data = await jsonRequest(endpoint, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    const embed = data?.thread?.post?.embed;
    const base = `bluesky_${match.user}_${match.post}`;
    if (!embed) {
        throw new Error("fetch.empty");
    }

    if (["app.bsky.embed.video#view", "app.bsky.embed.recordWithMedia#view"].includes(embed.$type)) {
        const media = embed.$type === "app.bsky.embed.video#view" ? embed : embed.media;
        const playlist = media?.playlist;
        if (!playlist) {
            throw new Error("fetch.empty");
        }

        let master = playlist;
        if (master.startsWith("https://video.bsky.app/watch/")) {
            master = master.replace("video.bsky.app/watch/", "video.cdn.bsky.app/hls/");
        }

        const manifest = await textRequest(master);
        const variants = parseM3u8Variants(manifest, master);
        const best = bestByBandwidth(variants);

        return mediaResult(service, base, {
            videoUrl: best?.uri || playlist,
            preferredVideoExt: best?.uri?.includes(".m3u8") ? "m3u8" : "mp4",
        });
    }

    if (embed.$type === "app.bsky.embed.images#view") {
        const image = embed?.images?.[0]?.fullsize;
        if (!image) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, base, {
            imageUrl: image,
        });
    }

    const gifUrl = embed?.external?.uri || embed?.media?.external?.uri;
    if (gifUrl?.includes("media.tenor.com")) {
        const clean = new URL(gifUrl);
        clean.search = "";
        return mediaResult(service, base, {
            imageUrl: clean.toString(),
            preferredImageExt: "gif",
        });
    }

    throw new Error("fetch.empty");
}
