# Codex Usage Companion

A local-first Windows tray app and floating panel for viewing Codex usage limits.

> This is an independent open-source project. It is not an official OpenAI product.

## v0.1.0 scope

- Read ChatGPT-backed Codex rate-limit windows through the official Codex App Server.
- Show remaining percentage and reset countdowns.
- Run from the Windows notification area without occupying the taskbar.
- Offer compact/expanded modes, always-on-top, autostart, theme, and language settings.
- Use the official browser login flow when Codex is not signed in.

Reset-credit redemption is intentionally excluded from v0.1.0 and planned for v0.2.0.

## Privacy

The app launches `codex app-server` locally and uses its stable `stdio` transport.
It does not scrape ChatGPT pages, read browser cookies, or upload usage data. Email
addresses are masked in the UI. Raw protocol messages and access tokens are not logged.

## Requirements

- Windows 10 or Windows 11 (x64)
- Microsoft Edge WebView2 Runtime
- Codex CLI with `codex app-server` support
- A ChatGPT-backed Codex sign-in for subscription rate-limit information

Check the CLI before launching the app:

```powershell
codex --version
codex app-server --help
```

## Installation

1. Download the Windows x64 installer from the project release, or build it locally.
2. Run `Codex Usage Companion_0.1.1_x64-setup.exe`.
3. Launch the app and complete the official browser sign-in if Codex is not already signed in.

The local v0.1.1 build is not code-signed. Windows may identify an unsigned installer;
public releases should be signed before wider distribution.

## Development

Development prerequisites:

- Node.js `20.19+`, `22.12+`, or a newer supported release
- Rust `1.96.0` (selected automatically by `rust-toolchain.toml`)
- Visual Studio 2022 Build Tools with the **Desktop development with C++** workload and a Windows SDK

```powershell
npm install
npm run check
npm test
npm run tauri dev
```

Build the Windows installer:

```powershell
npm run tauri build
```

The NSIS installer is written under `src-tauri/target/release/bundle/nsis/`.

## Troubleshooting

### Codex CLI not found

Confirm `codex --version` works in a new terminal, then restart the companion.
You can set `CODEX_CLI_PATH` to an explicit executable or command shim path.

### Usage information is unavailable

Rate-limit information requires a ChatGPT-backed Codex account. API-key-only and
Bedrock authentication may not expose subscription usage windows. Use the reconnect
action and complete the official browser flow.

### The window disappeared

The close button hides the window. Use the tray icon to show it again, or right-click
the tray icon and choose **Show panel**.

## Roadmap

See [PLAN.md](./PLAN.md) for the implementation checklist and planned releases.

## License

MIT
