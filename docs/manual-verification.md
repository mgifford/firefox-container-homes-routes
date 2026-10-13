# Manual verification in Firefox

`npm test` checks the extension's own logic against a stand-in for the
Firefox APIs. It cannot show that Firefox really keeps containers apart,
groups tabs, or stores settings. Run this checklist in a real Firefox
before merging a change that touches tabs, containers, storage or the
options page.

Record the Firefox version, operating system and date, and mark each step
pass, fail or not run. Paste the filled-in table into the pull request.

## 1. Set up a temporary profile

Use a throwaway profile so your everyday containers, tabs and logins are
not touched.

Option A, using web-ext (opens a new temporary profile each time):

```sh
npm install
npm start
```

Option B, by hand:

1. Start Firefox with a new empty profile, for example on macOS:
   `/Applications/Firefox.app/Contents/MacOS/firefox --profile "$(mktemp -d)" --no-remote`
2. Open `about:debugging#/runtime/this-firefox`, choose
   **Load Temporary Add-on**, and select this repository's `manifest.json`.

Then, in the temporary profile:

1. Turn on container tabs: Settings, General, Tabs, **Enable Container
   Tabs**, then **Settings…** next to it.
2. Make sure there are at least two containers. These steps use **Work**
   and **Personal**; rename them in the steps if yours differ.

## 2. Checklist

### Identity

| # | Step | Expected | Result |
|---|------|----------|--------|
| 1.1 | Open `about:addons`. | The add-on is listed as **Container Homes Routes**. | |
| 1.2 | Hover over the toolbar button. | The tooltip reads "Open container home (Routes fork)". | |
| 1.3 | Optional: also install upstream Container Homes. | Both are listed. Both register the same default shortcuts; Manage Extension Shortcuts shows the conflict. Disable one before continuing. | |

### Options page

| # | Step | Expected | Result |
|---|------|----------|--------|
| 2.1 | `about:addons`, Container Homes Routes, **Preferences**. | The page is shown inside the add-on details. It lists "No container / Default", then each container with its icon and colour. | |
| 2.2 | Enter a home URL for Work and a Slot 1 URL for Work and Personal. Click **Save**. | "Saved." appears. Reloading the page shows the same values. | |
| 2.3 | Enter `not a url` in a field and click **Save**. | Saving is blocked; nothing changes. | |
| 2.4 | Click **Export config…**. | A `container-homes-config.json` file downloads with your URLs. | |
| 2.5 | Click **Import config…**, choose the exported file, accept the prompt. | "Imported." appears; the values are unchanged. | |
| 2.5a | In a second Firefox profile (or after removing and recreating containers so their ids change), create containers with the same names as in the exported file. Import the file. | The prompt counts every container; "Imported." appears and each home URL and slot is on the container with the same name. | |
| 2.5b | Edit the exported file: rename one container's `label` to a name you don't have, and give another the name of a container that appears twice (create two with the same name first). Import it. | The prompt says 2 containers will be skipped and lists both names. After accepting, the other containers are imported and the two listed ones are not. | |
| 2.6 | Using only the keyboard, Tab through the page. | Every control can be reached and shows a visible focus indicator, including **Import config…**, which opens the file picker with Enter or Space. | |

### Home URL

| # | Step | Expected | Result |
|---|------|----------|--------|
| 3.1 | In a Work tab, click the toolbar button. | The tab loads Work's home URL. | |
| 3.2 | In a Work tab, press Alt+Shift+Home. | Same as 3.1. | |
| 3.3 | In a Personal tab with no home URL, press Alt+Shift+Home. | Nothing happens. | |

### App slots

| # | Step | Expected | Result |
|---|------|----------|--------|
| 4.1 | In a Work tab, press Alt+Shift+1. | A new Work tab opens on Work's Slot 1 URL. | |
| 4.2 | Go back to the first tab and press Alt+Shift+1 again. | Focus returns to the slot tab; no new tab opens. | |
| 4.3 | Navigate the slot tab to another page on the same site, return to another Work tab, press Alt+Shift+1. | Focus returns to the same slot tab. | |
| 4.4 | In a Personal tab, press Alt+Shift+1. | A Personal tab is used or opened for Personal's Slot 1. The Work slot tab is never focused. | |
| 4.5 | Move the Work slot tab to a second window. From the first window, in a Work tab, press Alt+Shift+1. | The second window is raised with the slot tab active. | |
| 4.6 | Open a new empty Work tab (`about:newtab`) and close the slot tab. Press Alt+Shift+1 in the empty tab. | The empty tab loads the slot URL; no extra tab opens. | |
| 4.7 | Reload the add-on (`about:debugging`, **Reload**), then press Alt+Shift+1 in a Work tab. | The open slot tab is found by its site and focused. (Reloading clears the remembered tab, like a browser restart.) | |

### Tab groups

| # | Step | Expected | Result |
|---|------|----------|--------|
| 5.1 | Open several tabs across Work, Personal and no container, and pin one. Press Alt+Shift+0. | One group per container plus "No Container", titled and coloured to match. The pinned tab is not grouped. Work's slot tab is first in the Work group. | |
| 5.2 | Press Alt+Shift+0 again. | The same groups remain; no duplicates. | |
| 5.3 | Press Alt+PageDown repeatedly, then Alt+PageUp. | Focus moves to the first tab of the next or previous group and wraps around at either end. | |
| 5.4 | In a grouped Work tab, press Ctrl+Shift+Space. | A new Work tab opens next to it, in the same group. | |
| 5.5 | In Preferences, tick **Automatically add new tabs to their container's tab group** and save. Open a new Work tab. | The new tab joins the Work group. | |
| 5.6 | Untick the option, save, open a new Work tab. | The new tab is not grouped. | |

