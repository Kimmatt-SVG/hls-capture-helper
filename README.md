# HLS Capture Helper

HLS Capture Helper is a toolkit for saving authorized HTTP Live Streaming (HLS) media. It includes:

- a Firefox/Zen browser extension that detects `.m3u8` requests and builds FFmpeg commands;
- an optional native-messaging helper for authenticated streams; and
- a Windows Electron application with an embedded browser, download queues, movie and episodic workflows, anime mode, and local or NAS output.

> Use this project only for streams you own or have explicit permission to archive. It does not bypass DRM, decrypt protected media, or remove access controls. DRM-protected streams are unsupported.

## Features

- Detects HLS master and media playlists from browser traffic
- Preserves required browser-session headers for authorized downloads
- Selects and validates playable video variants before starting FFmpeg
- Downloads direct files or HLS streams to MP4
- Supports movie queues and season-based episode downloads
- Provides a separate anime-focused window with dub-first server selection
- Saves locally or to a configured Windows/NAS destination
- Tracks progress, speed, output size, failures, and FFmpeg diagnostics
- Filters popups and common advertising traffic in the embedded browser
- Builds installable and portable Windows executables

## Repository Layout

- `src/` — Firefox/Zen extension UI and request capture
- `native/` — Python native-messaging host
- `scripts/` — helper installation and FFmpeg wrapper scripts
- `desktop/` — Electron desktop application

## Desktop App (Windows)

### Requirements

- Windows 10 or later
- Node.js 20 or later
- FFmpeg and FFprobe available on `PATH`

Install FFmpeg with WinGet:

```powershell
winget install Gyan.FFmpeg
```

Restart the terminal after installation, then install dependencies:

```powershell
cd desktop
npm install
```

Run the movie application:

```powershell
npm start
```

Run the separate anime application:

```powershell
npm run start:anime
```

### Build Windows Packages

```powershell
cd desktop
npm run build
```

The NSIS installer and portable executable are written to `desktop/dist/`. Build artifacts are intentionally excluded from Git.

### NAS Configuration

Copy the example configuration and edit it for your environment:

```powershell
Copy-Item nas-config.example.json nas-config.json
```

You can also set:

```powershell
$env:NAS_PORTAL_URL = "https://nas.example.test/"
$env:NAS_VIDEO_FOLDER = "\\NAS\Media\Videos"
```

`desktop/nas-config.json` is machine-specific and ignored by Git.

### Desktop Workflow

1. Open a supported page in the embedded browser.
2. Start playback or open the site's authorized download controls.
3. For a movie, add it to the queue or start a direct download.
4. For a series, open a season/show page and scan the available episodes.
5. Choose local or NAS output and monitor progress in the activity panel.

The anime window uses its own persistent browser session and tries English-dub servers before subtitle servers when both are available.

## Browser Extension

### Requirements

- Firefox or Zen Browser
- FFmpeg on `PATH`
- Python 3 only when using the native helper

### Load Temporarily

1. Open `about:debugging#/runtime/this-firefox`.
2. Select **Load Temporary Add-on…**.
3. Choose this repository's `manifest.json`.
4. Open an authorized HLS video and begin playback.
5. Open the extension popup and copy the generated FFmpeg command.

Temporary add-ons are removed when the browser restarts.

### Native Helper

Browser extensions cannot launch FFmpeg directly. The native helper forwards the session headers required by authenticated streams:

```bash
# Zen (default)
scripts/install_native_host.sh

# Firefox
scripts/install_native_host.sh firefox
```

Uninstall with:

```bash
scripts/uninstall_native_host.sh
scripts/uninstall_native_host.sh firefox
```

Without the native helper, copied commands omit sensitive `Cookie`, `Authorization`, and `x-*` headers.

## Configuration

Useful environment variables include:

- `HLS_CAPTURE_OUTPUT_DIR` — override the local output directory
- `STREAM_SITE_HOME_URL` — override the desktop movie home URL
- `STREAM_SITE_URL` — fallback movie site URL
- `NAS_PORTAL_URL` — override the NAS portal address
- `NAS_VIDEO_FOLDER` — override the NAS video directory

Site navigation and anime embed allowlists live in `desktop/nav-config.json` and `desktop/anime-config.json`.

## Security and Privacy

- Playlist URLs may contain short-lived signatures or tokens.
- Request headers, FFmpeg logs, shell history, and local process inspection can expose session details.
- Never publish cookies, authorization headers, signed URLs, private hostnames, or NAS credentials.
- Review and redact diagnostics before attaching them to an issue.
- Protect downloaded media and configuration files according to their sensitivity.

## Troubleshooting

- **No stream appears:** start playback and wait for the player to request its playlist.
- **FFmpeg is missing:** restart the terminal after installation and verify `ffmpeg -version`.
- **HTTP 401/403:** refresh the page so the app captures a current token and session.
- **Only a `.log` remains:** FFmpeg rejected the stream; inspect the final lines for an HTTP, token, codec, or playlist error.
- **NAS write fails:** verify the UNC path, Windows credentials, and share permissions.
- **Anime server fails:** reload the episode; the app will try available dub servers first and then fall back.

## Development

There is no committed generated output. Before opening a pull request:

```powershell
cd desktop
npm install
npm run build
```

At minimum, run JavaScript syntax checks for changed source files and verify both `npm start` and `npm run start:anime`.

## License

MIT. See [LICENSE](LICENSE).
