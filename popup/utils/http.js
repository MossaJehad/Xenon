export async function textRequest(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok && !options.allowAnyStatus) {
            return null;
        }
        return await response.text();
    } catch {
        return null;
    }
}

export async function jsonRequest(url, options = {}) {
    try {
        const response = await fetch(url, options);
        if (!response.ok && !options.allowAnyStatus) {
            return null;
        }
        return await response.json();
    } catch {
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
    } catch {
        return null;
    }
}
