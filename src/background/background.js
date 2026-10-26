const CONFIG_VERSION = 1;

browser.runtime.onInstalled.addListener(async () => {
  const { configVersion } = await browser.storage.local.get("configVersion");
  if (configVersion === undefined) {
    await browser.storage.local.set({ configVersion: CONFIG_VERSION });
  }
});

async function openContainerHome(tab) {
  if (!tab) return;

  const { homes = {} } = await browser.storage.local.get("homes");
  const url = homes[tab.cookieStoreId];

  console.log("Container Homes:", {
    tabId: tab.id,
    cookieStoreId: tab.cookieStoreId,
    configuredUrl: url
  });

  if (!url) {
    console.warn(
      `No home URL configured for container: ${tab.cookieStoreId}`
    );
    return;
  }

  await browser.tabs.update(tab.id, { url });
}

function bindingKey(cookieStoreId, slotNumber) {
  return `${cookieStoreId}:${slotNumber}`;
}

async function getBinding(cookieStoreId, slotNumber) {
  const { bindings = {} } = await browser.storage.session.get("bindings");
  return bindings[bindingKey(cookieStoreId, slotNumber)] ?? null;
}

async function setBinding(cookieStoreId, slotNumber, tabId, url) {
  const { bindings = {} } = await browser.storage.session.get("bindings");
  bindings[bindingKey(cookieStoreId, slotNumber)] = { tabId, url };
  await browser.storage.session.set({ bindings });
}

async function clearBindingsForTab(tabId) {
  const { bindings = {} } = await browser.storage.session.get("bindings");
  let changed = false;

  for (const [key, binding] of Object.entries(bindings)) {
    if (binding.tabId === tabId) {
      delete bindings[key];
      changed = true;
    }
  }

  if (changed) await browser.storage.session.set({ bindings });
}

function isEmptyTab(tab) {
  return tab && (tab.url === "about:blank" || tab.url === "about:newtab");
}

function matchPatternFor(url) {
  try {
    return `${new URL(url).origin}/*`;
  } catch {
    return null;
  }
}

async function focusTab(tab) {
  await browser.tabs.update(tab.id, { active: true });
  await browser.windows.update(tab.windowId, { focused: true });
}

// Only trusts a binding while it still points at the currently configured
// URL — otherwise a slot that's been repointed at a new app would keep
// resolving to whatever tab the old URL last used. Pure: never writes
// bindings or focuses tabs, so it's safe to reuse for read-only sorting.
async function resolveSlotTab(cookieStoreId, slotNumber, url) {
  const binding = await getBinding(cookieStoreId, slotNumber);
  if (binding && binding.url === url) {
    try {
      return { tab: await browser.tabs.get(binding.tabId), viaBinding: true };
    } catch {
      // Bound tab is gone (closed, or browser restarted); fall through.
    }
  }

  const matchPattern = matchPatternFor(url);
  if (!matchPattern) return null;

  // Several slots can share an origin (e.g. two Outlook accounts), so skip
  // tabs already bound to another slot in this container, and prefer a tab
  // whose URL starts with this slot's URL over a mere same-origin match.
  const { bindings = {} } = await browser.storage.session.get("bindings");
  const ownKey = bindingKey(cookieStoreId, slotNumber);
  const claimedTabIds = new Set(
    Object.entries(bindings)
      .filter(([key]) => key !== ownKey && key.startsWith(`${cookieStoreId}:`))
      .map(([, binding]) => binding.tabId)
  );

  const candidates = (await browser.tabs.query({ cookieStoreId, url: matchPattern }))
    .filter((candidate) => !claimedTabIds.has(candidate.id));
  const tab = candidates.find((candidate) => candidate.url.startsWith(url)) ?? candidates[0];
  return tab ? { tab, viaBinding: false } : null;
}

async function activateSlot(slotNumber, activeTab) {
  if (!activeTab) return;

  const { cookieStoreId } = activeTab;
  const { slots = {} } = await browser.storage.local.get("slots");
  const url = slots[cookieStoreId]?.[slotNumber];

  if (!url) {
    console.warn(
      `No slot ${slotNumber} configured for container: ${cookieStoreId}`
    );
    return;
  }

  const resolved = await resolveSlotTab(cookieStoreId, slotNumber, url);
  if (resolved) {
    if (!resolved.viaBinding) {
      await setBinding(cookieStoreId, slotNumber, resolved.tab.id, url);
    }
    await focusTab(resolved.tab);
    return;
  }

  if (isEmptyTab(activeTab)) {
    await browser.tabs.update(activeTab.id, { url });
    await setBinding(cookieStoreId, slotNumber, activeTab.id, url);
    return;
  }

  const newTab = await browser.tabs.create({ cookieStoreId, url });
  await setBinding(cookieStoreId, slotNumber, newTab.id, url);
}

