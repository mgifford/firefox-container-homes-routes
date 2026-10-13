// Baseline behaviour of the inherited Container Homes features. These pin
// down what exists today so later routing work can't change it unnoticed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadBackground, settle } from "./helpers/fake-browser.mjs";

const WORK = "firefox-container-1";
const PERSONAL = "firefox-container-2";
const CONTAINERS = [
  { cookieStoreId: WORK, name: "Work", color: "blue" },
  { cookieStoreId: PERSONAL, name: "Personal", color: "turquoise" }
];

test("install stores a config version only when none exists", async () => {
  const fresh = await loadBackground();
  await fresh.browser.runtime.onInstalled.fire({});
  assert.equal(fresh.browser.storage.local.data.configVersion, 1);

  const existing = await loadBackground({ local: { configVersion: 7 } });
  await existing.browser.runtime.onInstalled.fire({});
  assert.equal(existing.browser.storage.local.data.configVersion, 7);
});

test("home: toolbar and shortcut load the current container's home URL", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://elsewhere.example/" }],
    local: { homes: { [WORK]: "https://work.example/" } }
  });

  await bg.clickToolbar(bg.tab(1));
  assert.equal(bg.tab(1).url, "https://work.example/");

  bg.tab(1).url = "https://elsewhere.example/";
  await bg.command("open-container-homes");
  assert.equal(bg.tab(1).url, "https://work.example/");
});

test("home: does nothing when the container has no home URL", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: PERSONAL, url: "https://stay.example/" }],
    local: { homes: { [WORK]: "https://work.example/" } }
  });

  await bg.command("open-container-homes");
  assert.equal(bg.tab(1).url, "https://stay.example/");
});

test("slot: unconfigured slot opens nothing", async () => {
  const bg = await loadBackground({ tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://a.example/" }] });

  await bg.command("open-slot-3");
  assert.equal(bg.state.tabs.length, 1);
});

test("slot: focuses an open tab on the slot's origin in the same container only", async () => {
  const bg = await loadBackground({
    tabs: [
      { id: 1, active: true, cookieStoreId: WORK, url: "https://current.example/" },
      { id: 2, cookieStoreId: PERSONAL, url: "https://mail.example/inbox" },
      { id: 3, windowId: 2, cookieStoreId: WORK, url: "https://mail.example/thread/9" }
    ],
    local: { slots: { [WORK]: { 1: "https://mail.example/" } } }
  });

  await bg.command("open-slot-1");

  assert.equal(bg.state.tabs.length, 3, "no new tab");
  assert.equal(bg.tab(3).active, true, "work-container tab focused");
  assert.equal(bg.state.focusedWindowId, 2, "its window raised");
  assert.equal(bg.tab(2).active, false, "personal-container tab ignored");
});

test("slot: reuses an empty active tab instead of opening a new one", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "about:newtab" }],
    local: { slots: { [WORK]: { 2: "https://chat.example/" } } }
  });

  await bg.command("open-slot-2");

  assert.equal(bg.state.tabs.length, 1);
  assert.equal(bg.tab(1).url, "https://chat.example/");
});

test("slot: opens a new tab in the current container when nothing matches", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://current.example/" }],
    local: { slots: { [WORK]: { 1: "https://mail.example/" } } }
  });

  await bg.command("open-slot-1");

  assert.equal(bg.state.tabs.length, 2);
  const created = bg.state.tabs.find((t) => t.id !== 1);
  assert.equal(created.cookieStoreId, WORK);
  assert.equal(created.url, "https://mail.example/");
});

test("slot: stays bound to its tab after that tab navigates elsewhere", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://current.example/" }],
    local: { slots: { [WORK]: { 1: "https://mail.example/" } } }
  });

  await bg.command("open-slot-1");
  const slotTab = bg.state.tabs.find((t) => t.id !== 1);
  slotTab.url = "https://sso.example/after-redirect";
  await bg.browser.tabs.update(1, { active: true });

  await bg.command("open-slot-1");

  assert.equal(bg.state.tabs.length, 2, "no second tab");
  assert.equal(slotTab.active, true);
});

test("slot: a repointed slot URL ignores the old binding", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://current.example/" }],
    local: { slots: { [WORK]: { 1: "https://old.example/" } } }
  });

  await bg.command("open-slot-1");
  await bg.browser.storage.local.set({ slots: { [WORK]: { 1: "https://new.example/" } } });
  await bg.browser.tabs.update(1, { active: true });

  await bg.command("open-slot-1");

  assert.deepEqual(
    bg.state.tabs.map((t) => t.url).sort(),
    ["https://current.example/", "https://new.example/", "https://old.example/"]
  );
});

