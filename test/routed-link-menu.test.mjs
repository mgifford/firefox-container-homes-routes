// The "Open routed link" menu, driven through the fake browser. Checks the
// extension's own wiring; real menu rendering needs Firefox.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBackground, settle } from "./helpers/fake-browser.mjs";
import { CLARO_ISSUE, containerBindings, containers, sampleRouting } from "./fixtures/routing.mjs";

const SOURCE = { id: 1, active: true, cookieStoreId: "firefox-container-4", url: "https://mail.example/" };

async function setup({ routing = sampleRouting(), tabs = [SOURCE] } = {}) {
  const bg = await loadBackground({ tabs, containers, local: routing ? { routing, containerBindings } : {} });
  await bg.browser.runtime.onInstalled.fire({});
  const menu = (id) => bg.state.menus.get(id);
  const showFor = async (linkUrl, tab = bg.tab(1)) => {
    await bg.browser.menus.onShown.fire({ menuIds: ["open-routed-link", "open-routed-link-in"], contexts: ["link"], linkUrl }, tab);
    await settle();
  };
  const click = async (menuItemId, linkUrl, tab = bg.tab(1)) => {
    await bg.browser.menus.onClicked.fire({ menuItemId, linkUrl }, tab);
    await settle();
  };
  const choiceTitles = () =>
    [...bg.state.menus.values()].filter((m) => m.parentId === "open-routed-link-in").map((m) => m.title);
  // In the order they were opened (new tabs are inserted next to the source).
  const newTabs = () => bg.state.tabs.filter((t) => t.id !== 1).sort((a, b) => a.id - b.id);
  return { bg, menu, showFor, click, choiceTitles, newTabs };
}

test("menu: created on install, for web links only", async () => {
  const { menu } = await setup();
  assert.deepEqual(menu("open-routed-link").contexts, ["link"]);
  assert.deepEqual(menu("open-routed-link").targetUrlPatterns, ["http://*/*", "https://*/*"]);
  assert.equal(menu("open-routed-link-in").title, "Open routed link in");
});

test("menu: opening it explains where the link will go and refreshes", async () => {
  const { bg, menu, showFor } = await setup();
  await showFor(CLARO_ISSUE);
  assert.equal(menu("open-routed-link").title, "Open routed link in Drupal (Claro)");
  assert.equal(menu("open-routed-link").enabled, true);
  assert.equal(menu("open-routed-link-in").visible, true);
  assert.ok(bg.state.menuRefreshes > 0);
});

test("menu: clicking opens the link next to the source tab in the routed container", async () => {
  const { click, newTabs, bg } = await setup();
  await click("open-routed-link", CLARO_ISSUE);
  const [opened] = newTabs();
  assert.equal(opened.url, CLARO_ISSUE);
  assert.equal(opened.cookieStoreId, "firefox-container-1");
  assert.equal(opened.index, bg.tab(1).index + 1);
  assert.equal(opened.active, true);
});

test("submenu: lists alternatives and opens the chosen one just this once", async () => {
  const { showFor, click, choiceTitles, newTabs, bg } = await setup();
  await showFor("https://claude.ai/new");
  assert.deepEqual(choiceTitles(), ["Work development (Work)", "Drupal (Personal)", "Misc (Personal)"]);

  await click("open-routed-link-in:dest-work-dev", "https://claude.ai/new");
  assert.equal(newTabs()[0].cookieStoreId, "firefox-container-3");

  await click("open-routed-link", "https://claude.ai/new");
  assert.equal(newTabs()[1].cookieStoreId, "firefox-container-2", "the override was not remembered");
  assert.equal(bg.browser.storage.local.data.routing.rules.length, 3, "no rule was created");
});

test("submenu: entries are replaced, not piled up, each time the menu opens", async () => {
  const { showFor, choiceTitles } = await setup();
  await showFor("https://claude.ai/new");
  await showFor(CLARO_ISSUE);
  assert.deepEqual(choiceTitles(), ["Personal AI (Personal)", "Work development (Work)", "Misc (Personal)"]);
});

test("menu: a removed container shows a disabled item with the fix, and clicking opens nothing", async () => {
  const { bg, menu, showFor, click, newTabs } = await setup();
  bg.state.containers = containers.slice(1);
  await showFor(CLARO_ISSUE);
  assert.equal(menu("open-routed-link").enabled, false);
  assert.match(menu("open-routed-link").title, /container for "Drupal" was removed/);

  await click("open-routed-link", CLARO_ISSUE);
  assert.deepEqual(newTabs(), []);
});

test("menu: sign-in links open in the source tab's container, with no alternatives", async () => {
  const { menu, showFor, click, newTabs } = await setup();
  await showFor("https://accounts.google.com/signin");
  assert.equal(menu("open-routed-link-in").visible, false);
  await click("open-routed-link", "https://accounts.google.com/signin");
  assert.equal(newTabs()[0].cookieStoreId, "firefox-container-4");
});

test("menu: hidden in private windows, and clicks there do nothing", async () => {
  const privateTab = { ...SOURCE, incognito: true };
  const { menu, showFor, click, newTabs } = await setup({ tabs: [privateTab] });
  await showFor(CLARO_ISSUE);
  assert.equal(menu("open-routed-link").visible, false);
  assert.equal(menu("open-routed-link-in").visible, false);
  await click("open-routed-link", CLARO_ISSUE);
  assert.deepEqual(newTabs(), []);
});

test("menu: before any routing is set up, the item says so and is disabled", async () => {
  const { menu, showFor, click, newTabs } = await setup({ routing: null });
  await showFor(CLARO_ISSUE);
  assert.equal(menu("open-routed-link").enabled, false);
  assert.match(menu("open-routed-link").title, /no routing set up/);
  assert.equal(menu("open-routed-link-in").visible, false);
  await click("open-routed-link", CLARO_ISSUE);
  assert.deepEqual(newTabs(), []);
});

test("menu: existing shortcuts are unaffected", async () => {
  const { bg } = await setup();
  await bg.browser.storage.local.set({ homes: { "firefox-container-4": "https://home.example/" } });
  await bg.command("open-container-homes");
  assert.equal(bg.tab(1).url, "https://home.example/");
});
