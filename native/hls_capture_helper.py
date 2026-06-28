#!/usr/bin/env python3
import json
import os
import re
import signal
import struct
import subprocess
import sys
import time
import uuid
from pathlib import Path
from shutil import which
from urllib.parse import urlparse

FORWARDED_HEADER_NAMES = {
    "accept",
    "accept-language",
    "authorization",
    "cookie",
    "origin",
    "referer",
    "user-agent",
}
HEADER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9-]+$")
HTTP_URL_PATTERN = re.compile(r"https?://[^\s'\"<>]+", re.IGNORECASE)


def read_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    if len(raw_length) != 4:
        raise RuntimeError("Invalid native message length.")
    message_length = struct.unpack("@I", raw_length)[0]
    raw_message = sys.stdin.buffer.read(message_length)
    if len(raw_message) != message_length:
        raise RuntimeError("Incomplete native message.")
    return json.loads(raw_message.decode("utf-8"))


def write_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("@I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()


def safe_output_name(requested_name, url):
    if requested_name:
        name = requested_name
    else:
        parsed = urlparse(url)
        host = parsed.hostname or "stream"
        name = f"{host}-hls.mp4"

    name = re.sub(r"[^A-Za-z0-9._ -]+", "_", name).strip()
    if not name:
        name = "hls-stream.mp4"
    if not name.lower().endswith((".mp4", ".mkv", ".mov", ".ts")):
        name += ".mp4"
    return name


def safe_playlist_url(url):
    if not isinstance(url, str):
        return "[redacted playlist URL]"

    try:
        parsed = urlparse(url)
    except Exception:
        return "[redacted playlist URL]"

    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return "[redacted playlist URL]"

    path_parts = [part for part in parsed.path.split("/") if part]
    file_name = path_parts[-1] if path_parts else ""
    safe_path = f"/.../{file_name}" if file_name else "/"
    suffix = "?[redacted]" if parsed.query else ""
    return f"{parsed.scheme}://{parsed.netloc}{safe_path}{suffix}"


def safe_log_text(text):
    return HTTP_URL_PATTERN.sub(lambda match: safe_playlist_url(match.group(0)), str(text))


def redact_metadata_urls(data):
    if not isinstance(data, dict):
        return data

    redacted = dict(data)
    if isinstance(redacted.get("url"), str):
        redacted["url"] = safe_playlist_url(redacted["url"])
        redacted["urlRedacted"] = True
    return redacted


def find_ffmpeg():
    ffmpeg = which("ffmpeg")
    if ffmpeg:
        return ffmpeg

    for candidate in (
        "/opt/homebrew/bin/ffmpeg",
        "/usr/local/bin/ffmpeg",
        "/usr/bin/ffmpeg",
    ):
        if Path(candidate).is_file():
            return candidate

    return None


def output_directory():
    configured_dir = os.environ.get("HLS_CAPTURE_OUTPUT_DIR")
    if configured_dir:
        return Path(configured_dir).expanduser()
    return Path.home() / "Downloads" / "HLS Capture Helper"


def jobs_directory():
    return output_directory() / "jobs"


def should_forward_header(name):
    lower = name.lower()
    return lower in FORWARDED_HEADER_NAMES or lower.startswith("x-")


def request_headers(message):
    headers = message.get("headers")
    if not isinstance(headers, list):
        return []

    captured = []
    for header in headers:
        if not isinstance(header, dict):
            continue

        name = header.get("name")
        value = header.get("value")
        if not isinstance(name, str) or not isinstance(value, str):
            continue
        if not HEADER_NAME_PATTERN.match(name) or "\r" in value or "\n" in value:
            continue
        if not should_forward_header(name):
            continue

        captured.append({"name": name, "value": value})

    return captured


def ffmpeg_header_args(headers):
    args = []
    header_lines = []

    for header in headers:
        lower_name = header["name"].lower()
        if lower_name == "user-agent":
            args.extend(["-user_agent", header["value"]])
        elif lower_name == "referer":
            args.extend(["-referer", header["value"]])
        else:
            header_lines.append(f"{header['name']}: {header['value']}")

    if header_lines:
        args.extend(["-headers", "\r\n".join(header_lines) + "\r\n"])

    return args


def job_path(job_id):
    if not isinstance(job_id, str) or not re.match(r"^[A-Fa-f0-9-]{36}$", job_id):
        raise ValueError("Invalid job ID.")
    return jobs_directory() / f"{job_id}.json"


def read_json(path):
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with open(temp_path, "w", encoding="utf-8") as file:
        json.dump(redact_metadata_urls(data), file, indent=2)
    temp_path.replace(path)


def parse_progress_file(path):
    progress = {}
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as file:
            for line in file:
                key, separator, value = line.rstrip("\n").partition("=")
                if separator:
                    progress[key] = value
    except FileNotFoundError:
        pass
    return progress


def file_size(path):
    try:
        return Path(path).stat().st_size
    except OSError:
        return 0


def process_is_running(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def send_process_signal(pid, signal_number):
    try:
        os.killpg(pid, signal_number)
        return True
    except ProcessLookupError:
        return False
    except OSError:
        try:
            os.kill(pid, signal_number)
            return True
        except ProcessLookupError:
            return False


def wait_until_stopped(pid, timeout_seconds):
    deadline = time.time() + timeout_seconds
    while time.time() < deadline:
        if not process_is_running(pid):
            return True
        time.sleep(0.2)
    return not process_is_running(pid)


def tail_lines(path, max_lines=12):
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as file:
            return file.readlines()[-max_lines:]
    except OSError:
        return []


def status_for_job(message):
    job_id = message.get("jobId")
    metadata_path = job_path(job_id)
    metadata = read_json(metadata_path)
    progress = parse_progress_file(metadata["progressPath"])
    running = process_is_running(metadata.get("pid"))
    ended = progress.get("progress") == "end"
    requested_state = metadata.get("state")
    if ended:
        state = "finished"
    elif requested_state == "stopping" and running:
        state = "stopping"
    elif running:
        state = "running"
    else:
        state = "stopped"

    if state == "stopped":
        log_tail = "".join(tail_lines(metadata["logPath"])).lower()
        if any(token in log_tail for token in ("error", "403", "404", "forbidden")):
            state = "failed"

    metadata["state"] = state
    metadata["updatedAt"] = time.time()
    write_json(metadata_path, metadata)

    return {
        "ok": True,
        "jobId": job_id,
        "state": state,
        "pid": metadata.get("pid"),
        "outputPath": metadata.get("outputPath"),
        "logPath": metadata.get("logPath"),
        "progressPath": metadata.get("progressPath"),
        "outTime": progress.get("out_time") or progress.get("out_time_us"),
        "speed": progress.get("speed"),
        "totalSize": progress.get("total_size"),
        "outputSize": file_size(metadata.get("outputPath")),
        "lastLogLines": [
            safe_log_text(line.rstrip("\n")) for line in tail_lines(metadata["logPath"], 6)
        ],
    }


def stop_job(message):
    job_id = message.get("jobId")
    metadata_path = job_path(job_id)
    metadata = read_json(metadata_path)
    progress = parse_progress_file(metadata["progressPath"])
    pid = metadata.get("pid")

    if progress.get("progress") == "end":
        metadata["state"] = "finished"
        metadata["updatedAt"] = time.time()
        write_json(metadata_path, metadata)
        return status_for_job({"jobId": job_id})

    if not process_is_running(pid):
        metadata["state"] = "stopped"
        metadata["stoppedAt"] = time.time()
        metadata["updatedAt"] = time.time()
        write_json(metadata_path, metadata)
        return status_for_job({"jobId": job_id})

    metadata["state"] = "stopping"
    metadata["stopRequestedAt"] = time.time()
    metadata["updatedAt"] = time.time()
    write_json(metadata_path, metadata)

    debug_log(f"stop-requested: job: {job_id}; pid: {pid}")
    send_process_signal(pid, signal.SIGINT)
    stopped = wait_until_stopped(pid, 8)
    if not stopped:
        send_process_signal(pid, signal.SIGTERM)
        stopped = wait_until_stopped(pid, 2)

    metadata = read_json(metadata_path)
    metadata["state"] = "stopped" if stopped else "stopping"
    if stopped:
        metadata["stoppedAt"] = time.time()
    metadata["updatedAt"] = time.time()
    write_json(metadata_path, metadata)

    return status_for_job({"jobId": job_id})


def debug_log_path():
    try:
        directory = output_directory()
        directory.mkdir(parents=True, exist_ok=True)
        return directory / "native-helper.log"
    except Exception:
        return Path("/private/tmp/hls_capture_helper_native.log")


def debug_log(message):
    try:
        with open(debug_log_path(), "a", encoding="utf-8") as log:
            log.write(f"{safe_log_text(message)}\n")
    except Exception:
        pass


def main():
    debug_log("helper-started")
    try:
        message = read_message()
        if not message:
            debug_log("no-message")
            return
    except Exception as error:
        debug_log(f"read-error: {error}")
        write_message({"ok": False, "error": f"Invalid native message: {error}"})
        return
    debug_log(f"received-url: {safe_playlist_url(message.get('url'))}")
    headers = request_headers(message)
    debug_log(f"received-headers: {len(headers)}")

    action = message.get("action") or "start"
    if action == "status":
        try:
            write_message(status_for_job(message))
        except Exception as error:
            write_message({"ok": False, "error": str(error)})
        return
    if action == "stop":
        try:
            write_message(stop_job(message))
        except Exception as error:
            write_message({"ok": False, "error": str(error)})
        return
    if action != "start":
        write_message({"ok": False, "error": f"Unknown helper action: {action}"})
        return

    url = message.get("url")
    if not isinstance(url, str) or ".m3u8" not in url.lower():
        write_message({"ok": False, "error": "Expected an HLS .m3u8 URL."})
        return

    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        write_message(
            {"ok": False, "error": "Only http and https playlists are supported."}
        )
        return

    output_dir = output_directory()
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
    except Exception as error:
        debug_log(f"output-dir-error: {output_dir}: {error}")
        write_message(
            {
                "ok": False,
                "error": f"Could not create output directory {output_dir}: {error}",
            }
        )
        return

    output_path = output_dir / safe_output_name(message.get("outputName"), url)
    job_id = str(uuid.uuid4())
    jobs_directory().mkdir(parents=True, exist_ok=True)
    progress_path = jobs_directory() / f"{job_id}.progress"

    ffmpeg_path = find_ffmpeg()
    if not ffmpeg_path:
        debug_log("ffmpeg-not-found")
        write_message({"ok": False, "error": "ffmpeg was not found."})
        return
    debug_log(f"ffmpeg-path: {ffmpeg_path}")

    command = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "warning",
        "-protocol_whitelist",
        "file,http,https,tcp,tls,crypto",
        "-allowed_extensions",
        "ALL",
        *ffmpeg_header_args(headers),
        "-nostats",
        "-progress",
        str(progress_path),
        "-seg_max_retry",
        "3",
        "-i",
        url,
        "-map",
        "0:v?",
        "-map",
        "0:a?",
        "-dn",
        "-c",
        "copy",
        "-bsf:a",
        "aac_adtstoasc",
        str(output_path),
    ]

    log_path = output_path.with_suffix(output_path.suffix + ".log")
    try:
        log_file = open(log_path, "ab")
    except Exception as error:
        debug_log(f"log-file-error: {log_path}: {error}")
        write_message(
            {"ok": False, "error": f"Could not open log file {log_path}: {error}"}
        )
        return

    try:
        process = subprocess.Popen(
            command,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            env=os.environ.copy(),
        )
    except FileNotFoundError:
        debug_log(f"popen-file-not-found: {ffmpeg_path}")
        write_message(
            {"ok": False, "error": f"ffmpeg was not found at {ffmpeg_path}."}
        )
        return
    except Exception as error:
        debug_log(f"popen-error: {error}")
        write_message({"ok": False, "error": str(error)})
        return

    metadata = {
        "jobId": job_id,
        "pid": process.pid,
        "state": "running",
        "url": safe_playlist_url(url),
        "urlRedacted": True,
        "outputPath": str(output_path),
        "logPath": str(log_path),
        "progressPath": str(progress_path),
        "startedAt": time.time(),
        "updatedAt": time.time(),
    }
    write_json(job_path(job_id), metadata)

    debug_log(f"started-pid: {process.pid}; job: {job_id}; output: {output_path}")
    write_message(
        {
            "ok": True,
            "jobId": job_id,
            "pid": process.pid,
            "outputPath": str(output_path),
            "logPath": str(log_path),
            "progressPath": str(progress_path),
        }
    )


if __name__ == "__main__":
    main()
