# End-to-end tests in Firefox

`npm run test:e2e` runs the add-on in a real, headless Firefox and drives
its pages with Selenium WebDriver. It checks what `npm test` (which uses a
stand-in for the Firefox APIs) cannot:

1. The routing settings page and the options page load as modules in
   Firefox without console errors.
2. On the routing settings page, adding an account and a destination with
   **New container** creates a real Firefox container and binds it.
3. The demo config is loaded the way [demo/README.md](demo/README.md)
   describes, from an extension page, and **Test a link** gives the
   documented result for each example in that README.
4. axe-core finds no WCAG 2.0, 2.1 or 2.2 Level A or AA violations on
   either page, as Firefox renders them.
5. On the options page, typing `drupal.org` in a home field and saving
   stores `https://drupal.org/`.

CI runs these in the `e2e` job of `.github/workflows/ci.yml`, separately
from the `check` job. `npm test` stays fast and does not need Firefox.

## Running locally

You need Node.js and Firefox. Selenium Manager (part of
`selenium-webdriver`) finds Firefox and downloads a matching geckodriver
the first time, so it needs network access once.

```sh
npm install
npm run test:e2e
```

Each run uses a new temporary Firefox profile, so your own profile,
containers and logins are not touched. To use a particular Firefox, set
`FIREFOX_BIN` to its executable, for example
`FIREFOX_BIN=/Applications/Firefox.app/Contents/MacOS/firefox`.

The tests build the add-on with `web-ext build` and install that `.zip` as
a temporary add-on. The add-on's internal UUID is fixed with the
`extensions.webextensions.uuids` preference, so the tests can open
`moz-extension://…/src/settings/routing.html` directly.
`privacy.userContext.enabled` turns on container tabs.

Console errors are read from Firefox's own output:
`devtools.console.stdout.content` prints page console messages, including
those from extension pages, which WebDriver BiDi does not report. A first
test sends a `console.error` and an uncaught exception from an extension
page and fails if either is missed, so "no console errors" can't pass by
seeing nothing.

## What these tests do not cover

- **The right-click menu.** WebDriver cannot open or click Firefox's
  native context menu, so **Open routed link** and **Open routed link
  in** are still checked by hand (section "Open routed link" in
  [manual-verification.md](manual-verification.md)).
- **Toolbar button, keyboard shortcuts, tab groups and container
  isolation between tabs.** Also by hand.
- **Screen readers, keyboard flow, zoom and reflow, and content quality.**
  axe-core finds only some accessibility problems; the manual checklist
  still applies.
- **Browser restarts.** The add-on is temporary and is removed when
  Firefox closes.

The tests find elements by their `id`, so renaming visible text (such as
"account") does not break them, but renaming or removing an `id` on the
routing settings or options page does.
