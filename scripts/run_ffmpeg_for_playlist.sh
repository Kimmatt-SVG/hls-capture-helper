#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <playlist.m3u8-url> <output-file>" >&2
  exit 1
fi

PLAYLIST_URL="$1"
OUTPUT_FILE="$2"

ffmpeg \
  -hide_banner \
  -protocol_whitelist file,http,https,tcp,tls,crypto \
  -allowed_extensions ALL \
  -i "$PLAYLIST_URL" \
  -map 0 \
  -c copy \
  -bsf:a aac_adtstoasc \
  "$OUTPUT_FILE"