const DEFAULT_COOKIE_STORE_ID = "firefox-default";

// contextualIdentities colors (both legacy and current names) mapped to the
// nearest tabGroups.Color enum value.
const CONTAINER_COLOR_TO_GROUP_COLOR = {
  blue: "blue",
  cyan: "cyan",
  turquoise: "cyan",
  grey: "grey",
  gray: "grey",
  toolbar: "grey",
  green: "green",
  yellow: "yellow",
  orange: "orange",
  red: "red",
  pink: "pink",
  purple: "purple",
  violet: "purple"
};

function mapContainerColorToGroupColor(color) {
  return CONTAINER_COLOR_TO_GROUP_COLOR[color] ?? "grey";
}

// The title/color a tab group for this container should have, matching
// groupTabsByContainer's "No Container" bucket and per-container buckets.
async function groupInfoForCookieStoreId(cookieStoreId) {
  if (cookieStoreId === DEFAULT_COOKIE_STORE_ID) {
    return { title: "No Container", color: "grey" };
  }

  try {
    const identity = await browser.contextualIdentities.get(cookieStoreId);
    return { title: identity.name, color: mapContainerColorToGroupColor(identity.color) };
  } catch {
    // Container was removed since the tab was created; fall back.
    return { title: "No Container", color: "grey" };
  }
}

// Orders a container's tabs so configured-slot tabs come first (ascending
// slot number), followed by the rest in their existing relative order.
async function sortContainerTabs(cookieStoreId, tabs, containerSlots, windowId) {
  const tabIdSet = new Set(tabs.map((t) => t.id));
  const usedTabIds = new Set();
  const slotTabIds = [];

  for (let slotNumber = 1; slotNumber <= 9; slotNumber++) {
    const url = containerSlots[slotNumber];
    if (!url) continue;

    const resolved = await resolveSlotTab(cookieStoreId, slotNumber, url);
    if (!resolved) continue;

    const { tab } = resolved;
    if (tab.windowId !== windowId) continue;
    if (!tabIdSet.has(tab.id) || usedTabIds.has(tab.id)) continue;

    slotTabIds.push(tab.id);
    usedTabIds.add(tab.id);
  }

  const restTabIds = tabs
    .filter((t) => !usedTabIds.has(t.id))
    .map((t) => t.id);

  return [...slotTabIds, ...restTabIds];
}

// Firefox may silently drop a tab out of its group when that tab is moved
// to an index outside the group's current bounds, so reordering grouped
// tabs in place isn't safe. Instead: ungroup first (so there's no group
// membership left to disturb), move the now-ungrouped tabs into the
// correct order at the end of the strip, and only then form a fresh group
// over the settled tabs. Any previous same-title group empties out and is
// auto-removed by the ungroup step, so this is safe to re-run.
async function groupSortedTabs(title, color, tabIds) {
  await browser.tabs.ungroup(tabIds);
  await browser.tabs.move(tabIds, { index: -1 });

  const groupId = await browser.tabs.group({ tabIds });
  await browser.tabGroups.update(groupId, { title, color });
}

async function groupTabsByContainer() {
  if (typeof browser.tabs.group !== "function") {
    console.warn(
      "Container Homes: tab groups aren't supported on this platform (e.g. Firefox for Android); skipping."
    );
    return;
  }

  const { id: windowId } = await browser.windows.getCurrent();

  const [allTabs, containers, { slots: allSlots = {} }] = await Promise.all([
    browser.tabs.query({ windowId }),
    browser.contextualIdentities.query({}),
    browser.storage.local.get("slots")
  ]);

  const nonPinned = allTabs.filter((t) => !t.pinned);

  const buckets = [
    { cookieStoreId: DEFAULT_COOKIE_STORE_ID, title: "No Container", color: "grey" },
    ...containers.map((c) => ({
      cookieStoreId: c.cookieStoreId,
      title: c.name,
      color: mapContainerColorToGroupColor(c.color)
    }))
  ];

  const tabsByContainer = new Map();
  for (const tab of nonPinned) {
    const list = tabsByContainer.get(tab.cookieStoreId) ?? [];
    list.push(tab);
    tabsByContainer.set(tab.cookieStoreId, list);
  }

  for (const bucket of buckets) {
    const tabs = tabsByContainer.get(bucket.cookieStoreId);
    if (!tabs || tabs.length === 0) continue;

    try {
      const containerSlots = allSlots[bucket.cookieStoreId] || {};
      const sortedTabIds = await sortContainerTabs(
        bucket.cookieStoreId,
        tabs,
        containerSlots,
        windowId
      );

      await groupSortedTabs(bucket.title, bucket.color, sortedTabIds);
    } catch (error) {
      // Don't let one container's failure block the rest from grouping.
      console.error(`Container Homes: failed to group "${bucket.title}":`, error);
    }
  }
}

