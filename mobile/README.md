# iOS App

Capacitor-based iOS port of Cinarip.

## Features in this branch

- Responsive catalog UI reused from the desktop shell
- In-catalog TV season selection and queueing
- Native on-device storage in the app’s own `Downloads` folder (visible in Files)
- Direct SMB NAS connection via the built-in `MovieEngine` plugin (AMSMB2)
- Settings page for local subfolder, NAS host/share/path, credentials, and site login

## Requirements

- macOS with Xcode 15+
- CocoaPods (`gem install cocoapods`)
- Node.js 20+

## Setup

```bash
cd mobile
npm install
npm run ios
```

The first run will:

1. Sync the shared web UI from `../desktop`
2. Build the Capacitor web bundle into `mobile/www`
3. Add/sync the native iOS project
4. Open Xcode

## Configure storage

Open **Settings** in the app:

- **App download folder**: videos save to `Downloads` inside the app’s iPhone storage. Open it from Settings → **Open in Files** or in Files under **On My iPhone → Cinarip → Downloads**.
- **NAS connection**: enter host, share, remote folder, username, and password, then tap **Connect NAS** or **Test Write**.

iOS does not mount SMB shares system-wide like macOS Finder. The app connects directly over SMB using the credentials you save in Settings.

## Build in Xcode

1. Select the `App` target
2. Choose your iPhone simulator or device
3. Run

For device installs you will need an Apple Developer signing team.

## Project layout

```text
mobile/
  src/                  # iOS-specific HTML/JS/CSS
  www/                  # Generated web bundle (do not edit by hand)
  plugins/movie-engine/ # Native storage + SMB + scraper plugin
  ios/                  # Generated Xcode project after cap sync
```

## Notes

- Season search/scrape runs in a hidden native `WKWebView`
- Full FFmpeg download execution on iOS is not wired yet; queueing seasons works today
- Anime mode remains desktop-only
