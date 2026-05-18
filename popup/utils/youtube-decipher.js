function readBalancedBlock(source, startIndex, openChar, closeChar) {
    let depth = 0;
    let i = startIndex;

    for (; i < source.length; i += 1) {
        const ch = source[i];

        if (ch === openChar) {
            depth += 1;
        } else if (ch === closeChar) {
            depth -= 1;
            if (depth === 0) {
                return source.slice(startIndex, i + 1);
            }
        }
    }

    return "";
}

function extractPlayerUrl(html) {
    const patterns = [
        /"jsUrl":"([^"]+)"/,
        /"PLAYER_JS_URL":"([^"]+)"/,
    ];

    for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match?.[1]) {
            const path = match[1].replace(/\\\//g, "/");
            return path.startsWith("http") ? path : `https://www.youtube.com${path}`;
        }
    }

    return "";
}

function extractDecipherName(playerCode) {
    const patterns = [
        /\.sig\|\|([a-zA-Z0-9$]+)\(/,
        /signature",([a-zA-Z0-9$]+)\(/,
        /set\("signature",([a-zA-Z0-9$]+)\(/,
        /\b([a-zA-Z0-9$]{2,})=function\(a\)\{a=a\.split\(""\)/,
    ];

    for (const pattern of patterns) {
        const match = playerCode.match(pattern);
        if (match?.[1]) {
            return match[1];
        }
    }

    return "";
}

function extractFunctionSource(playerCode, fnName) {
    const declaration = `function ${fnName}(`;
    const assigned = `${fnName}=function(`;

    let idx = playerCode.indexOf(declaration);
    if (idx > -1) {
        const start = playerCode.indexOf("{", idx);
        const body = readBalancedBlock(playerCode, start, "{", "}");
        if (body) {
            return `${declaration}a)${body}`;
        }
    }

    idx = playerCode.indexOf(assigned);
    if (idx > -1) {
        const start = playerCode.indexOf("{", idx);
        const body = readBalancedBlock(playerCode, start, "{", "}");
        if (body) {
            return `var ${fnName}=function(a)${body};`;
        }
    }

    const inlineMatch = playerCode.match(new RegExp(`([\\w$]+=function\\(a\\)\\{a=a\\.split\\(""\\);[\\s\\S]+?\\})`));
    if (inlineMatch?.[1]) {
        return `var ${inlineMatch[1]};`;
    }

    return "";
}

function extractHelperSource(playerCode, fnSource) {
    const helperName =
        fnSource.match(/;([a-zA-Z0-9$]{2,})\.[a-zA-Z0-9$]{2}\(a,\d+\)/)?.[1] ||
        fnSource.match(/([a-zA-Z0-9$]{2,})\.[a-zA-Z0-9$]{2}\(a\)/)?.[1] ||
        "";

    if (!helperName) {
        return "";
    }

    const patterns = [
        new RegExp(`var ${helperName}=\\{`),
        new RegExp(`${helperName}=\\{`),
    ];

    for (const pattern of patterns) {
        const match = pattern.exec(playerCode);
        if (!match) {
            continue;
        }

        const openIndex = playerCode.indexOf("{", match.index);
        if (openIndex < 0) {
            continue;
        }

        const literal = readBalancedBlock(playerCode, openIndex, "{", "}");
        if (literal) {
            return `var ${helperName}=${literal};`;
        }
    }

    return "";
}

function extractNParamName(playerCode) {
    const patterns = [
        /\.get\("n"\)\)&&\(b=([a-zA-Z0-9$]{2,})\[(\d+)\]?\(/,
        /[a-zA-Z0-9$]{2}\.set\("n",([a-zA-Z0-9$]{2,})\(a\[0\]\)\)/,
        /\.get\("n"\)&&\([a-z]=([a-zA-Z0-9$]{2,})\(/,
        /n\[0\]=([a-zA-Z0-9$]{2,})\(/,
    ];
    for (const p of patterns) {
        const m = playerCode.match(p);
        if (m?.[1]) return m[1];
    }
    return "";
}

export async function getYoutubeNTransform(html) {
    const playerUrl = extractPlayerUrl(html);
    if (!playerUrl) return null;

    const playerCode = await fetch(playerUrl).then((r) => r.text()).catch(() => "");
    if (!playerCode) return null;

    const fnName = extractNParamName(playerCode);
    if (!fnName) return null;

    const fnSource = extractFunctionSource(playerCode, fnName);
    if (!fnSource) return null;

    const helperSource = extractHelperSource(playerCode, fnSource);

    try {
        const fn = new Function(
            "n",
            `${helperSource}\n${fnSource}\nreturn ${fnName}(n);`,
        );
        return (n) => { try { return fn(n) || n; } catch { return n; } };
    } catch {
        return null;
    }
}

export function applyNParam(url, nTransform) {
    if (!nTransform) return url;
    try {
        const u = new URL(url);
        const n = u.searchParams.get("n");
        if (!n) return url;
        const transformed = nTransform(n);
        if (!transformed || transformed === n) return url;
        u.searchParams.set("n", transformed);
        return u.toString();
    } catch {
        return url;
    }
}

export async function getYoutubeDecipher(html) {
    const playerUrl = extractPlayerUrl(html);
    if (!playerUrl) {
        return null;
    }

    const playerCode = await fetch(playerUrl).then((r) => r.text()).catch(() => "");
    if (!playerCode) {
        return null;
    }

    const fnName = extractDecipherName(playerCode);
    if (!fnName) {
        return null;
    }

    const fnSource = extractFunctionSource(playerCode, fnName);
    if (!fnSource) {
        return null;
    }

    const helperSource = extractHelperSource(playerCode, fnSource);

    try {
        const fn = new Function(
            "sig",
            `${helperSource}\n${fnSource}\nreturn ${fnName}(sig);`,
        );

        return (signature) => {
            try {
                return fn(signature);
            } catch {
                return "";
            }
        };
    } catch {
        return null;
    }
}

export function parseCipherUrl(cipherText, decipher) {
    const params = new URLSearchParams(cipherText || "");
    const base = params.get("url");
    const s = params.get("s") || "";
    const sp = params.get("sp") || "signature";

    if (!base) {
        return "";
    }

    if (!s || !decipher) {
        return base;
    }

    const signature = decipher(s);
    if (!signature) {
        return "";
    }

    const finalUrl = new URL(base);
    finalUrl.searchParams.set(sp, signature);
    return finalUrl.toString();
}
