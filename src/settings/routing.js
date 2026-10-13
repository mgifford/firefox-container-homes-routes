import { emptyRouting } from "../config/schema.js";
import { validateContainerBindings, validateRouting } from "../config/validate.js";
import { removeAccountContext, removeDestination, saveAccountContext, saveDestination } from "../routing/edit.js";
import { describeRule, explainUrl } from "../routing/explain.js";
import { findAmbiguousRules } from "../routing/match.js";
import { DEFAULT_COOKIE_STORE_ID, findSharedContainers, resolveDestination } from "../routing/resolve.js";

const testForm = document.querySelector("#test-form");
const testUrl = document.querySelector("#test-url");
const testSummary = document.querySelector("#test-summary");
const testDetails = document.querySelector("#test-details");
const testProblem = document.querySelector("#test-problem");
const checkResults = document.querySelector("#check-results");
const setup = document.querySelector("#setup");
const editStatus = document.querySelector("#edit-status");
const accountsHeading = document.querySelector("#accounts-heading");
const accountList = document.querySelector("#account-list");
const accountForm = document.querySelector("#account-form");
const accountLegend = document.querySelector("#account-legend");
const accountLabel = document.querySelector("#account-label");
const accountError = document.querySelector("#account-error");
const accountSubmit = document.querySelector("#account-submit");
const accountCancel = document.querySelector("#account-cancel");
const destinationsHeading = document.querySelector("#destinations-heading");
const destinationTable = document.querySelector("#destination-table");
const destinationForm = document.querySelector("#destination-form");
const destinationLegend = document.querySelector("#destination-legend");
const destinationLabel = document.querySelector("#destination-label");
const destinationAccount = document.querySelector("#destination-account");
const destinationContainer = document.querySelector("#destination-container");
const destinationError = document.querySelector("#destination-error");
const destinationSubmit = document.querySelector("#destination-submit");
const destinationCancel = document.querySelector("#destination-cancel");

// Container select value that creates a new container on save.
const NEW_CONTAINER = "new";

// { routing (null until set up), containerBindings, containers }
let context = null;
let editingAccountId = null;
let editingDestinationId = null;
// data-focus-key of the control to focus after the next render.
let pendingFocus = null;

async function loadContext() {
  const [{ routing, containerBindings = {} }, containers] = await Promise.all([
    browser.storage.local.get(["routing", "containerBindings"]),
    browser.contextualIdentities.query({})
  ]);
  return { routing: routing ?? null, containerBindings, containers };
}

function element(tag, text, props = {}) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return Object.assign(node, props);
}

function labelOf(list, id) {
  return list.find((item) => item.id === id)?.label ?? `(missing: ${id})`;
}

function renderCheck() {
  const items = [];
  if (!context.routing) {
    items.push("No routing is set up yet. See docs/demo/README.md to load the demo setup.");
  } else {
    const { routing, containerBindings } = context;
    for (const problem of [...validateRouting(routing), ...validateContainerBindings(containerBindings, routing)]) {
      items.push(`Problem: ${problem}`);
    }
    for (const group of findAmbiguousRules(routing)) {
      const rules = group.map((rule) => `${describeRule(rule)} (${labelOf(routing.categories, rule.categoryId)})`);
      items.push(`Conflict: these rules match the same links equally: ${rules.join("; ")}. Give one a higher priority.`);
    }
    for (const shared of findSharedContainers(routing, containerBindings)) {
      const destinations = shared.destinationIds.map((id) => labelOf(routing.destinations, id)).join(", ");
      const accounts = shared.accountContextIds.map((id) => labelOf(routing.accountContexts, id)).join(" and ");
      items.push(
        `Warning: ${destinations} share one container but belong to ${accounts}. Sign-ins in that container are shared between them.`
      );
    }
    if (items.length === 0) items.push("No problems found.");
  }
  checkResults.replaceChildren(...items.map((text) => element("li", text)));
}

function table(caption, headers, rows) {
  const node = element("table");
  node.append(element("caption", caption));
  const head = element("thead");
  const headRow = element("tr");
  for (const header of headers) headRow.append(element("th", header, { scope: "col" }));
  head.append(headRow);
  const body = element("tbody");
  for (const row of rows) {
    const tr = element("tr");
    row.forEach((cell, index) => {
      const node = element(index === 0 ? "th" : "td", undefined, index === 0 ? { scope: "row" } : {});
      node.append(cell);
      tr.append(node);
    });
    body.append(tr);
  }
  node.append(head, body);
  return node;
}

