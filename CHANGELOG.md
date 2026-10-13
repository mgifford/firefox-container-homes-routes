# Changelog

All notable changes to this project are documented here. The format is based
on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commit
messages follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).

## Unreleased (Container Homes Routes fork)

### Chores

- Fork as "Container Homes Routes" with its own extension ID
  (`container-homes-routes@mgifford.github.io`) and homepage, so a
  development install is distinguishable from upstream Container Homes.
  Behaviour is unchanged.
- Add a behavioural test harness (`npm test`) and a CI workflow.

### Features

- Add configuration version 2: a portable `routing` section (account
  contexts, destinations, categories, rules, fallback destination) and a
  local-only `containerBindings` map. Existing settings migrate on install
  or update without changes to home URLs, slots or preferences. Nothing
  uses the routing data yet.
- Add the rule matcher (not yet wired to any command). Hosts match on
  whole labels only, `www.` is treated as the same site, path prefixes
  match whole segments, and precedence is one-time override, priority,
  specificity, then fallback. Tied rules in different categories are
  reported as ambiguous.
- Never route known sign-in pages (Google, Microsoft, GitHub), so a
  sign-in stays in the container it started in. Coverage is listed in
  `docs/routing.md`.
- Treat GitHub's `/sessions` pages (two-factor and device verification)
  as sign-in pages too.
- Resolve routing destinations to Firefox containers by stored container
  id, with recoverable errors (no container chosen, container removed,
  private browsing, unsupported browser), and detect containers shared
  between account contexts. Not yet used by any command.
- Add "Open routed link" to the link context menu, with an "Open routed
  link in" submenu for a one-time choice of destination. The menu text
  says where the link will open, or what to fix when it can't be routed.
  Hidden in private windows. Adds the `menus` permission.
- Add a Routing settings page (opened from Preferences) that explains
  where any link would open and why, checks the configuration for
  problems, conflicting rules and containers shared between accounts,
  and shows the current setup. Editing comes next.

### Refactoring

- Load the background script as an ES module, so routing code can be
  split into separately tested modules. Behaviour is unchanged.

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

[0.2.2]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.2.2
[0.2.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.2.0
[0.1.0]: https://github.com/rolfkleef/firefox-container-homes/releases/tag/v0.1.0
