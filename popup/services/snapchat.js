import { followUrl, textRequest } from "../utils/http.js";
import { hostEnds, splitPath } from "../utils/url.js";
import { mediaResult } from "../utils/result.js";

export const service = "snapchat";

export function match(url) {
    const host = url.hostname.toLowerCase();
    const parts = splitPath(url);

    if (!hostEnds(host, "snapchat.com")) {
        return null;
    }

    if (host === "t.snapchat.com" && parts[0]) {
        return { shortLink: parts[0] };
    }

    if (["spotlight", "o"].includes(parts[0]) && parts[1]) {
        return { spotlightId: parts[1] };
    }

    if (["add", "u"].includes(parts[0]) && parts[1]) {
        return {
            username: parts[1],
            storyId: parts[2] || undefined,
        };
    }

    if (parts[0]) {
        return { shortLink: parts[0] };
    }

    return null;
}

export async function extract({ match, env, detectPlatform }) {
    let params = { ...match };

    if (params.shortLink) {
        const redirected = await followUrl(`https://t.snapchat.com/${params.shortLink}`, {
            "user-agent": env.XENON_BROWSER_UA,
        });

        if (redirected) {
            const rematch = detectPlatform(redirected.toString());
            if (!rematch.error && rematch.service === service) {
                params = { ...params, ...rematch.match };
            }
        }
    }

    if (params.spotlightId) {
        const html = await textRequest(`https://www.snapchat.com/spotlight/${params.spotlightId}`, {
            headers: {
                "user-agent": env.XENON_BROWSER_UA,
            },
        });

        const videoUrl = html?.match(/<link data-react-helmet="true" rel="preload" href="([^"]+)" as="video"\/>/)?.[1] || "";
        if (!videoUrl) {
            throw new Error("fetch.empty");
        }

        return mediaResult(service, `snapchat_${params.spotlightId}`, {
            videoUrl,
        });
    }

    if (!params.username) {
        throw new Error("fetch.empty");
    }

    const storyUrl = `https://www.snapchat.com/add/${params.username}${params.storyId ? `/${params.storyId}` : ""}`;
    const html = await textRequest(storyUrl, {
        headers: {
            "user-agent": env.XENON_BROWSER_UA,
        },
    });

    if (!html) {
        throw new Error("fetch.fail");
    }

    const nextDataRaw = html.match(/<script id="__NEXT_DATA__" type="application\/json">({.+})<\/script><\/body><\/html>$/)?.[1];
    if (!nextDataRaw) {
        throw new Error("fetch.empty");
    }

    const nextData = JSON.parse(nextDataRaw);
    const queryStoryId = nextData?.query?.profileParams?.[1];

    if (queryStoryId && nextData?.props?.pageProps?.story?.snapList?.length) {
        const snap = nextData.props.pageProps.story.snapList.find((item) => item.snapId?.value === queryStoryId);
        if (!snap) {
            throw new Error("fetch.empty");
        }

        if (snap.snapMediaType === 0) {
            return mediaResult(service, `snapchat_${queryStoryId}`, {
                imageUrl: snap.snapUrls?.mediaUrl,
                preferredImageExt: "jpg",
            });
        }

        return mediaResult(service, `snapchat_${queryStoryId}`, {
            videoUrl: snap.snapUrls?.mediaUrl,
        });
    }

    const highlight = nextData?.props?.pageProps?.curatedHighlights?.[0]?.snapList?.[0];
    if (!highlight) {
        throw new Error("fetch.empty");
    }

    const suffix = highlight.timestampInSec?.value || "item";
    if (highlight.snapMediaType === 0) {
        return mediaResult(service, `snapchat_${params.username}_${suffix}`, {
            imageUrl: highlight.snapUrls?.mediaUrl,
            preferredImageExt: "jpg",
        });
    }

    return mediaResult(service, `snapchat_${params.username}_${suffix}`, {
        videoUrl: highlight.snapUrls?.mediaUrl,
    });
}
