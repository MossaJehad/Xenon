/**
 * Xenon background worker.
 *
 * Runs as a service worker (Chrome) and as a non-persistent background script
 * (Firefox). Its job: download a media URL with the correct request headers.
 *
 * Why this exists:
 *   `fetch()` and `chrome.downloads.download()` cannot set Referer / Origin /
 *   User-Agent — the browser treats them as "forbidden headers" and strips
 *   them. Many CDNs (TikTok, Facebook, googlevideo, ...) reject hot-linked
 *   requests that are missing those headers and answer 403. The only MV3-safe
 *   way to attach them is declarativeNetRequest header rules, which only the
 *   extension (with host permissions) can install.
 */

const api = globalThis.browser ?? globalThis.chrome;

const DEBUG = true;
const log = (...args) => DEBUG && console.log("[xenon:bg]", ...args);

// Call an extension API that may use either Chrome's callback style or
// Firefox's promise style, and always get back a promise.
function callApi(fn, ...args) {
	return new Promise((resolve, reject) => {
		try {
			const ret = fn(...args, (result) => {
				const err = api.runtime?.lastError;
				if (err) {
					reject(new Error(err.message));
				} else {
					resolve(result);
				}
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

// Resource types both Chrome and Firefox understand. Browser-initiated
// downloads usually arrive as "other", but we cover the lot so the rule also
// applies if the download is fetched as media/xhr.
const RESOURCE_TYPES = [
	"main_frame",
	"sub_frame",
	"stylesheet",
	"script",
	"image",
	"font",
	"object",
	"xmlhttprequest",
	"media",
	"other",
];

function safeOrigin(referer) {
	try {
		return referer ? new URL(referer).origin : "";
	} catch {
		return "";
	}
}

// Session rules live until removed (or the browser restarts). Use a rotating id
// space and wipe any leftovers on startup so a killed worker can't leak rules.
let ruleSeq = 1;
const nextRuleId = () => {
	ruleSeq = (ruleSeq % 9000) + 1;
	return 1000 + ruleSeq;
};

// downloadId -> { ruleId, settle }
const pending = new Map();

async function clearAllSessionRules() {
	try {
		const rules = await api.declarativeNetRequest.getSessionRules();
		if (rules.length) {
			await api.declarativeNetRequest.updateSessionRules({
				removeRuleIds: rules.map((r) => r.id),
			});
			log("cleared", rules.length, "stale session rules");
		}
	} catch (err) {
		log("clearAllSessionRules failed:", err?.message);
	}
}

clearAllSessionRules();

async function addHeaderRule(targetUrl, headers) {
	let host;
	try {
		host = new URL(targetUrl).hostname;
	} catch {
		return 0;
	}

	const requestHeaders = [];
	const push = (header, value) => {
		if (value) {
			requestHeaders.push({ header, operation: "set", value: String(value) });
		}
	};

	push("referer", headers.referer);
	push("origin", headers.origin);
	push("user-agent", headers.userAgent);

	if (!requestHeaders.length) {
		return 0;
	}

	const ruleId = nextRuleId();
	await api.declarativeNetRequest.updateSessionRules({
		removeRuleIds: [ruleId],
		addRules: [
			{
				id: ruleId,
				priority: 1,
				action: { type: "modifyHeaders", requestHeaders },
				condition: { requestDomains: [host], resourceTypes: RESOURCE_TYPES },
			},
		],
	});

	log("rule", ruleId, "→", host, requestHeaders.map((h) => h.header).join(","));
	return ruleId;
}

async function removeRule(ruleId) {
	if (!ruleId) {
		return;
	}
	try {
		await api.declarativeNetRequest.updateSessionRules({ removeRuleIds: [ruleId] });
		log("rule", ruleId, "removed");
	} catch (err) {
		log("removeRule failed:", err?.message);
	}
}

async function startDownload(url, filename) {
	const downloadId = await callApi(
		api.downloads.download.bind(api.downloads),
		{ url, filename, conflictAction: "uniquify", saveAs: false },
	);
	if (downloadId === undefined || downloadId === null) {
		throw new Error("download id missing");
	}
	return downloadId;
}

api.downloads.onChanged.addListener((delta) => {
	const entry = pending.get(delta.id);
	if (!entry) {
		return;
	}

	if (delta.state?.current === "complete") {
		removeRule(entry.ruleId);
		pending.delete(delta.id);
		entry.settle.resolve({ ok: true, filename: entry.filename });
	} else if (delta.state?.current === "interrupted") {
		removeRule(entry.ruleId);
		pending.delete(delta.id);
		const reason = delta.error?.current || "download interrupted";
		entry.settle.resolve({ ok: false, error: reason });
	}
});

async function handleDownload(payload) {
	const { url, filename } = payload;
	if (!url) {
		return { ok: false, error: "missing url" };
	}

	const ruleId = await addHeaderRule(url, {
		referer: payload.referer,
		origin: payload.origin || safeOrigin(payload.referer),
		userAgent: payload.userAgent,
	});

	let downloadId;
	try {
		downloadId = await startDownload(url, filename || "xenon_media");
	} catch (err) {
		await removeRule(ruleId);
		return { ok: false, error: err?.message || "download failed" };
	}

	return await new Promise((resolve) => {
		let done = false;
		const settle = {
			resolve: (value) => {
				if (!done) {
					done = true;
					resolve(value);
				}
			},
		};

		pending.set(downloadId, { ruleId, filename: filename || "xenon_media", settle });

		// Big files take a while; don't make the popup wait forever. Once the
		// download is safely under way, report success — completion/cleanup is
		// still handled by onChanged.
		setTimeout(() => {
			if (pending.has(downloadId)) {
				settle.resolve({ ok: true, filename: filename || "xenon_media", started: true });
			}
		}, 8000);
	});
}

api.runtime.onMessage.addListener((message, _sender, sendResponse) => {
	if (message?.type !== "XENON_DOWNLOAD") {
		return false;
	}

	handleDownload(message)
		.then(sendResponse)
		.catch((err) => sendResponse({ ok: false, error: err?.message || "download failed" }));

	// Keep the message channel open for the async response.
	return true;
});
