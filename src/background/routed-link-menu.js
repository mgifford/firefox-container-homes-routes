// "Open routed link" on the link context menu, plus an "Open routed link
// in" submenu for choosing another destination once (the one-time
// override). Titles and submenu entries are rebuilt each time the menu
// opens, so the menu itself explains where the link will go.
//
// Background scripts here are event pages: menu items persist while the
// script is suspended, so the fixed items are created on install/update
// only, and the per-link submenu entries are tracked in session storage.

import { menuText, planRoutedOpen, routingChoices } from "../routing/plan.js";
import { DEFAULT_COOKIE_STORE_ID } from "../routing/resolve.js";

const OPEN_ID = "open-routed-link";
const CHOOSE_ID = "open-routed-link-in";
const CHOICE_PREFIX = `${CHOOSE_ID}:`;
const LINK_PATTERNS = ["http://*/*", "https://*/*"];

// Bumped whenever a menu opens or closes, so a slow onShown handler for a
// menu that has since closed doesn't update the next one.
let menuInstance = 0;

async function loadContext(tab) {
  const [{ routing, containerBindings = {} }, containers] = await Promise.all([
    browser.storage.local.get(["routing", "containerBindings"]),
    browser.contextualIdentities.query({})
  ]);
  // A fresh install has an empty routing section from the migration;
  // with no rules and no fallback there is nothing to route.
  if (!routing || (routing.rules.length === 0 && routing.fallbackDestinationId === null)) return null;
  return {
    routing,
    containerBindings,
    containers,
    sourceCookieStoreId: tab?.cookieStoreId ?? DEFAULT_COOKIE_STORE_ID
  };
}

async function replaceChoiceItems(choices) {
  const { routedMenuChoiceIds = [] } = await browser.storage.session.get("routedMenuChoiceIds");
  for (const id of routedMenuChoiceIds) {
    try {
      await browser.menus.remove(id);
    } catch {
      // Already gone (for example after an add-on reload).
    }
  }

  const ids = [];
  for (const choice of choices) {
    const id = `${CHOICE_PREFIX}${choice.destinationId}`;
    browser.menus.create({ id, parentId: CHOOSE_ID, title: menuText(choice.title), enabled: choice.enabled });
    ids.push(id);
  }
  await browser.storage.session.set({ routedMenuChoiceIds: ids });
}

async function handleShown(info, tab) {
  if (!info.menuIds.includes(OPEN_ID)) return;
  const instance = ++menuInstance;

  // Never route from a private window: the link would leave private browsing.
  if (tab?.incognito) {
    await browser.menus.update(OPEN_ID, { visible: false });
    await browser.menus.update(CHOOSE_ID, { visible: false });
    browser.menus.refresh();
    return;
  }

  const context = await loadContext(tab);
  if (instance !== menuInstance) return;

  if (!context) {
    await browser.menus.update(OPEN_ID, {
      visible: true,
      enabled: false,
      title: "Open routed link (no routing set up yet)"
    });
    await browser.menus.update(CHOOSE_ID, { visible: false });
    browser.menus.refresh();
    return;
  }

  const plan = planRoutedOpen(info.linkUrl, context);
  const choices = routingChoices(info.linkUrl, context);

  await browser.menus.update(OPEN_ID, {
    visible: true,
    enabled: plan.action === "open",
    title: menuText(plan.title)
  });
  await browser.menus.update(CHOOSE_ID, { visible: choices.length > 0 });
  await replaceChoiceItems(choices);
  if (instance !== menuInstance) return;
  browser.menus.refresh();
}

async function handleClicked(info, tab) {
  const id = String(info.menuItemId);
  if (id !== OPEN_ID && !id.startsWith(CHOICE_PREFIX)) return;
  if (!tab || tab.incognito || !info.linkUrl) return;

  const context = await loadContext(tab);
  if (!context) return;

  const overrideDestinationId = id.startsWith(CHOICE_PREFIX) ? id.slice(CHOICE_PREFIX.length) : undefined;
  // Planned again on click: settings or containers may have changed since
  // the menu opened.
  const plan = planRoutedOpen(info.linkUrl, context, { overrideDestinationId });
  if (plan.action !== "open") {
    console.warn(`Container Homes: ${plan.title}`);
    return;
  }

  await browser.tabs.create({
    url: info.linkUrl,
    cookieStoreId: plan.cookieStoreId,
    windowId: tab.windowId,
    index: tab.index + 1,
    active: true
  });
}

export function registerRoutedLinkMenu() {
  browser.runtime.onInstalled.addListener(() => {
    browser.menus.create({ id: OPEN_ID, title: "Open routed link", contexts: ["link"], targetUrlPatterns: LINK_PATTERNS });
    browser.menus.create({
      id: CHOOSE_ID,
      title: menuText("Open routed link in"),
      contexts: ["link"],
      targetUrlPatterns: LINK_PATTERNS
    });
  });

  browser.menus.onShown.addListener((info, tab) => {
    handleShown(info, tab).catch((error) => console.error("Container Homes: menu update failed:", error));
  });
  browser.menus.onHidden.addListener(() => {
    menuInstance++;
  });
  browser.menus.onClicked.addListener((info, tab) => {
    handleClicked(info, tab).catch((error) => console.error("Container Homes: routed open failed:", error));
  });
}