test("slot: closing the bound tab forgets the binding", async () => {
  const bg = await loadBackground({
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, url: "https://current.example/" }],
    local: { slots: { [WORK]: { 1: "https://mail.example/" } } }
  });

  await bg.command("open-slot-1");
  const slotTabId = bg.state.tabs.find((t) => t.id !== 1).id;
  await bg.removeTab(slotTabId);
  await settle();

  assert.deepEqual(bg.browser.storage.session.data.bindings, {});
});

test("open-tab-in-group: new tab sits next to the current one, same container and group", async () => {
  const bg = await loadBackground({
    tabs: [
      { id: 1, cookieStoreId: WORK, url: "https://a.example/", groupId: 100 },
      { id: 2, active: true, cookieStoreId: WORK, url: "https://b.example/", groupId: 100 },
      { id: 3, url: "https://c.example/" }
    ]
  });
  bg.state.groups.push({ id: 100, windowId: 1, title: "Work", color: "blue" });

  await bg.command("open-tab-in-group");

  const created = bg.state.tabs.find((t) => ![1, 2, 3].includes(t.id));
  assert.equal(created.index, 2);
  assert.equal(created.cookieStoreId, WORK);
  assert.equal(created.groupId, 100);
});

test("focus-next-group / focus-previous-group: move between groups and wrap", async () => {
  const bg = await loadBackground({
    tabs: [
      { id: 1, groupId: 100, active: true },
      { id: 2, groupId: 100 },
      { id: 3, groupId: 101 },
      { id: 4 },
      { id: 5, groupId: 102 }
    ]
  });
  bg.state.groups.push(
    { id: 100, windowId: 1, title: "A" },
    { id: 101, windowId: 1, title: "B" },
    { id: 102, windowId: 1, title: "C" }
  );
  const activeId = () => bg.state.tabs.find((t) => t.active).id;

  await bg.command("focus-next-group");
  assert.equal(activeId(), 3);
  await bg.command("focus-next-group");
  assert.equal(activeId(), 5);
  await bg.command("focus-next-group");
  assert.equal(activeId(), 1, "wraps to the first group");
  await bg.command("focus-previous-group");
  assert.equal(activeId(), 5, "wraps to the last group");

  await bg.browser.tabs.update(4, { active: true });
  await bg.command("focus-previous-group");
  assert.equal(activeId(), 3, "works from an ungrouped tab");
});

test("group-tabs-by-container: one group per container, slot tabs first, pinned tabs untouched", async () => {
  const bg = await loadBackground({
    containers: CONTAINERS,
    tabs: [
      { id: 1, pinned: true, cookieStoreId: WORK, url: "https://pinned.example/" },
      { id: 2, active: true, cookieStoreId: WORK, url: "https://docs.example/" },
      { id: 3, url: "https://news.example/" },
      { id: 4, cookieStoreId: WORK, url: "https://mail.example/inbox" },
      { id: 5, cookieStoreId: PERSONAL, url: "https://photos.example/" },
      { id: 6, windowId: 2, cookieStoreId: WORK, url: "https://other-window.example/" }
    ],
    local: { slots: { [WORK]: { 1: "https://mail.example/" } } }
  });

  await bg.command("group-tabs-by-container");

  const groupOf = (title) => bg.state.groups.find((g) => g.title === title);
  const order = (groupId) =>
    bg.state.tabs.filter((t) => t.groupId === groupId).sort((a, b) => a.index - b.index).map((t) => t.id);

  assert.equal(bg.tab(1).groupId, -1, "pinned tab not grouped");
  assert.equal(bg.tab(6).groupId, -1, "other window untouched");
  assert.deepEqual(order(groupOf("No Container").id), [3]);
  assert.deepEqual(order(groupOf("Work").id), [4, 2], "slot tab sorted first");
  assert.equal(groupOf("Work").color, "blue");
  assert.equal(groupOf("Personal").color, "cyan", "turquoise maps to cyan");
  assert.equal(bg.state.groups.length, 3);
});

test("auto-group new tabs: off by default", async () => {
  const bg = await loadBackground({ containers: CONTAINERS, tabs: [{ id: 1, active: true }] });

  await bg.browser.tabs.create({ cookieStoreId: WORK });
  await settle();

  assert.equal(bg.state.groups.length, 0);
});

test("auto-group new tabs: when enabled, joins the container's existing group", async () => {
  const bg = await loadBackground({
    containers: CONTAINERS,
    tabs: [{ id: 1, active: true, cookieStoreId: WORK, groupId: 100 }],
    local: { autoGroupNewTabs: true }
  });
  bg.state.groups.push({ id: 100, windowId: 1, title: "Work", color: "blue" });

  const created = await bg.browser.tabs.create({ cookieStoreId: WORK });
  await settle();

  assert.equal(bg.tab(created.id).groupId, 100);
  assert.equal(bg.state.groups.length, 1);
});
