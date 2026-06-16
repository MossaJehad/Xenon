import { getRuntimeEnv } from "../core/env.js";

const api = globalThis.browser ?? globalThis.chrome;

// Map the browser's download-interrupt reasons to something a human can act on.
function humanizeDownloadError(reason) {
	const r = String(reason || "").toUpperCase();
	if (r.includes("FORBIDDEN")) return "server refused (403) — link expired or needs login/region";
	if (r.includes("UNAUTHORIZED")) return "server needs authentication (401) — log in to the site first";
	if (r.includes("BAD_CONTENT") || r.includes("NOT_FOUND")) return "media not found (404) — link may be wrong or removed";
	if (r.includes("NETWORK")) return "network error while downloading";
	if (r.includes("SERVER")) return "server error while downloading";
	if (r.includes("USER_CANCELED") || r.includes("CANCELED")) return "download canceled";
	return reason || "download failed";
}

function messageBackground(payload) {
	return new Promise((resolve, reject) => {
		try {
			const ret = api.runtime.sendMessage(payload, (response) => {
				const err = api.runtime?.lastError;
				if (err) {
					reject(new Error(err.message));
					return;
				}
				resolve(response);
			});
			// Firefox returns a promise and ignores the callback.
			if (ret && typeof ret.then === "function") {
				ret.then(resolve, reject);
			}
		} catch (err) {
			reject(err);
		}
	});
}

// Fallback for when the extension APIs are unavailable (e.g. the popup opened as
// a plain web page during testing). Cannot set custom headers — best effort.
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

export async function smartDownload(url, filename, fetchHeaders = {}) {
	console.log("[xenon:download] url →", url);
	console.log("[xenon:download] filename →", filename);
	console.log("[xenon:download] headers →", fetchHeaders);

	const referer = fetchHeaders.referer || fetchHeaders.Referer || "";
	let origin = fetchHeaders.origin || fetchHeaders.Origin || "";
	if (!origin && referer) {
		try {
			origin = new URL(referer).origin;
		} catch {
			origin = "";
		}
	}

	let userAgent = fetchHeaders["user-agent"] || fetchHeaders["User-Agent"] || "";
	if (!userAgent) {
		try {
			userAgent = (await getRuntimeEnv()).XENON_BROWSER_UA || "";
		} catch {
			userAgent = "";
		}
	}

	// Preferred path: background worker injects Referer/Origin/User-Agent via
	// declarativeNetRequest and lets the browser's download manager fetch it.
	if (api?.runtime?.sendMessage && api?.runtime?.id) {
		let res = null;
		try {
			res = await messageBackground({
				type: "XENON_DOWNLOAD",
				url,
				filename,
				referer,
				origin,
				userAgent,
			});
		} catch (err) {
			console.warn("[xenon:download] background unreachable:", err?.message, "— using anchor fallback");
		}

		if (res) {
			if (res.ok) {
				console.log("[xenon:download] download complete →", res.filename || filename, res.started ? "(in progress)" : "");
				return res.filename || filename;
			}
			throw new Error(humanizeDownloadError(res.error));
		}
	}

	anchorDl(url, filename);
	console.log("[xenon:download] anchor download triggered →", filename);
	return filename;
}
