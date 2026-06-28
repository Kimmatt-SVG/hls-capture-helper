#!/usr/bin/env bash
set -euo pipefail

TARGET_BROWSER="${1:-zen}"
HOST_DIRS=()

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
        echo "Automatic uninstall is only implemented for macOS and Linux." >&2
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
        echo "Automatic uninstall is only implemented for macOS and Linux." >&2
        exit 1
        ;;
    esac
    ;;
  *)
    echo "Usage: $0 [zen|firefox]" >&2
    exit 1
    ;;
esac

echo "Removing native messaging host files:"
for HOST_DIR in "${HOST_DIRS[@]}"; do
  for FILE_NAME in hls_capture_helper.json hls_capture_helper.py; do
    FILE_PATH="$HOST_DIR/$FILE_NAME"
    if [[ -e "$FILE_PATH" ]]; then
      rm "$FILE_PATH"
      echo "removed $FILE_PATH"
    else
      echo "not found $FILE_PATH"
    fi
  done
done

echo
echo "Reload or restart the browser to finish uninstalling the native helper."
