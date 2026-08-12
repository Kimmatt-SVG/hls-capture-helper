# Movie Stream Downloader

Movie Stream Downloader is a Windows desktop application for organizing and saving authorized movie, television, and anime streams. It combines an embedded browser with movie queues, season and episode scanning, a dedicated anime mode, and local or NAS library output.

The project uses FFmpeg for validated HLS capture and supports direct-file downloads when available. This repository also includes the original HLS Capture Helper browser extension and its optional native-messaging helper.

> Use this project only for streams you own or have explicit permission to archive. It does not bypass DRM, defeat access controls, or remove copy protection. DRM-protected streams are not supported.

## Contents

- [Features](#features)
- [How It Works](#how-it-works)
- [Repository Layout](#repository-layout)
- [Desktop App Quick Start](#desktop-app-quick-start)
- [Movie Mode](#movie-mode)
- [Anime Mode](#anime-mode)
- [TV and Episode Downloads](#tv-and-episode-downloads)
- [Local and NAS Output](#local-and-nas-output)
- [Configuration](#configuration)
- [Build Windows Packages](#build-windows-packages)
- [Build macOS Packages](#build-macos-packages)
- [Build iOS App](#build-ios-app)
- [Browser Extension](#browser-extension)
- [Native Helper](#native-helper)
- [Architecture](#architecture)
- [Logs and Diagnostics](#logs-and-diagnostics)
- [Troubleshooting](#troubleshooting)
- [Security and Privacy](#security-and-privacy)
- [Development](#development)
- [License](#license)

## Features

### Desktop application

- Embedded Chromium browser powered by Electron
- Separate movie and anime windows with independent persistent sessions
- HLS master/media playlist detection from browser network traffic
- Direct-download discovery for supported pages
- Stream validation with FFprobe before FFmpeg starts
- Automatic quality selection from available HLS variants
- Session-header, cookie, origin, and referer forwarding
- Session-backed local HLS proxy for streams FFmpeg cannot fetch directly
- Movie download queue with fresh-link generation
- Season and episode scanning
- English-dub-first anime server selection
- Local Windows and UNC/NAS destinations
- Download progress, speed, elapsed time, output size, and error reporting
- Incomplete-file cleanup and per-download FFmpeg diagnostics
- Popup blocking and configurable navigation allowlists
- NSIS installer and portable Windows builds

### Firefox/Zen extension

- Detects `.m3u8` requests in the active tab
- Lists captured master and media playlists
- Generates FFmpeg commands with safe replay headers
- Supports an optional native-messaging host for authenticated streams
- Reports native-helper job status and progress

## How It Works

HLS video is delivered as one or more `.m3u8` playlists:

- A **master playlist** advertises available resolutions and bitrates.
- A **media playlist** lists the video and audio segments for one rendition.

The desktop app watches requests made by its embedded browser. When it sees a playlist, it records the URL and the request context needed to replay it. Before downloading, the app:

1. collects candidate playlists;
2. resolves nested master playlists;
3. rejects image previews and invalid media;
4. probes candidates with FFprobe;
5. chooses the best playable rendition;
6. forwards the browser session context; and
7. launches FFmpeg to remux the media into MP4.

Some providers expose stream URLs that only work from the active browser session. For those URLs, the app can start a loopback HLS proxy on `127.0.0.1`. FFmpeg talks to the local proxy, while the proxy fetches playlists and segments through Electron's authenticated session and rewrites nested URLs.

Direct media files use a separate HTTP downloader with redirect, resume, progress, and expired-link handling.

## Repository Layout

```text
hls-capture-helper/
├── README.md                  # Main project documentation
├── LICENSE
├── manifest.json              # Firefox/Zen extension manifest
├── src/                       # Extension background and popup code
├── native/                    # Python native-messaging helper
├── scripts/                   # Helper install/uninstall and FFmpeg scripts
└── desktop/
    ├── main.js                # Electron main process and orchestration
    ├── preload.js             # Safe renderer IPC bridge
    ├── shell.html             # Desktop application shell
    ├── shell.css
    ├── shell.js
    ├── package.json
    ├── anime-config.json      # Anime profile and embed allowlist
    ├── nav-config.json        # Movie navigation policy
    ├── nas-config.example.json
    └── lib/
        ├── aniwave-scraper.js
        ├── ffmpeg-runner.js
        ├── hls-capture.js
        ├── hls-quality.js
        ├── session-hls-proxy.js
        ├── tv-show-runner.js
        └── ...                # Queue, auth, NAS, artwork, and site modules
```

Generated installers, unpacked applications, downloaded media, runtime logs, credentials, and machine-specific NAS settings are excluded from Git.

## Desktop App Quick Start

### Requirements

- Windows 10 or later
- Node.js 20 or later
- npm
- FFmpeg and FFprobe available on `PATH`

Install FFmpeg with WinGet:

```powershell
winget install Gyan.FFmpeg
```

Restart PowerShell after installation, then confirm both tools are available:

```powershell
ffmpeg -version
ffprobe -version
```

Clone the repository and install desktop dependencies:

```powershell
git clone https://github.com/Gish-sp/hls-capture-helper.git
cd hls-capture-helper\desktop
npm install
```

Start movie mode:

```powershell
npm start
```

Start anime mode:

```powershell
npm run start:anime
```

The two modes are separate Electron processes and use different persistent browser partitions:

- movie mode: `persist:stream-browser`
- anime mode: `persist:anime-browser`

This separation prevents movie and anime cookies, history, and site state from interfering with each other.

## Movie Mode

Movie mode is the default application launched by `npm start`.

### Typical movie workflow

1. Search for a title in the application.
2. Open the title in the embedded browser.
3. Use an authorized site download control or begin playback.
4. Allow the app to capture a fresh direct or HLS URL.
5. Download immediately or add the title to the queue.
6. Select local or NAS output.
7. Monitor progress from the download/activity panel.

### Download queue

Queued items store page metadata rather than relying permanently on short-lived media links. When an item starts, the app revisits its page and attempts to generate a fresh URL. This helps with signed links that expire between queue creation and download time.

The queue runner detects common retryable conditions, including:

- expired tokens;
- HTTP 401, 403, and 416 responses;
- interrupted connections;
- connection resets; and
- request timeouts.

## Anime Mode

Anime mode is launched with:

```powershell
npm run start:anime
```

It provides a focused interface without the movie queue controls. The configured profile opens the anime search/home site, recognizes series watch URLs, scans episodes, and downloads each episode separately.

### Typical anime workflow

1. Search for a series.
2. Open any episode or the series watch page.
3. Select **Scan** to collect the available episodes.
4. Review the detected season and episode count.
5. Start the local or NAS download.

### Audio and server priority

When both audio types exist, the downloader tries servers in this order:

1. English dub servers
2. Subtitle servers

Within each audio group, configured providers are attempted in priority order. If a server does not expose a playable stream within the timeout, the app moves to the next one.

Anime mode detects embed iframes, waits for player initialization, captures HLS traffic, and can extract a player source from the iframe as a fallback.

## TV and Episode Downloads

The episode workflow scans the current page and creates a normalized plan containing:

- show title;
- season number;
- episode title;
- episode number; and
- episode page URL.

Episodes are written using a media-library-friendly structure:

```text
Show Name/
└── Season 01/
    ├── S01E01 - Episode 1.mp4
    ├── S01E02 - Episode 2.mp4
    └── S01E03 - Episode 3.mp4
```

Movie-mode television downloads may include a `TV Shows` content folder. Anime mode writes the show folder directly beneath the configured anime/local or NAS root.

Each episode is loaded independently so the app can obtain a current stream URL and session context. A failed episode is recorded without discarding episodes that already completed successfully.

## Local and NAS Output

### Local output

Unless overridden, desktop output is stored beneath the current Windows user's Videos folder:

```text
%USERPROFILE%\Videos\Movies\
%USERPROFILE%\Videos\Anime\
```

Set a custom local root before starting the app:

```powershell
$env:HLS_CAPTURE_OUTPUT_DIR = "D:\Media\Captures"
npm start
```

### NAS output

Create a machine-local configuration from the example:

```powershell
cd desktop
Copy-Item nas-config.example.json nas-config.json
```

Edit `nas-config.json`:

```json
{
  "portalUrl": "https://nas.example.test/",
  "videoFolder": "\\\\NAS\\Media\\Videos"
}
```

The local `nas-config.json` file is intentionally ignored by Git. Do not commit private hostnames, addresses, shares, usernames, or passwords.

Environment variables override the JSON file:

```powershell
$env:NAS_PORTAL_URL = "https://nas.example.test/"
$env:NAS_VIDEO_FOLDER = "\\NAS\Media\Videos"
```

If Windows cannot write to the UNC share, the app prompts for NAS credentials and attempts to establish the share connection. The account must have permission to create folders and files beneath the configured video folder.

On macOS, use one of these `videoFolder` formats in `nas-config.json`:

```json
{
  "portalUrl": "https://nas.example.test/",
  "videoFolder": "/Volumes/Media/Videos"
}
```

Or let the app mount the share when you sign in:

```json
{
  "portalUrl": "https://nas.example.test/",
  "videoFolder": "smb://NAS.local/Media/Videos"
}
```

Windows-style UNC paths also work on macOS (`\\\\NAS\\Media\\Videos`). You can mount the share first in Finder with **Go → Connect to Server** (`Cmd+K`, then `smb://NAS.local/Media`) and point `videoFolder` at the mounted path under `/Volumes`.

## Configuration

### Environment variables

- `HLS_CAPTURE_OUTPUT_DIR` — overrides the local media root
- `STREAM_SITE_HOME_URL` — overrides the movie profile home page
- `STREAM_SITE_URL` — fallback movie site URL
- `NAS_PORTAL_URL` — overrides the configured NAS portal
- `NAS_VIDEO_FOLDER` — overrides the configured NAS/UNC output path
- `NAS_USERNAME` — optional NAS username
- `NAS_PASSWORD` — optional NAS password

Environment variables should be set in the same terminal that launches Electron.

### Navigation policy

`desktop/nav-config.json` controls:

- allowed movie-mode domains; and
- popup blocking.

The navigation guard prevents the embedded browser from leaving the configured provider and required authentication/media domains.

### Anime profile

`desktop/anime-config.json` controls:

- the anime home URL;
- the search path template; and
- allowed player/embed domains.

When providers change domains, this allowlist may need to be updated before their iframes can load.

### Runtime credentials

Site and NAS credentials saved through the UI are stored under Electron's application data directory, not in this repository. They are currently persisted as local JSON files. Protect your Windows account and application-data directory accordingly, and never attach those files to issues.

## Build Windows Packages

Install dependencies and run Electron Builder:

```powershell
cd desktop
npm install
npm run build
```

The build creates:

- an NSIS installer; and
- a portable x64 executable.

Output is written to:

```text
desktop\dist\
```

Build artifacts are excluded from version control. If a build reports that `dist\win-unpacked\resources\app.asar` is in use, close any running packaged copy of the application or build into a temporary output directory:

```powershell
npx electron-builder --win --config.directories.output=dist-check
```

The package is currently unsigned, so Windows may display a SmartScreen warning.

## Build macOS Packages

Install dependencies and run Electron Builder on macOS:

```bash
cd desktop
npm install
npm run build:mac
```

This creates an unsigned Apple Silicon DMG in:

```text
desktop/dist/
```

Other macOS build targets:

```bash
npm run build:mac:intel   # Intel (x64) DMG
npm run build:mac:all     # Both Apple Silicon and Intel DMGs
npm run build:dmg         # Alias for build:mac
```

Requirements:

- macOS host machine
- FFmpeg on `PATH` (for example via Homebrew: `brew install ffmpeg`)

The package is currently unsigned, so macOS Gatekeeper may block the app on first launch. Open **System Settings → Privacy & Security** and choose **Open Anyway**, or right-click the app and choose **Open**.

If a build reports that `dist/mac*/Movie Stream Downloader.app` is in use, close any running packaged copy or build into a temporary output directory:

```bash
npx electron-builder --mac --config.directories.output=dist-check
```

## Build iOS App

The iOS port lives in `mobile/` and uses Capacitor with a native SMB/storage plugin.

```bash
cd mobile
npm install
npm run ios
```

This syncs the shared catalog UI from `desktop/`, generates `mobile/www`, and opens the Xcode project.

### iOS storage and NAS

- **Local downloads** are saved inside the app Documents folder (`On My iPhone → Movie Stream Downloader → Movies` by default).
- **NAS access** uses direct SMB from the app. Open **Settings**, enter NAS host/share/path plus username and password, then tap **Connect NAS** or **Test Write**.
- iOS does not mount SMB shares system-wide like macOS Finder, so the app connects manually over SMB.

See [mobile/README.md](mobile/README.md) for full iOS setup notes.

## Browser Extension

### Requirements

- Firefox or Zen Browser
- FFmpeg on `PATH`
- Python 3 only when using the native helper

### Temporary installation

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose the repository's `manifest.json`.
4. Open an authorized HLS video.
5. Start playback.
6. Open the HLS Capture Helper popup.
7. Copy the generated FFmpeg command or use the native helper.

Temporary add-ons are removed when the browser restarts and must be reloaded from `about:debugging`.

### Copied FFmpeg commands

Commands copied from the extension include safe replay headers such as:

- `Referer`
- `Origin`
- `User-Agent`
- `Accept`

Sensitive headers such as `Cookie`, `Authorization`, and custom `x-*` values are intentionally omitted from clipboard commands. Use the native helper when an authorized stream requires those headers.

## Native Helper

Browser extensions cannot launch local programs directly. The Python native-messaging helper receives requests from the extension and starts FFmpeg outside the browser.

Install for Zen:

```bash
scripts/install_native_host.sh
```

Install for Firefox:

```bash
scripts/install_native_host.sh firefox
```

Uninstall:

```bash
scripts/uninstall_native_host.sh
scripts/uninstall_native_host.sh firefox
```

The helper checks common FFmpeg paths and supports `HLS_CAPTURE_OUTPUT_DIR`.

Native-helper output defaults to:

```text
~/Downloads/HLS Capture Helper/
```

It writes job metadata, progress data, media output, and logs under the output directory.

## Architecture

### Electron process boundary

`desktop/main.js` owns privileged operations:

- BrowserWindow and BrowserView creation
- webRequest stream capture
- file and directory access
- FFmpeg/FFprobe child processes
- NAS access
- credentials
- download queues
- IPC handlers

`desktop/preload.js` exposes a limited `contextBridge` API. The renderer in `shell.js` uses that API rather than importing Node.js modules directly.

### Stream capture and validation

- `hls-capture.js` records playlist URLs and selected request headers.
- `hls-quality.js` resolves variants and ranks playable candidates.
- `segment-probe.js` checks segment content and rejects image previews.
- `stream-probe.js` runs FFprobe and validates codecs/resolution.
- `ffmpeg-runner.js` launches FFmpeg, tracks progress, retries output strategies, and removes incomplete files.
- `session-hls-proxy.js` proxies authenticated playlists and segments through Electron.

### Site and episode automation

- `site-profiles.js` defines movie and anime runtime profiles.
- `navigation-guard.js` enforces allowed domains and popup behavior.
- `tornado-download-scraper.js` discovers supported direct-download links.
- `tv-show-scraper.js` normalizes season and episode information.
- `aniwave-scraper.js` scans anime episodes and controls available stream servers.
- `tv-show-runner.js` processes episodes sequentially and preserves partial success.

### Downloads and library management

- `direct-http-download.js` handles direct files.
- `download-queue.js` stores queue state.
- `queue-runner.js` refreshes links and runs queued items.
- `download-library.js` indexes completed output.
- `artwork.js`, `poster-utils.js`, and `library-sync.js` manage related media metadata.

## Logs and Diagnostics

### Desktop activity log

The UI activity panel reports page loading, stream capture, server selection, probes, download progress, and failures.

The persistent debug log is stored beneath Electron's user-data directory:

```text
%APPDATA%\movie-stream-downloader\stream-debug.log
```

### FFmpeg logs

Each FFmpeg job writes:

```text
<output-file>.mp4.log
```

Failed jobs remove incomplete media. Depending on the failure and cleanup path, diagnostic logs may remain for investigation.

Before sharing logs, remove:

- cookies and authorization headers;
- signed/tokenized URLs;
- private hostnames and IP addresses;
- NAS paths;
- usernames; and
- media titles you do not want disclosed.

## Troubleshooting

### FFmpeg or FFprobe is not found

Verify both commands:

```powershell
ffmpeg -version
ffprobe -version
```

If WinGet just installed FFmpeg, restart PowerShell and the desktop app.

### No HLS stream is detected

- Start actual video playback.
- Wait several seconds for the player to request its playlist.
- Try another quality or server.
- Confirm the player iframe domain is present in the appropriate allowlist.
- Disable VPN/network switching while a signed stream is being captured.

### HTTP 401 or 403

The playlist or segment URL may be tied to a short-lived token, cookie, referer, or IP address.

- Reload the content page.
- Start playback again.
- Generate a fresh link.
- Avoid changing VPN/WARP state during a download.

### Invalid data found when processing input

This usually means FFmpeg received an HTML error page, an encrypted provider response, an image preview, or an expired playlist rather than playable media.

The app validates streams before download and uses the session HLS proxy for supported embed CDNs. Inspect `aniwave-probe`, `diagnose`, or FFmpeg log entries for the rejected URL and provider.

### Only `.log` files appear

FFmpeg started but could not produce valid output. The app removes the incomplete MP4. Inspect the last lines of the corresponding log for:

- HTTP errors;
- invalid playlist data;
- expired tokens;
- unsupported codecs; or
- interrupted connections.

### Anime episodes do not start

- Reload the episode page.
- Confirm the server list appears.
- Allow the player iframe to initialize.
- Try a different dub server.
- If no dub server works, allow the automatic subtitle fallback.
- Update `anime-config.json` if an embed provider changed domains.

### NAS access fails

- Confirm the path starts with `\\`.
- Test the share in Windows Explorer.
- Verify the NAS is online.
- Confirm the configured account can create files and folders.
- Remove stale Windows share sessions if credentials changed.
- Check `NAS_VIDEO_FOLDER` for an environment-variable override.

### Build cannot replace `app.asar`

A running packaged app has locked the file. Close the app or use a different build output directory.

### MaxListenersExceededWarning

Electron may warn when repeated navigation installs more listeners than the default threshold. The warning does not necessarily stop downloads, but persistent growth should be treated as a lifecycle bug and investigated before long unattended runs.

## Security and Privacy

- Playlist URLs can contain bearer tokens and signed query strings.
- Browser requests may include cookies, authorization values, and provider-specific headers.
- FFmpeg command lines can be visible to local process-inspection tools.
- Logs and shell history can retain private URLs.
- Saved site/NAS credentials are sensitive local files.
- Machine-specific configuration must remain outside Git.
- The loopback HLS proxy binds only to `127.0.0.1` and exists for the active app session.
- Never publish captured URLs or headers without redaction.
- Protect downloaded media according to its source and licensing requirements.

The project does not implement DRM circumvention. Encrypted HLS is supported only when ordinary HLS key requests are available to the already-authorized browser session and are not protected by a DRM system.

## Development

### Install

```powershell
cd desktop
npm install
```

### Run both profiles

```powershell
npm start
npm run start:anime
```

### JavaScript syntax checks

From the repository root:

```powershell
Get-ChildItem -Recurse -Filter *.js |
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\dist\\' } |
  ForEach-Object { node --check $_.FullName }
```

### Packaging check

```powershell
cd desktop
npx electron-builder --win --config.directories.output=dist-check
```

### Pull request checklist

- Keep generated output out of Git.
- Do not commit `desktop/nas-config.json`.
- Do not commit credentials, tokens, logs, or downloaded media.
- Run syntax checks.
- Launch movie and anime modes.
- Verify local output.
- Verify NAS behavior when changing NAS code.
- Build the Windows installer and portable executable, or the macOS DMG when changing packaging.
- Update this root README when behavior or configuration changes.

## License

MIT. See [LICENSE](LICENSE).
