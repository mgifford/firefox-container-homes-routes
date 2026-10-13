import { test } from "node:test";
import assert from "node:assert/strict";
import { menuText, planRoutedOpen, routingChoices } from "../src/routing/plan.js";
import { CLARO_ISSUE, containerBindings, containers, sampleRouting } from "./fixtures/routing.mjs";

function context(overrides = {}) {
  return {
    routing: sampleRouting(),
    containerBindings: { ...containerBindings },
    containers,
    sourceCookieStoreId: "firefox-container-4",
    ...overrides
  };
}

test("plan: a Claro issue opens in the Drupal container, named with its category", () => {
  assert.deepEqual(planRoutedOpen(CLARO_ISSUE, context()), {
    action: "open",
    cookieStoreId: "firefox-container-1",
    title: "Open routed link in Drupal (Claro)"
  });
});

test("plan: personal and work destinations open in different containers", () => {
  const personal = planRoutedOpen("https://claude.ai/new", context());
  const work = planRoutedOpen("https://claude.ai/new", context(), { overrideDestinationId: "dest-work-dev" });
  assert.equal(personal.cookieStoreId, "firefox-container-2");
  assert.equal(work.cookieStoreId, "firefox-container-3");
  assert.equal(work.title, "Open routed link in Work development");
});

test("plan: unmatched links go to the fallback container", () => {
  assert.deepEqual(planRoutedOpen("https://blog.example/", context()), {
    action: "open",
    cookieStoreId: "firefox-container-4",
    title: "Open routed link in Misc (no rule matches)"
  });
});

test("plan: without a fallback, unmatched links open in the current container", () => {
  const ctx = context({ sourceCookieStoreId: "firefox-container-2" });
  ctx.routing.fallbackDestinationId = null;
  assert.deepEqual(planRoutedOpen("https://blog.example/", ctx), {
    action: "open",
    cookieStoreId: "firefox-container-2",
    title: "Open routed link in this container (no rule matches)"
  });
});

test("plan: sign-in pages open in the current container, even with an override", () => {
  const ctx = context({ sourceCookieStoreId: "firefox-container-2" });
  const plan = planRoutedOpen("https://accounts.google.com/signin", ctx, { overrideDestinationId: "dest-work-dev" });
  assert.equal(plan.action, "open");
  assert.equal(plan.cookieStoreId, "firefox-container-2");
  assert.match(plan.title, /Google sign-in in this container/);
});

test("plan: a removed container is a recoverable error, not a wrong container", () => {
  const plan = planRoutedOpen(CLARO_ISSUE, context({ containers: containers.slice(1) }));
  assert.equal(plan.action, "error");
  assert.match(plan.title, /container for "Drupal" was removed/);
});

test("plan: a destination without a container asks the user to choose one", () => {
  const ctx = context();
  delete ctx.containerBindings["dest-drupal"];
  const plan = planRoutedOpen(CLARO_ISSUE, ctx);
  assert.equal(plan.action, "error");
  assert.match(plan.title, /Choose a container for "Drupal"/);
});

test("plan: conflicting rules are mentioned in the title", () => {
  const ctx = context();
  ctx.routing.rules.push({ id: "rule-dup", categoryId: "cat-claude", host: "drupal.org", includeSubdomains: true, priority: 0 });
  assert.match(planRoutedOpen("https://www.drupal.org/about", ctx).title, /rules conflict/);
});

test("choices: the category's other destinations come first, the default is left out", () => {
  const titles = routingChoices("https://claude.ai/new", context()).map((c) => c.title);
  assert.deepEqual(titles, ["Work development (Work)", "Drupal (Personal)", "Misc (Personal)"]);
});

test("choices: unusable destinations are listed, disabled, with the reason", () => {
  const ctx = context();
  delete ctx.containerBindings["dest-work-dev"];
  const [work] = routingChoices("https://claude.ai/new", ctx);
  assert.equal(work.enabled, false);
  assert.match(work.title, /^Work development: Choose a container/);
});

test("choices: sign-in pages and non-web links offer none", () => {
  assert.deepEqual(routingChoices("https://accounts.google.com/", context()), []);
  assert.deepEqual(routingChoices("mailto:someone@example.org", context()), []);
});

test("menu text escapes & so Firefox doesn't treat it as an access key", () => {
  assert.equal(menuText("R&D (Work)"), "R&&D (Work)");
});

test("site rules: the title names the matched site; choices list every other destination", () => {
  const ctx = context();
  ctx.routing.rules.push({ id: "site-docs", destinationId: "dest-work-dev", host: "docs.google.com", includeSubdomains: true, priority: 0 });
  const plan = planRoutedOpen("https://docs.google.com/document/d/1", ctx);
  assert.deepEqual(plan, {
    action: "open",
    cookieStoreId: "firefox-container-3",
    title: "Open routed link in Work development (docs.google.com)"
  });
  const titles = routingChoices("https://docs.google.com/document/d/1", ctx).map((c) => c.title);
  assert.deepEqual(titles, ["Drupal (Personal)", "Personal AI (Personal)", "Misc (Personal)"]);
});
