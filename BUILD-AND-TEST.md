# Xenon — build, install & test

## Build

**No Node (Windows):**
```powershell
powershell -ExecutionPolicy Bypass -File build-extension.ps1
# → web-ext-artifacts/xenon-<version>.zip  (manifest at root, forward-slash paths)
```

**With Node / web-ext (recommended for Firefox signing):**
```bash
npm install
npm run lint            # validate manifest + code
npm run build           # web-ext build → web-ext-artifacts/
npm run sign:firefox    # needs AMO API keys; produces a signed .xpi
```

## Install — Chrome / Edge / Brave
1. Go to `chrome://extensions`, enable **Developer mode**.
2. **Load unpacked** → select the project folder (or drag the built `.zip`).

## Install — Firefox  (fixes "appears corrupt")
Release Firefox refuses to install an **unsigned** zip/xpi — that is the
"this add-on appears to be corrupt / could not be verified" message. Options:

- **Temporary (testing):** `about:debugging#/runtime/this-firefox` →
  **Load Temporary Add-on** → pick `manifest.json` (or the built `.zip`).
  Stays until you restart Firefox. Works unsigned.
- **Permanent:** sign it. `npm run sign:firefox` (or upload the zip to
  addons.mozilla.org). Requires the `browser_specific_settings.gecko.id`
  that is now in `manifest.json`. Install the resulting **signed `.xpi`**.
- Or use Firefox **Developer Edition / Nightly / ESR / unbranded** and set
  `xpinstall.signatures.required = false` in `about:config`.

> Requires Firefox **128+** (declarativeNetRequest header modification).

## How downloads work now
The popup finds the media URL, then hands the download to `background.js`.
The worker attaches `Referer` / `Origin` / `User-Agent` via
`declarativeNetRequest` (the browser strips these from `fetch()`), and the
browser's own download manager fetches the file. Open the **service-worker
console** (`chrome://extensions` → Xenon → *service worker*) to see
`[xenon:bg]` logs; the popup console shows `[xenon]` / `[xenon:http]` logs.

## Test checklist
For each site: paste a public link, pick a mode, click Download, confirm a
real media file lands in Downloads (open it — not an HTML/0-byte file).

| Site | Link to try | auto | audio | mute | Notes |
|------|-------------|:----:|:-----:|:----:|-------|
| Instagram | /reel/… , /p/… | ☐ | ☐ | ☐ | baseline (was working) |
| Facebook | /reel/… , /watch?v= | ☐ | ☐ | ☐ | log in to FB first for private/walled videos |
| TikTok | /@user/video/… | ☐ | ☐ | ☐ | header fix should clear 403s |
| Twitter/X | /user/status/… | ☐ | ☐ | ☐ | |
| Reddit | /r/…/comments/… | ☐ | — | ☐ | video+audio are separate streams |
| Pinterest | /pin/… | ☐ | — | ☐ | |
| Vimeo | /<id> | ☐ | ☐ | ☐ | |
| Tumblr | post link | ☐ | — | ☐ | |
| Streamable | streamable.com/<id> | ☐ | — | ☐ | |
| YouTube | /watch?v=… | ⚠ | ⚠ | ⚠ | see Known limits |
| Dailymotion / VK / Twitch / others | — | ☐ | ☐ | ☐ | HLS-only ones save a playlist, not a muxed file |

### What to check in the console on failure
- `[xenon:http] … failed → HTTP 4xx` — extraction blocked (login/geo/changed page).
- `[xenon:bg] rule …` missing — header rule wasn't applied.
- Popup shows `server refused (403)…` — CDN rejected even with headers
  (link expired / needs cookies).

## Known limits
- **YouTube**: most videos are signature-protected; deciphering needs
  `new Function`/`eval`, which MV3's CSP forbids. Unsigned/older videos work;
  signed ones report a clear error. A bundled JS-sandbox interpreter would be
  required to fully support YouTube in a store build.
- **HLS-only sites** (Dailymotion, some VK/Twitch/Bilibili/Rutube): the
  extractor returns an `.m3u8` playlist. The browser saves the playlist text,
  not a playable file — true support needs segment download + muxing (ffmpeg).
- Private/age-gated/region-locked posts need you to be **logged in** to that
  site in the same browser.
