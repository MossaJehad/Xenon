import { filenameSafe } from "./filename.js";

export function decodeQuotedValue(rawValue) {
    if (!rawValue) {
        return "";
    }

    try {
        return JSON.parse(rawValue);
    } catch {
        return rawValue;
    }
}

export function mediaResult(service, base, data = {}) {
    return {
        service,
        filenameBase: filenameSafe(base || `${service}_media`),
        videoUrl: data.videoUrl || "",
        audioUrl: data.audioUrl || "",
        imageUrl: data.imageUrl || "",
        preferredVideoExt: data.preferredVideoExt || "mp4",
        preferredAudioExt: data.preferredAudioExt || "mp3",
        preferredImageExt: data.preferredImageExt || "jpg",
        fetchHeaders: data.fetchHeaders || {},
    };
}
