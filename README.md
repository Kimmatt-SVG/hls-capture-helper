# HLS Capture Helper

HLS Capture Helper is a developer Firefox/Zen extension for archiving HLS playlist URLs that your browser session is already authorized to load. It watches the active tab for `.m3u8` playlist requests, lists detected playlists in the popup, and prepares an FFmpeg command for each playlist.

This project is for lawful, authorized capture workflows only, such as saving your own streams, internal test content, or material you have explicit permission to archive. It does not bypass access controls, decrypt DRM, remove copy protection, or grant access to media your browser session cannot already fetch. DRM-protected streams are not supported.

## Requirements

- Zen Browser or Firefox with temporary extension loading from `about:debugging`.
- `ffmpeg` installed and available in `PATH` for copied commands and native helper runs.
- Python 3 for the optional native messaging helper.
- macOS or Linux for the provided native host install and uninstall scripts.

The native helper looks for `ffmpeg` in `PATH`, then common system locations including `/opt/homebrew/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, and `/usr/bin/ffmpeg`.

## Install The Extension

1. Open `about:debugging#/runtime/this-firefox` in Zen or Firefox.
2. Click `Load Temporary Add-on...`.
3. Select `manifest.json` from this folder.
4. Open the page that plays your authorized HLS video.
5. Start playback, then open the HLS Capture Helper popup.

Temporary extensions must be reloaded after browser restarts.

## Use Without Native Messaging

Click `Copy FFmpeg` for the playlist you want, then run the copied command in a terminal.

If session headers were captured, the copied command includes non-sensitive replay headers such as `Referer`, `Origin`, `User-Agent`, and `Accept`. It intentionally omits `Cookie`, `Authorization`, and `x-*` headers from copied commands by default. Use `Run Helper` when a site requires those sensitive session headers.

You can also use the wrapper script directly:

```bash
chmod +x scripts/run_ffmpeg_for_playlist.sh
scripts/run_ffmpeg_for_playlist.sh "https://example.edu/path/playlist.m3u8" "practice-video.mp4"
```

## Optional Native Helper

Firefox-compatible extensions cannot directly launch local programs. The `Run Helper` button uses Native Messaging to ask a local helper script to start FFmpeg.

Install the native host for Zen on macOS or Linux:

```bash
chmod +x scripts/install_native_host.sh
scripts/install_native_host.sh
```

The Zen target also writes a Mozilla compatibility manifest because Zen uses Firefox's native messaging lookup code. The installer copies the helper script into the native messaging directory and points the native messaging manifest at that installed copy.

For Firefox instead, run:

```bash
chmod +x scripts/install_native_host.sh
scripts/install_native_host.sh firefox
```

Then reload the temporary add-on from `about:debugging`.

## Output Directory

Native helper outputs are written to:

```text
~/Downloads/HLS Capture Helper/
```

Set `HLS_CAPTURE_OUTPUT_DIR` before launching the browser to use a different output directory:

```bash
export HLS_CAPTURE_OUTPUT_DIR="$HOME/Videos/HLS Capture Helper"
```

Each FFmpeg run also gets a `.log` file next to the output file. While the popup is open, `Run Helper` polls the native helper for live progress: state, media time, speed, output size, and the latest FFmpeg log line. Use `Stop` to ask FFmpeg to end the current job cleanly.

Job metadata and FFmpeg progress files are written under:

```text
~/Downloads/HLS Capture Helper/jobs/
```

The native helper also writes `native-helper.log` in the output directory when possible, or `/private/tmp/hls_capture_helper_native.log` as a fallback.

## Uninstall

To remove the native host for Zen:

```bash
chmod +x scripts/uninstall_native_host.sh
scripts/uninstall_native_host.sh
```

For Firefox instead, run:

```bash
chmod +x scripts/uninstall_native_host.sh
scripts/uninstall_native_host.sh firefox
```

Reload or restart the browser after uninstalling the native helper. You can also remove the temporary extension from `about:debugging`.

## Security Notes

- HLS Capture Helper only sees playlist requests from the active browser session, but those requests can include sensitive session context.
- The extension may forward selected headers to FFmpeg, including `Cookie`, `Referer`, `Origin`, `User-Agent`, `Authorization`, and `x-*` headers.
- Copied playlist URLs and copied FFmpeg commands can still contain signed or tokenized playlist URLs. Clear your clipboard after use if your environment shares clipboard history or syncs clipboards between devices.
- The native helper keeps forwarding sensitive headers to FFmpeg for authenticated downloads. While the helper redacts URLs in its own logs and job metadata, local process inspection tools may still expose FFmpeg command arguments while a job is running.
- FFmpeg logs, native helper logs, job metadata, terminal history, and shell scrollback may contain playlist URLs or other request details. Review logs before sharing them.
- Output files and logs are written to your local filesystem. Protect the output directory according to the sensitivity of the source material.
- Do not paste copied commands, logs, or generated job files into issue reports without removing cookies, authorization headers, signed URLs, and private hostnames.

## HLS Notes

- `master` playlists list variants or qualities.
- `media` playlists list the timed segment URLs.
- FFmpeg usually handles either, but a media playlist is the most direct target.
- Encrypted HLS only works when the playlist exposes keys your browser is authorized to fetch. DRM-protected streams are not supported.

## License

MIT. See `LICENSE`.