// Lets a table scroll on its own when it is wider than the page, so the
// page itself never scrolls sideways. Tables without controls get a tab
// stop and a name, so keyboard users can scroll them too.
function scrollable(tableNode, { hasControls = false } = {}) {
  const wrapper = element("div", undefined, { className: "table-scroll" });
  if (!hasControls) {
    wrapper.tabIndex = 0;
    wrapper.setAttribute("role", "region");
    wrapper.setAttribute("aria-label", `${tableNode.caption.textContent} table`);
  }
  wrapper.append(tableNode);
  return wrapper;
}

function renderSetup() {
  if (!context.routing) {
    setup.replaceChildren(element("p", "Nothing to show yet."));
    return;
  }
  const { routing } = context;

  const categoryRows = routing.categories.map((category) => [
    category.label,
    labelOf(routing.destinations, category.defaultDestinationId),
    category.destinationIds.map((id) => labelOf(routing.destinations, id)).join(", ")
  ]);

  const ruleRows = routing.rules.map((rule) => [describeRule(rule), labelOf(routing.categories, rule.categoryId)]);

  const fallback =
    routing.fallbackDestinationId === null
      ? "None: unmatched links stay in their current container."
      : labelOf(routing.destinations, routing.fallbackDestinationId);

  setup.replaceChildren(
    scrollable(table("Categories", ["Category", "Default destination", "All destinations"], categoryRows)),
    scrollable(table("Rules", ["Matches", "Category"], ruleRows)),
    element("p", `Fallback for links no rule matches: ${fallback}`)
  );
}

function renderTest() {
  const url = testUrl.value.trim();
  testDetails.replaceChildren();
  testProblem.hidden = true;
  if (!url) {
    testSummary.textContent = "";
    return;
  }
  if (!context.routing) {
    testSummary.textContent = "No routing is set up yet, so links open as usual.";
    return;
  }

  const { summary, details, problem } = explainUrl(url, { ...context, sourceCookieStoreId: undefined });
  testSummary.textContent = summary;
  for (const [term, description] of details) {
    testDetails.append(element("dt", term), element("dd", description));
  }
  if (problem) {
    testProblem.textContent = `Problem: ${problem}`;
    testProblem.hidden = false;
  }
}

// A button whose accessible name includes the item, such as "Edit Work".
function actionButton(verb, name, focusKey, onClick) {
  const button = element("button", verb, { type: "button" });
  button.append(element("span", ` ${name}`, { className: "visually-hidden" }));
  button.dataset.focusKey = focusKey;
  button.addEventListener("click", onClick);
  return button;
}

function announce(message) {
  editStatus.textContent = message;
}

function showError(errorNode, field, message) {
  announce("");
  errorNode.textContent = message;
  errorNode.hidden = false;
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", errorNode.id);
  field.focus();
}

function clearErrors(errorNode, fields) {
  errorNode.hidden = true;
  errorNode.textContent = "";
  for (const field of fields) {
    field.removeAttribute("aria-invalid");
    field.removeAttribute("aria-describedby");
  }
}

function renderAccounts() {
  const accounts = context.routing?.accountContexts ?? [];
  if (editingAccountId && !accounts.some((a) => a.id === editingAccountId)) resetAccountForm();
  if (accounts.length === 0) {
    accountList.replaceChildren(element("li", "No accounts yet."));
    return;
  }
  accountList.replaceChildren(
    ...accounts.map((account) => {
      const item = element("li");
      item.append(
        element("span", account.label, { className: "item-name" }),
        actionButton("Edit", account.label, `edit-account:${account.id}`, () => startAccountEdit(account.id)),
        actionButton("Remove", account.label, `remove-account:${account.id}`, () => guarded(removeAccount)(account.id))
      );
      return item;
    })
  );
}

