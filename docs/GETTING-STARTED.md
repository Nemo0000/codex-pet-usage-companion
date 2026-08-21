# Getting Started

This short guide covers the two main workflows in Codex Pet & Usage Companion: usage monitoring and community-pet switching.

## 1. Install and connect

1. Download the latest Windows x64 installer from [GitHub Releases](https://github.com/Nemo0000/codex-pet-usage-companion/releases).
2. Install for the current Windows user and launch the app.
3. Confirm that these commands work in PowerShell:

   ```powershell
   codex --version
   codex app-server --help
   ```

4. If the panel asks you to connect, choose **Sign in with ChatGPT** and complete the official browser flow.

The app uses the local Codex App Server. It does not read browser cookies or store access tokens.

## 2. Monitor usage

- The expanded panel shows each available rate-limit window, remaining percentage, and reset countdown.
- Open **Settings > Behavior** to choose manual, 1-minute, 5-minute, or 15-minute refresh.
- Keep **Low-usage alerts** enabled to show a warning below 20% and try a Windows notification.
- If a refresh fails, the last known values remain visible and are marked as potentially stale.

## 3. Switch a community pet

1. Click **Change pet** on the home panel.
2. Search the Petdex gallery or filter by kind.
3. Choose **Install only** to write the package under `.codex/pets/<pet-id>`.
4. Choose **Install and use** to also try launching the official desktop app, opening **Settings > Pets**, and invoking the visible **Select** button.

If the official UI has changed or cannot be automated, the package remains installed and the app tells you where to select it manually.

## 4. Feedback and contributions

Please open an [Issue](https://github.com/Nemo0000/codex-pet-usage-companion/issues) with the app version, Windows version, Codex CLI version, expected behavior, and redacted error text. Pull requests for focused fixes, tests, documentation, and translations are welcome.

See the [contribution guide](../CONTRIBUTING.md) before submitting changes.
