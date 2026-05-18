import {
    detectPlatform,
    fetchMediaCandidate,
    chooseDownloadTarget,
    buildDownloadFilename,
} from "./media-engine.js";
import { smartDownload } from "./utils/download.js";

const modeButtons = Array.from(document.querySelectorAll(".mode-button"));
const downloadButton = document.getElementById("downloadButton");
const input = document.getElementById("urlInput");
const statusLine = document.getElementById("statusLine");

const getMode = () =>
    modeButtons.find((button) => button.classList.contains("active"))?.dataset.mode || "auto";

const setStatus = (text, type = "") => {
    if (!statusLine) {
        return;
    }

    statusLine.textContent = text || "";
    statusLine.classList.remove("ok", "error");
    if (type) {
        statusLine.classList.add(type);
    }
};

for (const button of modeButtons) {
    button.addEventListener("click", () => {
        if (button.classList.contains("active")) {
            return;
        }

        for (const candidate of modeButtons) {
            candidate.classList.remove("active");
            candidate.setAttribute("aria-checked", "false");
        }

        button.classList.add("active");
        button.setAttribute("aria-checked", "true");
    });
}

downloadButton?.addEventListener("click", async () => {
    const rawUrl = input?.value?.trim() || "";
    if (!rawUrl) {
        setStatus("missing url", "error");
        return;
    }

    downloadButton.disabled = true;
    downloadButton.classList.add("pulse");
    setStatus("analyzing...");

    try {
        const mode = getMode();

        console.log("[xenon] ── new download ──────────────────────");
        console.log("[xenon] raw url:", rawUrl);
        console.log("[xenon] mode:", mode);

        const detected = detectPlatform(rawUrl);
        if (detected.error) {
            throw new Error(detected.message || detected.error);
        }

        console.log("[xenon] platform:", detected.service);
        setStatus(`platform = ${detected.service}`);

        const media = await fetchMediaCandidate(detected, mode);
        if (media.error) {
            throw new Error(media.message || media.error);
        }

        console.log("[xenon] media result:", {
            service: media.service,
            videoUrl: media.videoUrl ? `${media.videoUrl.slice(0, 80)}…` : "",
            audioUrl: media.audioUrl ? `${media.audioUrl.slice(0, 80)}…` : "",
            imageUrl: media.imageUrl ? `${media.imageUrl.slice(0, 80)}…` : "",
            preferredVideoExt: media.preferredVideoExt,
            preferredAudioExt: media.preferredAudioExt,
            preferredImageExt: media.preferredImageExt,
            fetchHeaders: media.fetchHeaders,
        });

        const target = chooseDownloadTarget(media, mode);
        if (target.error || !target.url) {
            throw new Error(target.message || target.error || "media unavailable");
        }

        console.log("[xenon] target:", { kind: target.kind, extension: target.extension, url: `${target.url.slice(0, 80)}…` });

        const filename = buildDownloadFilename(media, target, mode);

        console.log("[xenon] filename:", filename);
        console.log("[xenon] fetch headers:", media.fetchHeaders);

        setStatus("downloading...");

        const finalFilename = await smartDownload(target.url, filename, media.fetchHeaders || {});

        setStatus(`done → ${finalFilename}`, "ok");
        console.log("[xenon] download complete →", finalFilename);
    } catch (error) {
        const msg = String(error?.message || error || "download failed");
        setStatus(msg, "error");
        console.error("[xenon] download error:", msg);
    } finally {
        setTimeout(() => {
            downloadButton.classList.remove("pulse");
            downloadButton.disabled = false;
        }, 140);
    }
});