function renderDestinations() {
  const routing = context.routing ?? emptyRouting();
  const { containerBindings, containers } = context;
  if (editingDestinationId && !routing.destinations.some((d) => d.id === editingDestinationId)) resetDestinationForm();

  if (routing.destinations.length === 0) {
    destinationTable.replaceChildren(element("p", "No destinations yet."));
  } else {
    const rows = routing.destinations.map((destination) => {
      const resolved = resolveDestination(destination.id, routing, containerBindings, containers);
      const actions = element("div", undefined, { className: "row-actions" });
      actions.append(
        actionButton("Edit", destination.label, `edit-destination:${destination.id}`, () => startDestinationEdit(destination.id)),
        actionButton("Remove", destination.label, `remove-destination:${destination.id}`, () => guarded(removeDestinationById)(destination.id))
      );
      return [
        destination.label,
        labelOf(routing.accountContexts, destination.accountContextId),
        resolved.ok ? resolved.containerName : `Problem: ${resolved.message}`,
        actions
      ];
    });
    // The section heading already says "Destinations"; the caption is for screen readers.
    const destinations = table("Destinations", ["Destination", "Account", "Container", "Actions"], rows);
    destinations.caption.className = "visually-hidden";
    destinationTable.replaceChildren(scrollable(destinations, { hasControls: true }));
  }

  fillAccountSelect(destinationAccount.value);
  fillContainerSelect(destinationContainer.value);
}

function fillAccountSelect(selected) {
  const accounts = context.routing?.accountContexts ?? [];
  destinationAccount.replaceChildren(
    new Option(accounts.length > 0 ? "Choose an account" : "Add an account first", ""),
    ...accounts.map((account) => new Option(account.label, account.id))
  );
  destinationAccount.value = selected || (accounts.length === 1 ? accounts[0].id : "");
}

function fillContainerSelect(selected) {
  const options = [
    new Option("Not chosen yet", ""),
    ...context.containers.map((container) => new Option(container.name, container.cookieStoreId)),
    new Option("No container", DEFAULT_COOKIE_STORE_ID),
    new Option("New container", NEW_CONTAINER)
  ];
  if (selected && !options.some((option) => option.value === selected)) {
    options.splice(1, 0, new Option("Current choice (no longer available)", selected));
  }
  destinationContainer.replaceChildren(...options);
  destinationContainer.value = selected ?? "";
}

function startAccountEdit(id) {
  const account = context.routing.accountContexts.find((a) => a.id === id);
  editingAccountId = id;
  clearErrors(accountError, [accountLabel]);
  accountLegend.textContent = `Edit account "${account.label}"`;
  accountLabel.value = account.label;
  accountSubmit.textContent = "Save changes";
  accountCancel.hidden = false;
  accountLabel.focus();
}

function resetAccountForm() {
  editingAccountId = null;
  clearErrors(accountError, [accountLabel]);
  accountLegend.textContent = "Add an account";
  accountLabel.value = "";
  accountSubmit.textContent = "Add account";
  accountCancel.hidden = true;
}

function startDestinationEdit(id) {
  const destination = context.routing.destinations.find((d) => d.id === id);
  editingDestinationId = id;
  clearErrors(destinationError, [destinationLabel, destinationAccount]);
  destinationLegend.textContent = `Edit destination "${destination.label}"`;
  destinationLabel.value = destination.label;
  fillAccountSelect(destination.accountContextId);
  fillContainerSelect(context.containerBindings[id] ?? "");
  destinationSubmit.textContent = "Save changes";
  destinationCancel.hidden = false;
  destinationLabel.focus();
}

function resetDestinationForm() {
  editingDestinationId = null;
  clearErrors(destinationError, [destinationLabel, destinationAccount]);
  destinationLegend.textContent = "Add a destination";
  destinationLabel.value = "";
  fillAccountSelect("");
  fillContainerSelect("");
  destinationSubmit.textContent = "Add destination";
  destinationCancel.hidden = true;
}

// Saves to storage and re-renders, then focuses `focusKey` if given.
async function write(items, focusKey = null) {
  await browser.storage.local.set(items);
  pendingFocus = focusKey;
  await refresh();
}

async function saveAccount() {
  const editing = editingAccountId;
  const result = saveAccountContext(context.routing ?? emptyRouting(), { id: editing, label: accountLabel.value });
  if (result.error) {
    showError(accountError, accountLabel, result.error);
    return;
  }
  const label = result.routing.accountContexts.find((a) => a.id === result.id).label;
  resetAccountForm();
  await write({ routing: result.routing }, editing ? `edit-account:${result.id}` : null);
  if (!editing) accountLabel.focus();
  announce(editing ? `Saved account "${label}".` : `Added account "${label}".`);
}

