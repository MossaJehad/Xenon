import {
    detectPlatform,
    fetchMediaCandidate,
    chooseDownloadTarget,
    buildDownloadFilename,
} from "./media-engine.js";

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

const triggerDownload = async (url, filename) => {
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
        return new Promise((resolve, reject) => {
            chrome.downloads.download(
                {
                    url,
                    filename,
                    conflictAction: "uniquify",
                    saveAs: false,
                },
                (downloadId) => {
                    const err = chrome.runtime?.lastError;
                    if (err) {
                        reject(new Error(err.message));
                        return;
                    }

                    if (!downloadId) {
                        reject(new Error("download failed"));
                        return;
                    }

                    resolve(downloadId);
                },
            );
        });
    }

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = "noopener";
    anchor.target = "_blank";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    return 0;
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
        const detected = detectPlatform(rawUrl);

        if (detected.error) {
            throw new Error(detected.message || detected.error);
        }

        setStatus(`platform = ${detected.service}`);

        const media = await fetchMediaCandidate(detected, mode);
        if (media.error) {
            throw new Error(media.message || media.error);
        }

        const target = chooseDownloadTarget(media, mode);
        if (target.error || !target.url) {
            throw new Error(target.message || target.error || "media unavailable");
        }

        const filename = buildDownloadFilename(media, target, mode);
        await triggerDownload(target.url, filename);

        setStatus(`download started -> ${filename}`, "ok");
    } catch (error) {
        setStatus(String(error?.message || error || "download failed"), "error");
    } finally {
        setTimeout(() => {
            downloadButton.classList.remove("pulse");
            downloadButton.disabled = false;
        }, 140);
    }
});
