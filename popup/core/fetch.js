import { getRuntimeEnv } from "./env.js";
import { detectPlatform } from "./detect.js";
import { SERVICE_MAP } from "../services/index.js";

function emptyResult() {
    return {
        error: "fetch.empty",
        message: "no downloadable media found",
    };
}

export async function fetchMediaCandidate(detected, mode = "auto") {
    if (!detected || detected.error) {
        return {
            error: detected?.error || "service.unsupported",
            message: detected?.message || "unsupported service",
        };
    }

    const extractor = SERVICE_MAP[detected.service]?.extract;
    if (!extractor) {
        return {
            error: "service.unsupported",
            message: `unsupported service: ${detected.service || "unknown"}`,
        };
    }

    try {
        const env = await getRuntimeEnv();
        const quality = env.XENON_DEFAULT_VIDEO_QUALITY || "1080";

        const result = await extractor({
            service: detected.service,
            match: detected.match || {},
            mode,
            quality,
            env,
            url: detected.url,
            normalizedUrl: detected.normalizedUrl,
            originalUrl: detected.normalizedUrl?.toString() || detected.url?.toString() || "",
            detectPlatform,
        });

        if (!result || (!result.videoUrl && !result.audioUrl && !result.imageUrl)) {
            return emptyResult();
        }

        return result;
    } catch (error) {
        return {
            error: error?.message || "fetch.fail",
            message: error?.message || "failed to fetch media",
        };
    }
}
