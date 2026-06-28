# HLS Capture Helper

A developer Firefox/Zen extension for archiving HLS (`.m3u8`) playlists your browser session is **already authorized to load**. It watches the active tab for playlist requests, lists them in the popup, and builds an FFmpeg command for each one.

> For lawful, authorized capture only — your own streams, internal test content, or material you have explicit permission to archive. It does **not** bypass access controls, decrypt DRM, or remove copy protection. DRM-protected streams are not supported.

## Prerequisites

- **Zen Browser or Firefox** (supports temporary add-on loading via `about:debugging`).
- **`ffmpeg`** installed and on your `PATH`.
- **Python 3** — only if you want the optional native helper (the `Run Helper` button).
- **macOS or Linux** — only for the native helper install scripts.

## Quick Start

1. Open `about:debugging#/runtime/this-firefox` in Zen or Firefox.
2. Click **Load Temporary Add-on…** and select `manifest.json` from this folder.
3. Open the page with your authorized HLS video and start playback.
4. Open the **HLS Capture Helper** popup — detected playlists appear in the list.
5. Click **Copy FFmpeg** next to a playlist, then paste and run the command in a terminal.

That's the whole flow. The copied command includes safe replay headers (`Referer`, `Origin`, `User-Agent`, `Accept`) and intentionally omits sensitive ones (`Cookie`, `Authorization`, `x-*`).

> Temporary add-ons are removed when the browser restarts — reload from `about:debugging` after a restart.

### Alternative: wrapper script

You can skip the copy step and run a playlist directly:

```bash
scripts/run_ffmpeg_for_playlist.sh "https://example.edu/path/playlist.m3u8" "practice-video.mp4"
```

## Optional: Native Helper

Browser extensions can't launch local programs, so the **`Run Helper`** button uses Native Messaging to ask a local script to start FFmpeg. This is what you need when a site requires the **sensitive** session headers (`Cookie`, `Authorization`, `x-*`) that copied commands omit.

Install it (the script copies the helper into the browser's native-messaging directory and points the manifest at it):

```bash
# Zen (default)
scripts/install_native_host.sh

# Firefox
scripts/install_native_host.sh firefox
```

Then reload the temporary add-on from `about:debugging`. Make sure `ffmpeg` is on your `PATH` — the helper also checks `/opt/homebrew/bin`, `/usr/local/bin`, and `/usr/bin`.

### Uninstall

```bash
# Zen (default)
scripts/uninstall_native_host.sh

# Firefox
scripts/uninstall_native_host.sh firefox
```

Reload or restart the browser afterward, and remove the temporary add-on from `about:debugging` if desired.

## Output & Progress

Native helper output goes to `~/Downloads/HLS Capture Helper/`. Override it before launching the browser:

```bash
export HLS_CAPTURE_OUTPUT_DIR="$HOME/Videos/HLS Capture Helper"
```

- Each run gets a `.log` file next to its output.
- While the popup is open, `Run Helper` shows live progress (state, media time, speed, size, latest log line). **Stop** ends a job cleanly.
- Job metadata and progress files live under `~/Downloads/HLS Capture Helper/jobs/`.
- The helper writes `native-helper.log` to the output directory, falling back to `/private/tmp/hls_capture_helper_native.log`.

## Security Notes

- Playlist requests can carry sensitive session context. The native helper forwards headers like `Cookie`, `Referer`, `Origin`, `User-Agent`, `Authorization`, and `x-*` to FFmpeg for authenticated downloads.
- Copied URLs and commands can contain signed/tokenized playlist URLs. Clear your clipboard after use if you sync clipboard history across devices.
- The helper redacts URLs in its own logs and job metadata, but local process tools may still expose FFmpeg arguments while a job runs.
- FFmpeg logs, helper logs, job metadata, and shell history may contain playlist URLs. Review before sharing.
- Protect the output directory according to the sensitivity of the source material.
- Never paste copied commands, logs, or job files into issue reports without stripping cookies, authorization headers, signed URLs, and private hostnames.

## HLS Notes

- A **master** playlist lists variants/qualities; a **media** playlist lists the timed segment URLs.
- FFmpeg handles either, but a media playlist is the most direct target.
- Encrypted HLS works only when the playlist exposes keys your browser is authorized to fetch. DRM-protected streams are not supported.

## License

MIT. See `LICENSE`.
