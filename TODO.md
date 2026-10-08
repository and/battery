# To do

Features and tweaks planned for later. Move an item to the changelog or release notes when it ships.

## Tweaks

- [ ] Make the "Active" status pill interactive (for example, tap to turn monitoring on or off).
- [ ] Revamp the design. The current look feels like a generic AI-generated theme.

## Features

- [ ] iOS background alerts: Shortcuts automations for battery level and charger events, App Intents, and a native `UIDevice` battery observer. iOS cannot run persistent background monitoring, so alerts currently work only while the app is open.
- [ ] Show an in-app message when a new version is released (for example, check the latest GitHub release on launch and link to the download).
- [ ] Set up a publish pipeline to the Play Store (signed AAB build, Play App Signing, upload via CI), so users get automatic updates instead of downloading APKs from GitHub Releases.
- [ ] Add an Obtainium link to the docs page, so sideloading users get update notifications.

## Checks

- [ ] Check the light theme and low battery levels after the 1.6.0 layout changes (edge-to-edge, gauge ring).
- [ ] Back up `~/keystores/battery-alert-release.keystore` and its password. Losing it again means every user has to uninstall to update.
