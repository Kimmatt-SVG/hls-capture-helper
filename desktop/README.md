# Movie Stream Downloader

The Windows desktop client for HLS Capture Helper. It combines an embedded browser with stream detection, FFmpeg downloads, queues, episodic scanning, local/NAS output, and a separate anime-focused mode.

See the [project README](../README.md) for features, security guidance, configuration, and extension documentation.

## Requirements

- Windows 10 or later
- Node.js 20 or later
- FFmpeg and FFprobe on `PATH`

```powershell
winget install Gyan.FFmpeg
npm install
```

Restart the terminal after installing FFmpeg.

## Run

Movie mode:

```powershell
npm start
```

Anime mode:

```powershell
npm run start:anime
```

Anime mode uses a separate persistent browser session and prioritizes English-dub servers where available.

## Configure NAS Output

```powershell
Copy-Item nas-config.example.json nas-config.json
```

Edit `nas-config.json` with your portal URL and UNC video path. The local file is ignored by Git. Environment variables take precedence:

```powershell
$env:NAS_PORTAL_URL = "https://nas.example.test/"
$env:NAS_VIDEO_FOLDER = "\\NAS\Media\Videos"
```

## Build

Create both the Windows installer and portable executable:

```powershell
npm run build
```

Build output is written to `dist/` and excluded from version control.

## Usage Notes

- The app only downloads media that its browser session is authorized to access.
- HLS candidates are validated before FFmpeg starts.
- Direct files and HLS streams use different download paths.
- Failed captures leave diagnostics for troubleshooting and remove incomplete media.
- DRM-protected streams are unsupported.

Use this software only for media you own or have explicit permission to archive.
