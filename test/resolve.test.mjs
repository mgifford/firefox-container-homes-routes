import { test } from "node:test";
import assert from "node:assert/strict";
import { findSharedContainers, resolveDestination } from "../src/routing/resolve.js";

const routing = {
  accountContexts: [
    { id: "ctx-personal", label: "Personal" },
    { id: "ctx-work", label: "Work" }
  ],
  destinations: [
    { id: "dest-drupal", label: "Drupal", accountContextId: "ctx-personal", browser: "firefox" },
    { id: "dest-personal-ai", label: "Personal AI", accountContextId: "ctx-personal", browser: "firefox" },
    { id: "dest-work-dev", label: "Work development", accountContextId: "ctx-work", browser: "firefox" },
    { id: "dest-misc", label: "Misc", accountContextId: "ctx-personal", browser: "firefox" },
    { id: "dest-safari", label: "Safari", accountContextId: "ctx-personal", browser: "safari" }
  ],
  categories: [],
  rules: [],
  fallbackDestinationId: "dest-misc"
};

const containers = [
  { cookieStoreId: "firefox-container-1", name: "Drupal" },
  { cookieStoreId: "firefox-container-2", name: "Personal AI" },
  { cookieStoreId: "firefox-container-3", name: "Work development" },
  { cookieStoreId: "firefox-container-9", name: "Drupal" }
];

const bindings = {
  "dest-drupal": "firefox-container-1",
  "dest-personal-ai": "firefox-container-2",
  "dest-work-dev": "firefox-container-3",
  "dest-misc": "firefox-default"
};

const resolve = (id, b = bindings, c = containers) => resolveDestination(id, routing, b, c);

test("resolves a destination to its bound container and account context", () => {
  const result = resolve("dest-drupal");
  assert.equal(result.ok, true);
  assert.equal(result.cookieStoreId, "firefox-container-1");
  assert.equal(result.containerName, "Drupal");
  assert.equal(result.accountContext.label, "Personal");
  assert.equal(result.destination.label, "Drupal");
});

test("personal and work destinations resolve to different containers and contexts", () => {
  const personal = resolve("dest-personal-ai");
  const work = resolve("dest-work-dev");
  assert.notEqual(personal.cookieStoreId, work.cookieStoreId);
  assert.notEqual(personal.accountContext.id, work.accountContext.id);
});

test("binds by container id, not by name, so duplicate names are told apart", () => {
  const result = resolve("dest-drupal", { ...bindings, "dest-drupal": "firefox-container-9" });
  assert.equal(result.cookieStoreId, "firefox-container-9");
});

test("a destination may use the default (no container) context", () => {
  const result = resolve("dest-misc");
  assert.equal(result.ok, true);
  assert.equal(result.cookieStoreId, "firefox-default");
  assert.equal(result.containerName, "No container");
});

test("errors are recoverable and say what to do", () => {
  const cases = [
    ["dest-gone", bindings, "unknown-destination"],
    ["dest-safari", bindings, "unsupported-browser"],
    ["dest-drupal", { ...bindings, "dest-drupal": undefined }, "no-container"],
    ["dest-drupal", { ...bindings, "dest-drupal": "firefox-private" }, "private-container"],
    ["dest-drupal", { ...bindings, "dest-drupal": "firefox-container-404" }, "container-missing"]
  ];
  for (const [id, b, code] of cases) {
    const result = resolve(id, b);
    assert.equal(result.ok, false, code);
    assert.equal(result.code, code);
    assert.equal(result.destinationId, id);
    assert.match(result.message, /settings|Choose/, `${code} message tells the user what to do`);
  }
});

test("a removed container is reported by the destination's label", () => {
  const result = resolve("dest-personal-ai", bindings, containers.filter((c) => c.name !== "Personal AI"));
  assert.equal(result.code, "container-missing");
  assert.match(result.message, /"Personal AI"/);
});

test("shared containers: destinations in one account context may share", () => {
  const sameContext = { ...bindings, "dest-personal-ai": "firefox-container-1" };
  assert.deepEqual(findSharedContainers(routing, sameContext), []);
});

test("shared containers: personal and work in one container are reported", () => {
  const mixed = { ...bindings, "dest-work-dev": "firefox-container-2" };
  assert.deepEqual(findSharedContainers(routing, mixed), [
    {
      cookieStoreId: "firefox-container-2",
      destinationIds: ["dest-personal-ai", "dest-work-dev"],
      accountContextIds: ["ctx-personal", "ctx-work"]
    }
  ]);
});

test("shared containers: unbound destinations are ignored", () => {
  assert.deepEqual(findSharedContainers(routing, {}), []);
});
