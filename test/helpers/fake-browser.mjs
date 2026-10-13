// In-memory stand-in for the parts of the WebExtension `browser` API that
// the background script uses, plus a loader that imports the real
// background.js module against it. This checks the extension's own logic only:
// Firefox's real tab, container and storage behaviour still needs manual
// verification (see docs/manual-verification.md).

const BACKGROUND_PATH = new URL("../../src/background/background.js", import.meta.url);
const NO_GROUP = -1;

function event() {
  const listeners = [];
  return {
    listeners,
    addListener: (fn) => listeners.push(fn),
    fire: (...args) => Promise.all(listeners.map((fn) => fn(...args)))
  };
}

function storageArea(initial = {}) {
  const data = structuredClone(initial);
  return {
    data,
    async get(keys) {
      const list = typeof keys === "string" ? [keys] : keys ?? Object.keys(data);
      const result = {};
      for (const key of list) {
        if (key in data) result[key] = structuredClone(data[key]);
      }
      return result;
    },
    async set(items) {
      Object.assign(data, structuredClone(items));
    }
  };
}

// Supports the "<origin>/*" patterns background.js builds; anything else is
// rejected, which is enough for these tests.
function matchesPattern(url, pattern) {
  if (!pattern.endsWith("/*")) throw new Error(`Unsupported pattern: ${pattern}`);
  const prefix = pattern.slice(0, -1);
  return url.startsWith(prefix);
}

