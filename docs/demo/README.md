# Demo routing config

[`routing-sample.json`](routing-sample.json) holds the examples from the
routing brief, so routing can be demonstrated before the rule editor
exists:

| Link | Category | Destination (container) |
|---|---|---|
| `drupal.org/project/claro/issues/…` | Claro | Drupal |
| `drupal.org/project/drupal/issues/…` | Drupal Core | Drupal |
| Other drupal.org pages, including `/i/…` and `/node/…` short links | Drupal general | Drupal |
| `claude.ai` | Claude | Personal AI (or Work development) |
| `github.com/copilot` | GitHub Copilot | Work development (or Personal AI) |
| Anything else | (fallback) | Misc |

Claude and GitHub Copilot each list both AI destinations, with a different
default, to show choosing between personal and work. Drupal is under the
Work account context. All of this is sample data: your own config can
assign any destination to any account context.

Nothing uses this config yet. It is for demonstrating the routing steps
as they land, and for checking what is stored.

## Loading it into a test profile

Only do this in a test profile: it replaces any routing config already
stored there. Home URLs, slots and preferences are not touched.

1. Run the add-on in a test profile (`npm start` from macOS Terminal.app).
2. In Firefox Settings, under Tabs, create four containers named exactly
   **Drupal**, **Personal AI**, **Work development** and **Misc**.
3. Open `about:debugging#/runtime/this-firefox`, click **Inspect** next to
   Container Homes Routes, and open the **Console** tab.
4. Paste this and press Enter:

```js
const { routing, containerNames } = await (await fetch(browser.runtime.getURL("docs/demo/routing-sample.json"))).json();
const { validateRouting } = await import(browser.runtime.getURL("src/config/validate.js"));
const problems = validateRouting(routing);
const containers = await browser.contextualIdentities.query({});
const containerBindings = {};
for (const [destinationId, name] of Object.entries(containerNames)) {
  const found = containers.filter((c) => c.name === name);
  if (found.length !== 1) problems.push(`${found.length} containers named "${name}"; need exactly 1`);
  else containerBindings[destinationId] = found[0].cookieStoreId;
}
if (problems.length > 0) console.error("Not loaded:", problems);
else { await browser.storage.local.set({ routing, containerBindings }); console.log("Loaded demo routing config", containerBindings); }
```

It refuses to load, and changes nothing, if the config is invalid or a
container is missing or its name is used twice.

To check what is stored, run `await browser.storage.local.get(["routing", "containerBindings"])`.