// Tab groups ordered left-to-right by their leftmost tab's index, each with
// its own tabs pre-sorted by index so the first tab is ready to jump to.
async function getOrderedGroups(windowId) {
  const groups = await browser.tabGroups.query({ windowId });

  const withTabs = await Promise.all(
    groups.map(async (group) => {
      const tabs = await browser.tabs.query({ windowId, groupId: group.id });
      tabs.sort((a, b) => a.index - b.index);
      return { groupId: group.id, position: tabs[0]?.index, tabs };
    })
  );

  return withTabs
    .filter((g) => g.tabs.length > 0)
    .sort((a, b) => a.position - b.position);
}

// direction: -1 for the previous group, +1 for the next. Ordering is based
// on each group's position relative to the active tab's own index, so this
// works whether or not the active tab is currently in a group itself.
// Wraps around at either end.
async function focusAdjacentGroup(direction, activeTab) {
  if (typeof browser.tabGroups?.query !== "function") {
    console.warn(
      "Container Homes: tab groups aren't supported on this platform (e.g. Firefox for Android); skipping."
    );
    return;
  }
  if (!activeTab) return;

  const orderedGroups = await getOrderedGroups(activeTab.windowId);
  if (orderedGroups.length === 0) return;

  const currentGroup =
    activeTab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE
      ? orderedGroups.find((g) => g.groupId === activeTab.groupId)
      : null;
  const referencePosition = currentGroup ? currentGroup.position : activeTab.index;

  let target;
  if (direction > 0) {
    target = orderedGroups.find((g) => g.position > referencePosition);
    if (!target) [target] = orderedGroups;
  } else {
    target = [...orderedGroups].reverse().find((g) => g.position < referencePosition);
    if (!target) target = orderedGroups[orderedGroups.length - 1];
  }

  await browser.tabs.update(target.tabs[0].id, { active: true });
}

// Opens a new tab next to the active tab, in the same container, and joins
// it to the active tab's group (if any) — "container group" just falls out
// of the new tab sharing the active tab's cookieStoreId, no need to special
// -case which groups correspond to a container.
async function openTabInCurrentGroup(activeTab) {
  if (!activeTab) return;

  const newTab = await browser.tabs.create({
    cookieStoreId: activeTab.cookieStoreId,
    index: activeTab.index + 1
  });

  if (
    typeof browser.tabs.group === "function" &&
    activeTab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE
  ) {
    await browser.tabs.group({ tabIds: newTab.id, groupId: activeTab.groupId });
  }
}

browser.commands.onCommand.addListener(async (command) => {
  console.log("Container Homes command received:", command);

  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true
  });

  if (command === "open-container-homes") {
    await openContainerHome(tab);
    return;
  }

  if (command === "group-tabs-by-container") {
    await groupTabsByContainer();
    return;
  }

  if (command === "focus-previous-group") {
    await focusAdjacentGroup(-1, tab);
    return;
  }

  if (command === "focus-next-group") {
    await focusAdjacentGroup(1, tab);
    return;
  }

  if (command === "open-tab-in-group") {
    await openTabInCurrentGroup(tab);
    return;
  }

  const slotMatch = /^open-slot-([1-9])$/.exec(command);
  if (slotMatch) {
    await activateSlot(Number(slotMatch[1]), tab);
  }
});

browser.action.onClicked.addListener(openContainerHome);

browser.tabs.onRemoved.addListener((tabId) => {
  clearBindingsForTab(tabId).catch((error) => console.error(error));
});

// Gated by the "autoGroupNewTabs" preference (default off). Joins the new
// tab to its container's existing tab group in this window, or creates one
// (titled/colored like groupTabsByContainer would) if none exists yet.
async function handleTabCreated(tab) {
  if (typeof browser.tabs.group !== "function") return;

  const { autoGroupNewTabs = false } = await browser.storage.local.get("autoGroupNewTabs");
  if (!autoGroupNewTabs) return;

  if (tab.pinned) return;
  if (tab.groupId !== browser.tabGroups.TAB_GROUP_ID_NONE) return;

  const { title, color } = await groupInfoForCookieStoreId(tab.cookieStoreId);
  const existingGroups = await browser.tabGroups.query({ windowId: tab.windowId, title });

  if (existingGroups.length > 0) {
    await browser.tabs.group({ tabIds: tab.id, groupId: existingGroups[0].id });
    return;
  }

  const groupId = await browser.tabs.group({ tabIds: tab.id });
  await browser.tabGroups.update(groupId, { title, color });
}

browser.tabs.onCreated.addListener((tab) => {
  handleTabCreated(tab).catch((error) =>
    console.error("Container Homes: failed to auto-group new tab:", error)
  );
});
