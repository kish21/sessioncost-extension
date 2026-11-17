# Changelog

The extension has the same version as SessionCost; the full notes are in SessionCost's CHANGELOG.md.

## 1.2.1

- Fix token waste applies the chat it showed, even when a new chat started in between.
- Several folders in one window: opening a file in another folder updates the status bar at once.
- Less work in the background in Cursor; the menu is in three titled groups.
- Updating keeps the guard running: an older SessionCost is upgraded in place, never deleted first.
- The status bar names the chat its numbers belong to (`Guard on · fix the login · 84k tokens · $0.62`).
- While SessionCost updates, the status bar says "Updating SessionCost…" instead of "Install SessionCost".
- Two editors with different extension versions no longer take turns re-installing SessionCost: a newer copy is
  used as it is, an older one is never put back.

## 1.2.0

- First version: status bar (guard, tokens, cost), pop-up when the guard stops or asks, and a menu for everything
  SessionCost does. Installs and updates SessionCost itself.
