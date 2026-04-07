export function filenameSafe(value) {
    return (
        String(value || "xenon_media")
            .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "_")
            .replace(/\s+/g, "_")
            .replace(/_+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 140) || "xenon_media"
    );
}

export function buildDownloadFilename(media, target, mode = "auto") {
    const suffix = mode === "audio" ? "_audio" : mode === "mute" ? "_mute" : "";
    const base = filenameSafe(`${media.filenameBase || media.service || "xenon_media"}${suffix}`);
    const ext = filenameSafe(target.extension || "bin").replace(/[^a-zA-Z0-9]/g, "") || "bin";

    return `${base}.${ext}`;
}
