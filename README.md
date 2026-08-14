# Codex Usage Companion

[![CI](https://github.com/Nemo0000/codex-usage-companion/actions/workflows/ci.yml/badge.svg)](https://github.com/Nemo0000/codex-usage-companion/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Codex Usage Companion is an independent, local-first Windows tray app with a compact floating panel for viewing ChatGPT-backed Codex usage limits.

> This is an independent open-source project. It is not an official OpenAI product.

## Highlights

- View remaining percentage for the current Codex rate-limit windows.
- See reset countdowns in a compact, always-on-top panel.
- Run from the Windows notification area without occupying the taskbar.
- Move between compact and expanded layouts.
- Use light, dark, or system themes.
- Start with Windows when desired.
- Use the official browser sign-in flow when the local Codex session needs authentication.
- English and Simplified Chinese interface support.

## How it works

The app launches `codex app-server` locally and communicates over its stable `stdio` transport. It does not scrape ChatGPT pages, read browser cookies, or upload usage data. Email addresses are masked in the UI, and raw protocol messages and access tokens are never logged.

## Download

Download the latest Windows x64 installer from [GitHub Releases](https://github.com/Nemo0000/codex-usage-companion/releases).

The initial release is an unsigned installer. Windows may display a warning before installation; users should verify the release source and checksum before running a downloaded installer.

## Requirements

- Windows 10 or Windows 11 (x64)
- Microsoft Edge WebView2 Runtime
- Codex CLI with `codex app-server` support
- A ChatGPT-backed Codex sign-in for subscription rate-limit information

Check the CLI from PowerShell before launching the app:

```powershell
codex --version
codex app-server --help
```

## Installation and first run

1. Download the latest `Codex Usage Companion_*_x64-setup.exe` installer from the release page.
2. Run the installer for the current Windows user.
3. Launch Codex Usage Companion from the Start menu or desktop shortcut.
4. If Codex is not signed in, choose **Reconnect** and complete the official browser flow.
5. Use the tray icon to show or hide the panel. Closing the panel hides it instead of exiting the app.

## Development

Development prerequisites:

- Node.js `20.19+`, `22.12+`, or a newer supported release
- Rust `1.96.0` (selected automatically by `rust-toolchain.toml`)
- Visual Studio 2022 Build Tools with the **Desktop development with C++** workload and a Windows SDK

Install dependencies and run the checks:

```powershell
npm install
npm run check
npm test
npm run build
```

Start the Tauri development app:

```powershell
npm run tauri dev
```

Build the Windows installer:

```powershell
npm run tauri build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`.

## Troubleshooting

### Codex CLI not found

Confirm that `codex --version` works in a new terminal, then restart the companion. Set `CODEX_CLI_PATH` to an explicit executable or command-shim path when the CLI is not on `PATH`.

### Usage information is unavailable

Subscription rate-limit information requires a ChatGPT-backed Codex account. API-key-only and Bedrock authentication may not expose these usage windows. Use **Reconnect** and complete the official browser flow.

### The panel disappeared

The close button hides the panel. Use the tray icon to show it again, or right-click the tray icon and choose **Show panel**.

## Current scope

Version `0.1.1` focuses on usage visibility, authentication compatibility, a movable translucent panel, and a quiet tray-first Windows experience. Reset-credit redemption is intentionally outside the current scope and may be considered for a future version.

## Roadmap

- Improve release packaging and signing for wider distribution.
- Add more robust diagnostics that remain privacy-safe.
- Evaluate additional usage windows and account actions based on official Codex App Server support.

See [CHANGELOG.md](./CHANGELOG.md) for release history.

## License

Codex Usage Companion is released under the [MIT License](./LICENSE).
