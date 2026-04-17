# Deployer

A native macOS menu bar app that surfaces Vercel deployment status in real time. Built with Electron.

![Deployer app preview](docs/app-preview.png)

## Features

- **Menu Bar Status** — Glanceable colored icon showing deployment status (green = ready, yellow = building, red = error)
- **Native Notifications** — Get notified when deployments complete or fail
- **One-Click Access** — Open deployment logs directly from the menu
- **Secure Token Storage** — Vercel token stored securely in macOS Keychain
- **Project Selection** — Choose which projects to watch

## Requirements

- macOS 13 Ventura or later
- Vercel account with a personal access token

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/rfrancisco87/deployer.git
   cd deployer
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Build the application:
   ```bash
   npm run build
   ```

4. Run in development mode:
   ```bash
   npm run dev
   ```

5. To create a distributable package:
   ```bash
   npm run package
   ```

## First-Time Setup

1. Click the Deployer icon in the menu bar
2. Select "Settings..."
3. Paste your Vercel personal access token (generate at https://vercel.com/account/tokens)
4. Select the projects you want to watch
5. Close Settings — the app will start polling

## Building for Distribution

The packaged app will be created in the `release` folder. On first launch, macOS may show a security warning since the app is not code-signed. To bypass:

1. Go to **System Settings → Privacy & Security**
2. Click "Open Anyway" next to the warning

## Open Source

This project is free and open source. Contributions are welcome! Whether you want to fix a bug, add a feature, or improve the documentation — feel free to fork the repo and submit a pull request.

## License

MIT License — Copyright © 2026 Roberto Francisco