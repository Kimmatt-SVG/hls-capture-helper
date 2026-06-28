#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HELPER_PATH="$ROOT_DIR/native/hls_capture_helper.py"
TEMPLATE_PATH="$ROOT_DIR/native/manifest.template.json"
TARGET_BROWSER="${1:-zen}"
HOST_DIRS=()

if [[ ! -f "$HELPER_PATH" ]]; then
  echo "Missing helper: $HELPER_PATH" >&2
  exit 1
fi

chmod +x "$HELPER_PATH"

case "$TARGET_BROWSER" in
  zen)
    case "$(uname -s)" in
      Darwin)
        HOST_DIRS=(
          "$HOME/Library/Application Support/zen/NativeMessagingHosts"
          "$HOME/Library/Application Support/Mozilla/NativeMessagingHosts"
        )
        ;;
      Linux)
        HOST_DIRS=(
          "$HOME/.zen/native-messaging-hosts"
          "$HOME/.mozilla/native-messaging-hosts"
        )
        ;;
      *)
        echo "Automatic install is only implemented for macOS and Linux." >&2
        exit 1
        ;;
    esac
    ;;
  firefox)
    case "$(uname -s)" in
      Darwin)
        HOST_DIRS=("$HOME/Library/Application Support/Mozilla/NativeMessagingHosts")
        ;;
      Linux)
        HOST_DIRS=("$HOME/.mozilla/native-messaging-hosts")
        ;;
      *)
        echo "Automatic install is only implemented for macOS and Linux." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Usage: $0 [zen|firefox]" >&2
    exit 1
    ;;
esac

echo "Installed native messaging host:"
for HOST_DIR in "${HOST_DIRS[@]}"; do
  mkdir -p "$HOST_DIR"
  INSTALLED_HELPER_PATH="$HOST_DIR/hls_capture_helper.py"
  MANIFEST_PATH="$HOST_DIR/hls_capture_helper.json"
  cp "$HELPER_PATH" "$INSTALLED_HELPER_PATH"
  chmod +x "$INSTALLED_HELPER_PATH"
  sed "s#__HELPER_PATH__#$INSTALLED_HELPER_PATH#g" "$TEMPLATE_PATH" > "$MANIFEST_PATH"
  echo "$MANIFEST_PATH"
done
echo
echo "Make sure ffmpeg is installed and available in PATH."
