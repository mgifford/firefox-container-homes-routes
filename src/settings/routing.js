import { validateContainerBindings, validateRouting } from "../config/validate.js";
import { describeRule, explainUrl } from "../routing/explain.js";
import { findAmbiguousRules } from "../routing/match.js";
import { findSharedContainers, resolveDestination } from "../routing/resolve.js";

const testForm = document.querySelector("#test-form");
const testUrl = document.querySelector("#test-url");
const testSummary = document.querySelector("#test-summary");
const testDetails = document.querySelector("#test-details");
const testProblem = document.querySelector("#test-problem");
const checkResults = document.querySelector("#check-results");
const setup = document.querySelector("#setup");

let context = null;

async function loadContext() {
  const [{ routing, containerBindings = {} }, containers] = await Promise.all([
    browser.storage.local.get(["routing", "containerBindings"]),
    browser.contextualIdentities.query({})
  ]);
  return routing ? { routing, containerBindings, containers } : null;
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
  if (!context) {
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
    row.forEach((cell, index) => tr.append(element(index === 0 ? "th" : "td", cell, index === 0 ? { scope: "row" } : {})));
    body.append(tr);
  }
  node.append(head, body);
  return node;
}

function renderSetup() {
  if (!context) {
    setup.replaceChildren(element("p", "Nothing to show yet."));
    return;
  }
  const { routing, containerBindings, containers } = context;

  const destinationRows = routing.destinations.map((destination) => {
    const resolved = resolveDestination(destination.id, routing, containerBindings, containers);
    return [
      destination.label,
      labelOf(routing.accountContexts, destination.accountContextId),
      resolved.ok ? resolved.containerName : `Problem: ${resolved.message}`
    ];
  });

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
    table("Destinations", ["Destination", "Account", "Container"], destinationRows),
    table("Categories", ["Category", "Default destination", "All destinations"], categoryRows),
    table("Rules", ["Matches", "Category"], ruleRows),
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
  if (!context) {
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

async function refresh() {
  context = await loadContext();
  renderCheck();
  renderSetup();
  if (testSummary.textContent) renderTest();
}

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
