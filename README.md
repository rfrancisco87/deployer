# Deployer

A native macOS menu bar app that surfaces Vercel deployment status in real time. Built with Electron.

![Deployer app preview](docs/app-preview.png)

## Features

- **Menu bar dot** — white triangle with a colored circle: green = ready, yellow = building, red = failed.
- **Live build timer** — while a build is in flight, the menu bar shows the elapsed build time, matching Vercel's dashboard (`ready − buildingAt` for completed deploys, `now − buildingAt` while live).
- **Drop-in notification card** — a small card slides down from the menu bar on every finished deploy with the project name, outcome, and duration. Click it to see the full details; or dismiss with the `✕` button. Auto-hide duration is configurable (10 s / 30 s / 60 s / stay until dismissed).
- **Deployments popup** — click the tray icon to see recent deployments across every watched project; expand a row to see the commit, branch, build duration, and quick-open buttons for the deployment, logs, commit, and the live URL.
- **Native notifications** — macOS notification on every terminal state transition.
- **Auto-update check** — Deployer polls GitHub Releases once a day and surfaces a native notification when a newer build is available. A manual **Check for updates** button in Settings covers the on-demand case.
- **Secure token storage** — your Vercel token lives in the macOS Keychain, never in plain text on disk.
- **Sleep-aware** — polling pauses when your Mac sleeps and resumes silently on wake (no notification storm).

## Requirements

- macOS 13 Ventura or later
- A Vercel account — **Hobby plan works**; any personal access token is enough
- For building from source: Node 20+ and Xcode Command Line Tools

## Install (end users)

The app is distributed unsigned — macOS Gatekeeper will block first launch. These steps get you running in under a minute.

1. **Grab the latest build** from the [Releases page](https://github.com/rfrancisco87/deployer/releases) (or the `release/` folder if you built it yourself). Pick one:
   - `Deployer-<version>-arm64.dmg` — Apple Silicon, recommended
   - `Deployer-<version>.dmg` — Intel
   - `.zip` variants also provided if you'd rather skip the DMG.
2. **Install the `.dmg`:** double-click it → drag `Deployer.app` onto the `Applications` shortcut → eject.
3. **Bypass Gatekeeper** (only required once, because the app isn't code-signed):
   ```bash
   xattr -dr com.apple.quarantine /Applications/Deployer.app
   open /Applications/Deployer.app
   ```

   Alternatively: right-click `Deployer.app` in Finder → **Open** → confirm the "unidentified developer" prompt.

After the first launch, Deployer runs like any normal macOS app — no terminal required.

## First-time setup

1. Click the Deployer icon in the menu bar → **Settings…**
2. Paste a Vercel personal access token. Create one at
   [vercel.com/account/tokens](https://vercel.com/account/tokens) — Hobby accounts have full API access.
3. Pick the projects you want to watch (or click **Select all**).
4. (Optional) Adjust the **Notification** duration and turn on **Launch Deployer at login**.

That's it. The tray dot updates on every poll (default: every 45 seconds; tunable in Settings).

### Settings reference

| Section | What it controls |
|---|---|
| **Vercel Token** | Save / clear the personal access token stored in the macOS Keychain. |
| **Projects** | Pick which projects to watch. **Select all** / **Deselect all** toggles every project at once; **Refresh** re-fetches the project list from Vercel. |
| **General → Check every** | Polling interval (20–600 s). Lower = faster updates, higher = gentler on Vercel's API. |
| **General → Notification** | How long the mini notification card stays on screen: 10 / 30 / 60 seconds, or **Stay until dismissed**. |
| **General → Launch Deployer at login** | Whether macOS auto-starts the app on login. |
| **Updates** | Shows the current installed version and a **Check for updates** button that queries GitHub Releases on demand. |

## Using the app

### Menu bar icon

| State       | Appearance                         |
|-------------|------------------------------------|
| Idle / no data | White triangle                   |
| Latest deploy READY | White triangle + green circle |
| Latest deploy BUILDING | White triangle + yellow circle + elapsed timer |
| Latest deploy ERROR | White triangle + red circle |
| Token missing/invalid | Triangle + red circle + `⚠` tooltip |

Once you've seen a deployment's details (via the notification card or by expanding it in the popup), the colored dot drops back to the plain triangle until the next transition.

### Interactions

- **Left-click the icon** — toggle the full deployments popup.
- **Right-click the icon** — small menu with "Show Deployments", "Settings…", "Quit".
- **Notification card** (appears on each new terminal deploy) — click the card to jump straight into the focused detail view, or click the `✕` to dismiss without opening the popup.

### Updates

Deployer checks GitHub Releases ~30 s after launch and then once every 24 h. If a newer tag is published, you'll get a native macOS notification ("Deployer vX.Y.Z is available") — click it to open the release page and download the new DMG. You can also trigger a check manually via **Settings → Updates → Check for updates**. Installing the new build is the same as the first install (drag the DMG contents to `/Applications`, overwriting the old app).

## Build from source

```bash
git clone https://github.com/rfrancisco87/deployer.git
cd deployer
npm install
npm start              # builds + launches with Electron
```

Hot-rebuild loop:

```bash
npm run build          # one-shot TS + asset copy
npm run dev            # alias of `start`
```

### Packaging your own build

```bash
npm run package        # produces .dmg + .zip for both arm64 and x64
```

`electron-builder` rebuilds native modules for the target architecture automatically. Output lands in `release/`:

- `Deployer-<version>-arm64.dmg` / `Deployer-<version>.dmg`
- `Deployer-<version>-arm64-mac.zip` / `Deployer-<version>-mac.zip`
- `release/mac-arm64/Deployer.app` / `release/mac/Deployer.app` — the raw bundles, if you'd rather skip distribution formats.

**Python note:** `dmg-builder` calls a binary named `python` (not `python3`). The `scripts/shims/python` symlink in the repo forwards to `python3`, and the `package` npm script prepends it to `PATH` automatically — no system-wide change required.

### Regenerating tray icons

The tray PNGs are generated from code (no binary assets in `src/`) so tweaks are version-controlled. After changing [scripts/generate-tray-icons.js](scripts/generate-tray-icons.js):

```bash
node scripts/generate-tray-icons.js
npm run build
```

## Known caveats

- **Arc browser** — Arc has quirks with `open <url>`: external URL opens sometimes go to "Little Arc" or only activate the window without navigating. Deployer detects Arc as the default browser and uses Arc's AppleScript interface instead, which opens a new tab in Arc's front window.
- **Unsigned binary** — the app isn't code-signed (no paid Apple Developer account), hence the one-time Gatekeeper bypass. The source is public if you'd rather build it yourself.
- **Keychain prompts on first use** — macOS may prompt once to allow Deployer to access your keychain entry for the Vercel token.

## Open source

Free and open. Contributions welcome — fork, branch, PR. Keep changes small and focused; this is a personal tool first and a product second.

## License

MIT — Copyright © 2026 Roberto Francisco
