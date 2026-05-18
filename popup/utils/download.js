const MEDIA_PREFIXES = ["video/", "audio/", "image/", "application/octet-stream", "application/ogg", "application/mp4"];
const BAD_PREFIXES = ["text/html", "text/plain", "application/json", "text/xml", "application/xml", "application/xhtml"];

function cleanCt(ct) {
    return String(ct || "").toLowerCase().split(";")[0].trim();
}

function isMediaCt(ct) {
    const c = cleanCt(ct);
    if (!c) return true;
    return MEDIA_PREFIXES.some((p) => c.startsWith(p));
}

function isBadCt(ct) {
    const c = cleanCt(ct);
    return BAD_PREFIXES.some((p) => c.startsWith(p));
}

function extFromCt(ct, fallback) {
    const c = cleanCt(ct);
    if (c.includes("mp4")) return "mp4";
    if (c.includes("webm")) return "webm";
    if (c.includes("ogg")) return "ogg";
    if (c.includes("mpeg") || c.includes("mp3")) return "mp3";
    if (c.includes("aac") || c.includes("m4a")) return "m4a";
    if (c.includes("jpeg") || c.includes("jpg")) return "jpg";
    if (c.includes("png")) return "png";
    if (c.includes("gif")) return "gif";
    if (c.includes("webp")) return "webp";
    return fallback;
}

function applyCtExt(filename, ct) {
    const ctExt = extFromCt(ct, "");
    if (!ctExt) return filename;
    const dot = filename.lastIndexOf(".");
    const base = dot > 0 ? filename.slice(0, dot) : filename;
    return `${base}.${ctExt}`;
}

async function chromeDl(url, filename) {
    return new Promise((resolve, reject) => {
        chrome.downloads.download(
            { url, filename, conflictAction: "uniquify", saveAs: false },
            (downloadId) => {
                const err = chrome.runtime?.lastError;
                if (err) { reject(new Error(err.message)); return; }
                if (!downloadId) { reject(new Error("download id missing")); return; }
                resolve(downloadId);
            },
        );
    });
}

function anchorDl(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
}

async function triggerDl(url, filename) {
    if (typeof chrome !== "undefined" && chrome.downloads?.download) {
        return chromeDl(url, filename);
    }
    anchorDl(url, filename);
}

const BLOB_LIMIT = 100 * 1024 * 1024;

export async function smartDownload(url, filename, fetchHeaders = {}) {
    console.log("[xenon:download] url →", url);
    console.log("[xenon:download] filename →", filename);
    console.log("[xenon:download] headers →", fetchHeaders);

    let contentType = "";
    let contentLength = 0;
    let headOk = false;

    try {
        const head = await fetch(url, {
            method: "HEAD",
            headers: fetchHeaders,
            credentials: "omit",
        });

        contentType = head.headers.get("content-type") || "";
        contentLength = Number(head.headers.get("content-length") || 0);
        headOk = head.ok;

        console.log("[xenon:download] HEAD status:", head.status, "| content-type:", contentType, "| content-length:", contentLength);

        if (head.ok && isBadCt(contentType)) {
            throw new Error(`server returned ${cleanCt(contentType)} — expected media (check login/geo restrictions)`);
        }
    } catch (headErr) {
        if (headErr.message.includes("expected media")) {
            throw headErr;
        }
        console.warn("[xenon:download] HEAD failed:", headErr?.message, "— skipping HEAD check");
    }

    const fixedFilename = applyCtExt(filename, contentType);
    if (fixedFilename !== filename) {
        console.log("[xenon:download] extension corrected →", fixedFilename);
    }

    const useBlobPath = headOk && (contentLength === 0 || contentLength <= BLOB_LIMIT);

    if (useBlobPath) {
        try {
            console.log("[xenon:download] fetching as blob...");

            const res = await fetch(url, {
                headers: fetchHeaders,
                credentials: "omit",
            });

            const ct = res.headers.get("content-type") || contentType;
            console.log("[xenon:download] GET status:", res.status, "| content-type:", ct);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status} ${res.statusText || ""}`);
            }

            if (isBadCt(ct)) {
                throw new Error(`server returned ${cleanCt(ct)} — expected media`);
            }

            const blob = await res.blob();
            console.log("[xenon:download] blob size:", blob.size, "bytes | type:", blob.type);

            if (blob.size < 64) {
                throw new Error("response too small to be valid media");
            }

            const finalName = applyCtExt(fixedFilename, blob.type || ct);
            const objectUrl = URL.createObjectURL(blob);

            try {
                await triggerDl(objectUrl, finalName);
                console.log("[xenon:download] blob download triggered →", finalName);
                return finalName;
            } finally {
                setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
            }
        } catch (blobErr) {
            console.warn("[xenon:download] blob path failed:", blobErr?.message, "— falling back to direct download");
            if (blobErr.message.includes("expected media")) {
                throw blobErr;
            }
        }
    } else {
        console.log("[xenon:download] large file (", contentLength, "bytes) — using direct download");
    }

    await triggerDl(url, fixedFilename);
    console.log("[xenon:download] direct download triggered →", fixedFilename);
    return fixedFilename;
}
