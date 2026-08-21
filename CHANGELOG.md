# Changelog

All notable changes to Codex Usage Companion are documented here.

## [0.5.0] - 2026-08-21

- Added configurable automatic usage refresh intervals: manual, 1 minute, 5 minutes, or 15 minutes.
- Added low-usage alerts when any rate-limit window falls to 20% remaining, with an in-panel warning and best-effort Windows system notification.
- Added clear connected-without-usage, stale-data, loading, unauthenticated, and error states without replacing known data with false zeros.
- Added refresh countdown context in the footer and guarded concurrent refresh requests from tray, timers, and manual actions.
- Added matching Simplified Chinese and English settings, status messages, and notification copy.

## [0.4.1] - 2026-08-20

- Completed the guided **Install and use** bridge with automatic app-window activation, menu fallback, Settings > Pets navigation, and stronger UI Automation pattern support.
- Added startup recovery when the official desktop process exists but its interactive window is not ready yet.
- Improved refresh, custom-pet matching, off-screen scrolling, selection invocation, and post-selection verification across English and Simplified Chinese labels.
- Kept the bridge visible and user-triggered, with a safe manual fallback when the official UI cannot be automated.

## [0.4.0] - 2026-08-20

- Added automatic Windows launch and visible Settings > Pets navigation for **Install and use** when the official desktop executable can be discovered.
- Added an optional ChatGPT/Codex executable path in Settings for installations outside the standard Windows locations.
- Added safe uninstall controls for locally installed Petdex packages with confirmation and installed-state refresh.
- Added explicit launch, navigation, loading, and manual-fallback messaging in English and Simplified Chinese.
- Kept the bridge limited to user-triggered visible UI Automation; official client files, cookies, and access tokens are not modified or stored.

## [0.3.3] - 2026-08-17

- Added a homepage **Change pet** entry that opens the Petdex community gallery directly.
- Removed the duplicate community-gallery launcher from Settings so pet browsing has one clear entry point.
- Added a compact, keyboard-focusable gallery CTA with English and Simplified Chinese labels.
- Renamed the public-facing product title to **Codex Pet & Usage Companion** and clarified the two core features.
- Added English product screenshots for the usage monitor and Petdex pet switcher.

## [0.3.2] - 2026-08-17

- Removed the redundant local companion-pet skin gallery and image import controls.
- Removed the legacy built-in official-pet list and standalone v2 spritesheet import panel.
- Kept the Petdex community gallery as the single pet entry point, including install-only and install-and-use flows.
- Migrated old settings safely by ignoring removed pet fields while preserving language, theme, metric, and compact mode.

## [0.3.1] - 2026-08-17

- Fixed automatic selection when the Codex pet overlay owns the process main-window handle by locating the real Pets settings window across all top-level app windows.
- Matched Select buttons to pet rows by visible coordinates, restored/focused the official window for explicit install-and-use actions, and verified the resulting Selected state.

## [0.3.0] - 2026-08-17

- Added a searchable, filterable Petdex community gallery with lazy sprite previews, attribution, pagination, and installed-state indicators.
- Added trusted-host downloads and validation for Petdex v1/v2 PNG and WebP packages before installation under `.codex/pets/<pet-id>`.
- Added separate **Install only** and **Install and use** actions, including clear partial-success fallback when official UI automation is unavailable.
- Added safe package replacement with conflict protection, temporary-directory cleanup, response-size limits, and a 15-minute manifest cache.
- Added post-click verification that the official Pets page reports the custom pet as selected.
- Added loading, retry, empty, network-error, package-error, and licensing/attribution states in English and Simplified Chinese.

## [0.2.2] - 2026-08-17

- Added Codex v2 custom-pet package import with strict `1536x2288` PNG/WebP validation.
- Added local installation under `.codex/pets`, official Pets-list refresh, and automatic custom-pet selection.
- Separated ordinary single-image panel skins from official animated pet packages to avoid invalid imports.
- Improved official pet card/button matching for English and Simplified Chinese interfaces.

## [0.2.1] - 2026-08-17

- Added an opt-in Windows UI Automation bridge for selecting an official ChatGPT pet.
- Added explicit unsupported/experimental warnings and safe fallback behavior.
- Kept the bridge limited to visible UI actions; no official client files, cookies, or access tokens are modified or stored.

## [0.2.0] - 2026-08-17

- Added a local pet skin gallery with five built-in original skins.
- Added local PNG, WebP, and JPEG skin import with size and type validation.
- Added pet visibility control and persisted skin selection.
- Added a handoff link to the official ChatGPT Pets settings.
- Kept official pet artwork outside the distribution and preserved the local-first privacy boundary.

## [0.1.1] - 2026-08-14

- Added a movable translucent floating panel.
- Improved tray-first behavior and window visibility controls.
- Improved compatibility with the official browser sign-in flow.
- Added safer local App Server probing and clearer unavailable-state handling.
- Added English and Simplified Chinese UI text for the current settings and usage states.

## [0.1.0] - 2026-08-14

- Initial Windows tray companion release.
- Added usage-window percentages and reset countdowns.
- Added compact and expanded panel modes.
- Added theme, autostart, language, and always-on-top settings.
- Added local-first privacy boundaries and MIT licensing.
