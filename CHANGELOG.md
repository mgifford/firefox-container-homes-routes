# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commit
messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## [0.6.1] - 2026-10-26

### Bug Fixes

- Slot shortcuts no longer switch to another slot's tab when both slots are
  on the same domain (e.g. two Outlook accounts); the second slot now opens
  its own tab.

## [0.6.0] - 2026-10-26

### Features

- Config export now includes every container's name, icon and color. On
  import, containers are matched by name; missing ones are created with the
  exported icon and color, so imports work even when container ids or order
  differ. Older (id-based) export files still import as before.
- Config export/import now includes keyboard shortcuts, including any you
  customized in Firefox's "Manage Extension Shortcuts".

## [0.5.0] - 2026-08-21

### Features

- Add `Ctrl+Shift+Space` to open a new tab next to the current one, in the same
  container and joined to the current tab's group (if it's in one).
- Add an options-page preference, "Automatically add new tabs to their
  container's tab group" (off by default), that joins every new tab to its
  container's existing group in the current window, or creates one for it
  if none exists yet. Pinned tabs are left alone.

### Changes

- Change the default shortcut for switching to the previous or next tab
  group from `Alt+Shift+PageUp` / `Alt+Shift+PageDown` to `Alt+PageUp` /
  `Alt+PageDown`.

## [0.4.0] - 2026-08-21

### Features

- Add `Alt+Shift+0` to group and sort the current window's tabs by
  container: one native tab group per container with tabs in this window
  (plus a "No Container" group for default-context tabs), titled and
  colored to match, ordered "No Container" first then by container order.
  Each container's configured slot tabs (1-9) are sorted to the front of
  its group in slot order; other tabs keep their existing relative order.
  Pinned tabs, other windows, and platforms without tab-group support
  (Firefox for Android) are left untouched. Re-running the shortcut re-sorts
  into the existing groups instead of creating duplicates.
- Add `Alt+Shift+PageUp` / `Alt+Shift+PageDown` to switch to the first tab
  of the previous or next tab group in the current window, wrapping around
  at either end. Works whether or not the current tab is itself in a group.

### Chores

- Add the `tabGroups` permission, required to create, title, color, and
  reorder native tab groups for the new group-and-sort command.

## [0.3.0] - 2026-08-17

### Features

- Add per-container app slots (1-9): `Alt+Shift+1`..`9` switch to that
  slot's tab in the current container, or open its configured URL in a new
  tab if it isn't already open. Bindings track the actual tab, with
  URL-origin matching as a fallback after the tab closes or the browser
  restarts, and raise the target window if it lives elsewhere.
- Add config export/import on the options page: export home URLs and slots
  to a JSON file, and import one back in (replacing the current
  configuration, after a confirmation prompt).

### Chores

- Store a `configVersion` alongside the config, so future schema changes can
  migrate on update instead of guessing at the stored shape.
- Re-add the `tabs` permission, needed to find and re-focus slot tabs by id
  or URL.
- Add the `cookies` permission, required by `tabs.create`'s `cookieStoreId`
  option — without it, opening a new tab for an unconfigured slot silently
  fails.

## [0.2.2] - 2026-08-13

### Fixes

- Drop the unneeded `tabs` permission (`activeTab` already covers it,
  since both entry points are user-gesture-triggered).
- Widen the container name labels in the options page for more room.

## 0.2.1 - 2026-08-12

### Chores

- Bump version for manual submission to the AMO public listing. No
  functional changes.

## [0.2.0] - 2026-08-12

### Fixes

- Show each container's icon and color in the options list, pulled from
  `contextualIdentities`, to match Firefox's native container styling.

## [0.1.0] - 2026-08-12

### Features

- Initial version of the extension: configure a home URL per Firefox
  container, and jump to it from the toolbar button or Alt+Shift+Home.
- Tag-triggered CI pipeline that lints, signs via AMO, and publishes a
  GitHub release.

### Fixes

- Embed the options page in the addon's details view (`about:addons`)
  instead of opening it in a separate tab.

### Refactoring

- Reorganize the source into a `src/` layout and migrate to Manifest V3.

### Chores

- Rename the extension to "Container Homes" and pluralize the remaining
  singular identifiers (extension id, package name, command id).
- Add an MIT license.

### Documentation

- Add a README covering installation, usage, permissions, development, and
  the release process.

[0.6.1]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.6.1
[0.6.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.6.0
[0.5.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.5.0
[0.4.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.4.0
[0.3.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.3.0
[0.2.2]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.2.2
[0.2.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.2.0
[0.1.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.1.0
