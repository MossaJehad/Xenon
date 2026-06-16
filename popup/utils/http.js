const DEBUG = true;

function logFail(kind, url, info) {
	if (DEBUG) {
		console.warn(`[xenon:http] ${kind} failed`, String(url).slice(0, 120), "→", info);
	}
}

export async function textRequest(url, options = {}) {
	try {
		const response = await fetch(url, options);
		if (!response.ok && !options.allowAnyStatus) {
			logFail("text", url, `HTTP ${response.status}`);
			return null;
		}
		return await response.text();
	} catch (err) {
		logFail("text", url, err?.message || err);
		return null;
	}
}

export async function jsonRequest(url, options = {}) {
	try {
		const response = await fetch(url, options);
		if (!response.ok && !options.allowAnyStatus) {
			logFail("json", url, `HTTP ${response.status}`);
			return null;
		}
		return await response.json();
	} catch (err) {
		logFail("json", url, err?.message || err);
		return null;
	}
}

export async function headOk(url) {
	try {
		const response = await fetch(url, { method: "HEAD" });
		return response.ok;
	} catch {
		return false;
	}
}

export async function followUrl(url, headers = {}) {
	try {
		const response = await fetch(url, {
			method: "GET",
			redirect: "follow",
			headers,
		});

		return response?.url ? new URL(response.url) : null;
	} catch (err) {
		logFail("follow", url, err?.message || err);
		return null;
	}
}
