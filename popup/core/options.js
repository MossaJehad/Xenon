import { extFromUrl } from "../utils/url.js";

const AUDIO_UNSUPPORTED = new Set(["vk", "ok", "loom"]);

export function chooseDownloadTarget(media, mode = "auto") {
    if (!media || media.error) {
        return {
            error: media?.error || "fetch.empty",
            message: media?.message || "no media",
        };
    }

    const activeMode = ["auto", "audio", "mute"].includes(mode) ? mode : "auto";

    if (activeMode === "audio") {
        if (!media.audioUrl && AUDIO_UNSUPPORTED.has(media.service)) {
            return {
                error: "mode.audio.unsupported",
                message: `${media.service} audio-only unsupported`,
            };
        }

        if (media.audioUrl) {
            return {
                url: media.audioUrl,
                kind: "audio",
                extension: media.preferredAudioExt || extFromUrl(media.audioUrl, "mp3"),
            };
        }

        if (media.videoUrl) {
            return {
                url: media.videoUrl,
                kind: "audio-fallback",
                extension: media.preferredVideoExt || extFromUrl(media.videoUrl, "mp4"),
            };
        }

        return {
            error: "mode.audio.unsupported",
            message: "audio mode not available",
        };
    }

    if (activeMode === "mute") {
        if (media.videoUrl) {
            return {
                url: media.videoUrl,
                kind: "video",
                extension: media.preferredVideoExt || extFromUrl(media.videoUrl, "mp4"),
            };
        }
    }

    if (media.videoUrl) {
        return {
            url: media.videoUrl,
            kind: "video",
            extension: media.preferredVideoExt || extFromUrl(media.videoUrl, "mp4"),
        };
    }

    if (media.imageUrl) {
        return {
            url: media.imageUrl,
            kind: "image",
            extension: media.preferredImageExt || extFromUrl(media.imageUrl, "jpg"),
        };
    }

    if (media.audioUrl) {
        return {
            url: media.audioUrl,
            kind: "audio",
            extension: media.preferredAudioExt || extFromUrl(media.audioUrl, "mp3"),
        };
    }

    return {
        error: "fetch.empty",
        message: "media unavailable",
    };
}