### Open routed link

Load the demo routing config first (`docs/demo/README.md`), so the
Drupal, Personal AI, Work development and Misc containers exist and are
bound.

| # | Step | Expected | Result |
|---|------|----------|--------|
| 7.1 | Before loading any routing config, right-click a web link. | **Open routed link** is greyed out and says no routing is set up; **Open routed link in** is not shown. | |
| 7.2 | Right-click a link to `https://www.drupal.org/project/claro/issues/3565271`. | The item reads "Open routed link in Drupal (Claro)". | |
| 7.3 | Click it. | A new tab opens next to the current one, in the Drupal container (container colour on the tab). | |
| 7.4 | Right-click a link to `https://claude.ai/`. Open **Open routed link in**. | The submenu lists Work development (Work) first, then the other destinations. | |
| 7.5 | Choose Work development. Then right-click the same link again. | The tab opens in Work development. The main item still says Personal AI: the choice was one-time. | |
| 7.6 | Right-click a link to `https://accounts.google.com/`. | The item offers to open the sign-in in this container; there is no submenu. | |
| 7.7 | Remove the Drupal container in Settings, then right-click the Claro link. | The item is greyed out and says the container for "Drupal" was removed. | |
| 7.8 | Open a private window and right-click any web link. | Neither routed-link item is shown. | |
| 7.9 | Use the keyboard: focus a link, press Shift+F10 (or the context-menu key), and arrow to the items. | Both items and the submenu can be reached and used without a mouse; a screen reader reads the full item text. | |
| 7.10 | Reload the add-on (`about:debugging`, **Reload**), then repeat 7.2. | The items appear once, not duplicated, with up-to-date text. | |
| 7.11 | Restart Firefox (needs an installed build, not a temporary add-on). | The menu items are still present after the restart. | |

### Routing settings page

| # | Step | Expected | Result |
|---|------|----------|--------|
| 8.1 | In Preferences, click **Routing settings…**. | The routing settings page opens in a new tab. | |
| 8.2 | Before loading a routing config, look at the page. | It says no routing is set up yet. | |
| 8.3 | Load the demo config (`docs/demo/README.md`) with the page open. | The page updates without a reload: the tables fill in and the check says "No problems found." | |
| 8.4 | Enter a Claro issue link in **Link to test** and press Enter. | "Opens in the Drupal container." with the rule, category, destination, account and container listed. | |
| 8.5 | With a screen reader on, repeat 8.4 with a Claude link. | The new one-line result is announced without moving focus. | |
| 8.6 | Remove the Drupal container in Settings. | The Destinations table shows a problem for Drupal, and testing a Claro link explains it. | |
| 8.7 | Zoom to 400% (or a 320px-wide window). | The page does not scroll sideways; a table too wide to fit scrolls inside its own area. Table text wraps between words. | |
| 8.8 | Under **Add an account**, press **Add account** with the name empty, then with "work". | Focus returns to Name with "Enter a name." and then "Another account is already called "Work"." | |
| 8.9 | Add an account "Client A", then **Edit** it, rename it "Client B" and press Enter. | Each result is announced. After saving, focus returns to its **Edit** button. **Cancel** also returns focus there. | |
| 8.10 | **Remove** the Work account. | Refused: it still has destinations, which are named. Nothing changes. | |
| 8.11 | Add a destination "Client site" for Client B with container **New container**. | A container named "Client site" appears in Firefox's container settings; the table shows it. The check still says "No problems found." | |
| 8.12 | **Edit** Client site and choose the Drupal container. | Saved with a warning that the container is also used by another account; the configuration check shows the same warning. | |
| 8.13 | **Remove** the Drupal destination, then Client site. | Drupal is refused (its categories are named). Client site is removed and focus moves to the Destinations heading. The "Client site" container is still in Firefox. | |
| 8.14 | Right-click a Claro issue link after 8.12. | "Open routed link" still works; routing uses the edited setup without a reload. | |

### Accessibility of the options page

| # | Step | Expected | Result |
|---|------|----------|--------|
| 6.1 | With a screen reader (VoiceOver on macOS, NVDA on Windows), save the form. | "Saved." is announced without moving focus. | |
| 6.2 | Each URL field. | It is announced with its container and slot, for example "Work, Slot 1". | |
| 6.3 | Zoom the page to 200% and 400%. | Nothing is cut off and no horizontal scrolling is needed. Long container names may be cut off with "…"; note it if so. | |

## 3. Results template

```text
Firefox version:
Operating system:
Date:
Tester:
Build/commit:

Step | Result | Notes
```

## Notes

- **Keyboard shortcuts:** Firefox only applies a default shortcut the first
  time it sees a command. If a shortcut does nothing, check Manage
  Extension Shortcuts on `about:addons` (the cog menu).
- **Temporary add-ons:** they are removed when Firefox restarts, so a real
  browser restart can only be tested with a signed, installed build.
  Step 4.7 uses an add-on reload as the closest substitute.