async function removeAccount(id) {
  const result = removeAccountContext(context.routing, id);
  if (result.error) {
    announce(result.error);
    return;
  }
  const label = labelOf(context.routing.accountContexts, id);
  await write({ routing: result.routing });
  accountsHeading.focus();
  announce(`Removed account "${label}".`);
}

async function saveDestinationForm() {
  const editing = editingDestinationId;
  const routing = context.routing ?? emptyRouting();
  const fields = { id: editing, label: destinationLabel.value, accountContextId: destinationAccount.value };
  let cookieStoreId = destinationContainer.value || null;

  // Check the name and account before creating a container for them.
  const check = saveDestination(routing, context.containerBindings, { ...fields, cookieStoreId: null });
  if (check.error) {
    showError(destinationError, check.field === "label" ? destinationLabel : destinationAccount, check.error);
    return;
  }
  const label = fields.label.trim();
  const messages = [];
  if (cookieStoreId === NEW_CONTAINER) {
    const container = await browser.contextualIdentities.create({ name: label, color: "blue", icon: "circle" });
    cookieStoreId = container.cookieStoreId;
    messages.push(`Created container "${label}".`);
  }

  const result = saveDestination(routing, context.containerBindings, { ...fields, cookieStoreId });
  messages.unshift(editing ? `Saved destination "${label}".` : `Added destination "${label}".`);
  if (findSharedContainers(result.routing, result.containerBindings).some((s) => s.destinationIds.includes(result.id))) {
    messages.push("Warning: its container is also used by another account, so sign-ins there are shared.");
  }
  resetDestinationForm();
  await write(
    { routing: result.routing, containerBindings: result.containerBindings },
    editing ? `edit-destination:${result.id}` : null
  );
  if (!editing) destinationLabel.focus();
  announce(messages.join(" "));
}

async function removeDestinationById(id) {
  const result = removeDestination(context.routing, context.containerBindings, id);
  if (result.error) {
    announce(result.error);
    return;
  }
  const label = labelOf(context.routing.destinations, id);
  await write({ routing: result.routing, containerBindings: result.containerBindings });
  destinationsHeading.focus();
  announce(`Removed destination "${label}".`);
}

// Runs an edit, reporting a failed storage or container call.
function guarded(action) {
  return (...args) =>
    action(...args).catch((error) => {
      console.error(error);
      announce(`Problem: could not save. ${error.message}`);
    });
}

async function refresh() {
  context = await loadContext();
  const focusKey = pendingFocus ?? document.activeElement?.dataset?.focusKey;
  pendingFocus = null;
  renderCheck();
  renderAccounts();
  renderDestinations();
  renderSetup();
  if (testSummary.textContent) renderTest();
  if (focusKey) document.querySelector(`[data-focus-key="${CSS.escape(focusKey)}"]`)?.focus();
}

const saveAccountGuarded = guarded(saveAccount);
const saveDestinationGuarded = guarded(saveDestinationForm);

accountForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveAccountGuarded();
});
accountCancel.addEventListener("click", () => {
  const id = editingAccountId;
  resetAccountForm();
  document.querySelector(`[data-focus-key="${CSS.escape(`edit-account:${id}`)}"]`)?.focus();
});
destinationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  saveDestinationGuarded();
});
destinationCancel.addEventListener("click", () => {
  const id = editingDestinationId;
  resetDestinationForm();
  document.querySelector(`[data-focus-key="${CSS.escape(`edit-destination:${id}`)}"]`)?.focus();
});

testForm.addEventListener("submit", (event) => {
  event.preventDefault();
  renderTest();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && ("routing" in changes || "containerBindings" in changes)) refresh();
});
browser.contextualIdentities.onCreated?.addListener(refresh);
browser.contextualIdentities.onRemoved?.addListener(refresh);
browser.contextualIdentities.onUpdated?.addListener(refresh);

refresh().catch((error) => {
  console.error(error);
  checkResults.replaceChildren(element("li", `Problem: could not load routing settings: ${error.message}`));
});