export function createFakeBrowser({ tabs = [], containers = [], local = {}, focusedWindowId = 1 } = {}) {
  let nextTabId = Math.max(0, ...tabs.map((t) => t.id)) + 1;
  let nextGroupId = 100;
  const state = {
    tabs: tabs.map((t) => ({
      windowId: 1,
      active: false,
      pinned: false,
      groupId: NO_GROUP,
      cookieStoreId: "firefox-default",
      url: "about:blank",
      ...t
    })),
    groups: [],
    focusedWindowId,
    containers
  };

  const windowTabs = (windowId) =>
    state.tabs.filter((t) => t.windowId === windowId).sort((a, b) => a.index - b.index);

  function reindex(windowId, ordered) {
    ordered.forEach((t, i) => {
      t.index = i;
    });
    const others = state.tabs.filter((t) => t.windowId !== windowId);
    state.tabs = [...others, ...ordered];
  }

  for (const windowId of new Set(state.tabs.map((t) => t.windowId))) {
    const ordered = windowTabs(windowId);
    reindex(windowId, ordered);
  }

  function findTab(id) {
    const tab = state.tabs.find((t) => t.id === id);
    if (!tab) throw new Error(`Invalid tab ID: ${id}`);
    return tab;
  }

  function dropEmptyGroups() {
    state.groups = state.groups.filter((g) => state.tabs.some((t) => t.groupId === g.id));
  }

  const onCreated = event();
  const onRemoved = event();
  state.menus = new Map();
  state.menuRefreshes = 0;

  const browser = {
    runtime: { onInstalled: event() },
    storage: { local: storageArea(local), session: storageArea() },
    commands: { onCommand: event() },
    menus: {
      onShown: event(),
      onHidden: event(),
      onClicked: event(),
      create(props) {
        if (state.menus.has(props.id)) throw new Error(`Duplicate menu id: ${props.id}`);
        if (props.parentId !== undefined && !state.menus.has(props.parentId)) {
          throw new Error(`Unknown parent menu id: ${props.parentId}`);
        }
        state.menus.set(props.id, { visible: true, enabled: true, ...props });
        return props.id;
      },
      async update(id, props) {
        if (!state.menus.has(id)) throw new Error(`Unknown menu id: ${id}`);
        Object.assign(state.menus.get(id), props);
      },
      async remove(id) {
        if (!state.menus.delete(id)) throw new Error(`Unknown menu id: ${id}`);
      },
      refresh() {
        state.menuRefreshes++;
      }
    },
    action: { onClicked: event() },
    contextualIdentities: {
      async query() {
        return structuredClone(state.containers);
      },
      async get(cookieStoreId) {
        const found = state.containers.find((c) => c.cookieStoreId === cookieStoreId);
        if (!found) throw new Error(`Invalid contextual identity: ${cookieStoreId}`);
        return structuredClone(found);
      }
    },
    windows: {
      async getCurrent() {
        return { id: state.focusedWindowId };
      },
      async update(windowId, { focused }) {
        if (focused) state.focusedWindowId = windowId;
      }
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: NO_GROUP,
      async query({ windowId, title } = {}) {
        return structuredClone(
          state.groups.filter(
            (g) => (windowId === undefined || g.windowId === windowId) && (title === undefined || g.title === title)
          )
        );
      },
      async update(groupId, props) {
        Object.assign(state.groups.find((g) => g.id === groupId), props);
      }
    },
    tabs: {
      onCreated,
      onRemoved,
      async query(q = {}) {
        return structuredClone(
          state.tabs
            .filter((t) => q.active === undefined || t.active === q.active)
            .filter((t) => !q.currentWindow || t.windowId === state.focusedWindowId)
            .filter((t) => q.windowId === undefined || t.windowId === q.windowId)
            .filter((t) => q.cookieStoreId === undefined || t.cookieStoreId === q.cookieStoreId)
            .filter((t) => q.groupId === undefined || t.groupId === q.groupId)
            .filter((t) => q.url === undefined || matchesPattern(t.url, q.url))
            .sort((a, b) => a.windowId - b.windowId || a.index - b.index)
        );
      },
      async get(id) {
        return structuredClone(findTab(id));
      },
      async update(id, { url, active }) {
        const tab = findTab(id);
        if (url !== undefined) tab.url = url;
        if (active) {
          for (const t of state.tabs) if (t.windowId === tab.windowId) t.active = false;
          tab.active = true;
        }
        return structuredClone(tab);
      },
      async create({ cookieStoreId = "firefox-default", url = "about:newtab", index, windowId = state.focusedWindowId } = {}) {
        const ordered = windowTabs(windowId);
        const tab = { id: nextTabId++, windowId, active: true, pinned: false, groupId: NO_GROUP, cookieStoreId, url };
        for (const t of ordered) t.active = false;
        ordered.splice(index ?? ordered.length, 0, tab);
        state.tabs.push(tab);
        reindex(windowId, ordered);
        const snapshot = structuredClone(tab);
        onCreated.fire(structuredClone(tab));
        return snapshot;
      },
      async move(ids, { index }) {
        const list = Array.isArray(ids) ? ids : [ids];
        const windowId = findTab(list[0]).windowId;
        const moving = list.map(findTab);
        const rest = windowTabs(windowId).filter((t) => !list.includes(t.id));
        const at = index === -1 ? rest.length : index;
        rest.splice(at, 0, ...moving);
        reindex(windowId, rest);
      },
      async ungroup(ids) {
        for (const id of [ids].flat()) findTab(id).groupId = NO_GROUP;
        dropEmptyGroups();
      },
      async group({ tabIds, groupId }) {
        const list = [tabIds].flat().map(findTab);
        let id = groupId;
        if (id === undefined) {
          id = nextGroupId++;
          state.groups.push({ id, windowId: list[0].windowId, title: "", color: "grey" });
        }
        for (const t of list) t.groupId = id;
        dropEmptyGroups();
        return id;
      }
    }
  };

  async function removeTab(id) {
    state.tabs = state.tabs.filter((t) => t.id !== id);
    dropEmptyGroups();
    await onRemoved.fire(id, {});
  }

  return { browser, state, removeTab };
}

// Lets fire-and-forget listeners (onCreated, onRemoved) finish their awaits.
export async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
}

let instance = 0;

// The background script's diagnostic logging is noise in test output. The
// test runner reports through its own stream, so failures still show.
for (const level of ["log", "warn", "error"]) console[level] = () => {};

// background.js reads the global `browser` when its listeners run, so each
// call swaps in a fresh fake and imports a fresh copy of the module (the
// query string defeats the module cache). Tests in a file run one at a
// time, so the swap never overlaps a running test.
export async function loadBackground(options) {
  const fake = createFakeBrowser(options);
  globalThis.browser = fake.browser;
  await import(`${BACKGROUND_PATH.href}?instance=${++instance}`);

  const command = (name) => fake.browser.commands.onCommand.fire(name);
  const clickToolbar = (tab) => fake.browser.action.onClicked.fire(tab);
  const tab = (id) => fake.state.tabs.find((t) => t.id === id);

  return { ...fake, command, clickToolbar, tab };
}
