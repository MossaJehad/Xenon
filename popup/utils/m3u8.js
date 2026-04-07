function parseAttributes(line) {
    const out = {};
    const content = line.replace(/^#EXT-X-STREAM-INF:/, "");

    for (const pair of content.split(",")) {
        const idx = pair.indexOf("=");
        if (idx < 0) {
            continue;
        }

        const key = pair.slice(0, idx).trim();
        const value = pair.slice(idx + 1).trim().replace(/^"|"$/g, "");
        out[key] = value;
    }

    return out;
}

export function parseM3u8Variants(manifest, baseUrl) {
    const lines = String(manifest || "").split(/\r?\n/);
    const variants = [];

    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i].trim();
        if (!line.startsWith("#EXT-X-STREAM-INF:")) {
            continue;
        }

        const attrs = parseAttributes(line);
        let path = "";

        for (let j = i + 1; j < lines.length; j += 1) {
            const candidate = lines[j].trim();
            if (!candidate || candidate.startsWith("#")) {
                continue;
            }

            path = candidate;
            i = j;
            break;
        }

        if (!path) {
            continue;
        }

        const [w, h] = String(attrs.RESOLUTION || "0x0").split("x");
        variants.push({
            uri: new URL(path, baseUrl).toString(),
            bandwidth: Number(attrs.BANDWIDTH) || 0,
            width: Number(w) || 0,
            height: Number(h) || 0,
            raw: attrs,
        });
    }

    return variants;
}

export function bestByBandwidth(variants) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return null;
    }

    return variants.reduce((a, b) => (Number(a.bandwidth) > Number(b.bandwidth) ? a : b));
}

export function closestHeight(variants, requestedHeight) {
    if (!Array.isArray(variants) || variants.length === 0) {
        return null;
    }

    if (!requestedHeight || requestedHeight === "max") {
        return bestByBandwidth(variants);
    }

    const target = Number(requestedHeight) || 1080;
    return variants.reduce((a, b) => {
        const da = Math.abs((Number(a.height) || Number.MAX_SAFE_INTEGER) - target);
        const db = Math.abs((Number(b.height) || Number.MAX_SAFE_INTEGER) - target);
        return da <= db ? a : b;
    });
}
