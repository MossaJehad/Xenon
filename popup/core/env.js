const ENV_FILE = ".env";

let envCache = null;

const defaults = Object.freeze({
    XENON_BROWSER_UA: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",
    XENON_IG_APP_ID: "936619743392459",
    XENON_IG_MOBILE_UA: "Instagram 275.0.0.27.98 Android (33/13; 280dpi; 720x1423; Xiaomi; Redmi 7; onclite; qcom; en_US; 458229237)",
    XENON_DAILYMOTION_UA: "dailymotion/240213162706 CFNetwork/1492.0.1 Darwin/23.3.0",
    XENON_DAILYMOTION_AUTH_BASIC: "Basic MGQyZDgyNjQwOWFmOWU3MmRiNWQ6ODcxNmJmYTVjYmEwMmUwMGJkYTVmYTg1NTliNDIwMzQ3NzIyYWMzYQ==",
    XENON_TUMBLR_API_KEY: "jrsCWX1XDuVxAFO4GkK147syAoN8BJZ5voz8tS80bPcj26Vc5Z",
    XENON_TWITCH_CLIENT_ID: "kimne78kx3ncx6brgo4mv6wki5h1ko",
    XENON_VK_CLIENT_ID: "51552953",
    XENON_VK_CLIENT_SECRET: "qgr0yWwXCrsxA1jnRtRX",
    XENON_VK_CLIENT_VERSION: "5.274",
    XENON_VK_CLIENT_UA: "com.vk.vkvideo.prod/1955 (iPhone, iOS 16.7.15, iPhone10,4, Scale/2.0) SAK/1.135",
    XENON_VIMEO_AUTH_BASIC: "Basic NzRmYTg5YjgxMWExY2JiNzUwZDg1MjhkMTYzZjQ4YWYyOGEyZGJlMTp4OGx2NFd3QnNvY1lkamI2UVZsdjdDYlNwSDUrdm50YzdNNThvWDcwN1JrenJGZC9tR1lReUNlRjRSVklZeWhYZVpRS0tBcU9YYzRoTGY2Z1dlVkJFYkdJc0dMRHpoZWFZbU0reDRqZ1dkZ1diZmdIdGUrNUM5RVBySlM0VG1qcw==",
    XENON_SOUNDCLOUD_CLIENT_ID: "",
    XENON_DEFAULT_VIDEO_QUALITY: "1080",
    XENON_YOUTUBE_CLIENT_NAME: "WEB",
    XENON_YOUTUBE_CLIENT_VERSION: "2.20241224.01.00",
});

function parseEnvText(text) {
    const parsed = {};

    for (const rawLine of String(text || "").split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) {
            continue;
        }

        const idx = line.indexOf("=");
        if (idx < 1) {
            continue;
        }

        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (!key) {
            continue;
        }

        parsed[key] = value;
    }

    return parsed;
}

async function readEnvFile() {
    try {
        const envUrl = chrome?.runtime?.getURL
            ? chrome.runtime.getURL(ENV_FILE)
            : `../${ENV_FILE}`;

        const response = await fetch(envUrl, {
            cache: "no-store",
        });

        if (!response.ok) {
            return {};
        }

        const text = await response.text();
        return parseEnvText(text);
    } catch {
        return {};
    }
}

export async function getRuntimeEnv() {
    if (envCache) {
        return envCache;
    }

    const loaded = await readEnvFile();
    envCache = Object.freeze({
        ...defaults,
        ...loaded,
    });

    return envCache;
}
