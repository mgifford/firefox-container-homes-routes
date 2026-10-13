import { test } from "node:test";
import assert from "node:assert/strict";
import { CONFIG_VERSION, emptyRouting, migrateConfig } from "../src/config/schema.js";
import { validateContainerBindings, validateRouting } from "../src/config/validate.js";

// Applies a migration to a whole stored object, like storage.local.set would.
function migrated(stored) {
  const { updates, error } = migrateConfig(stored);
  assert.equal(error, undefined);
  return { ...stored, ...updates };
}

function validRouting() {
  return {
    accountContexts: [
      { id: "ctx-personal", label: "Personal" },
      { id: "ctx-work", label: "Work" }
    ],
    destinations: [
      { id: "dest-drupal", label: "Drupal", accountContextId: "ctx-personal", browser: "firefox" },
      { id: "dest-ai-personal", label: "Personal AI", accountContextId: "ctx-personal", browser: "firefox" },
      { id: "dest-ai-work", label: "Work AI", accountContextId: "ctx-work", browser: "firefox" },
      { id: "dest-misc", label: "Misc", accountContextId: "ctx-personal", browser: "firefox" }
    ],
    categories: [
      { id: "cat-claro", label: "Claro", destinationIds: ["dest-drupal"], defaultDestinationId: "dest-drupal" },
      {
        id: "cat-ai",
        label: "AI assistants",
        destinationIds: ["dest-ai-personal", "dest-ai-work"],
        defaultDestinationId: "dest-ai-personal"
      }
    ],
    rules: [
      {
        id: "rule-claro",
        categoryId: "cat-claro",
        host: "www.drupal.org",
        includeSubdomains: false,
        pathPrefix: "/project/claro/issues/",
        priority: 0
      },
      { id: "rule-claude", categoryId: "cat-ai", host: "claude.ai", includeSubdomains: false, priority: 0 }
    ],
    fallbackDestinationId: "dest-misc"
  };
}

// --- Migration ---------------------------------------------------------

test("migration: a fresh install gets the current version and empty routing", () => {
  assert.deepEqual(migrated({}), {
    configVersion: CONFIG_VERSION,
    routing: emptyRouting(),
    containerBindings: {}
  });
});

test("migration: v1 settings are carried over unchanged", () => {
  const v1 = {
    configVersion: 1,
    homes: { "firefox-default": "https://home.example/", "firefox-container-3": "https://work.example/" },
    slots: { "firefox-container-3": { 1: "https://mail.example/", 9: "https://chat.example/" } },
    autoGroupNewTabs: true
  };
  const before = structuredClone(v1);
  const after = migrated(v1);

  assert.deepEqual(after.homes, before.homes);
  assert.deepEqual(after.slots, before.slots);
  assert.equal(after.autoGroupNewTabs, true);
  assert.equal(after.configVersion, CONFIG_VERSION);
  assert.deepEqual(after.routing, emptyRouting());
  assert.deepEqual(v1, before, "input object not mutated");
});

test("migration: settings from before 0.3.0 (no version) are treated as v1", () => {
  const after = migrated({ homes: { "firefox-default": "https://home.example/" } });
  assert.deepEqual(after.homes, { "firefox-default": "https://home.example/" });
  assert.equal(after.configVersion, CONFIG_VERSION);
});

test("migration: running twice changes nothing the second time", () => {
  const once = migrated({ configVersion: 1, homes: {} });
  assert.deepEqual(migrateConfig(once), { updates: {} });
});

test("migration: existing routing data is never replaced", () => {
  const routing = validRouting();
  const after = migrated({ configVersion: 1, routing, containerBindings: { "dest-drupal": "firefox-container-1" } });
  assert.deepEqual(after.routing, routing);
  assert.deepEqual(after.containerBindings, { "dest-drupal": "firefox-container-1" });
});

test("migration: a newer stored version is refused, not downgraded", () => {
  const result = migrateConfig({ configVersion: CONFIG_VERSION + 1 });
  assert.equal(result.updates, undefined);
  assert.match(result.error, /newer/);
});

// --- Routing validation --------------------------------------------------

test("validation: an empty routing config is valid", () => {
  assert.deepEqual(validateRouting(emptyRouting()), []);
});

test("validation: a complete example config is valid", () => {
  assert.deepEqual(validateRouting(validRouting()), []);
});

test("validation: labels may repeat, ids may not", () => {
  const routing = validRouting();
  routing.accountContexts[1].label = "Personal";
  assert.deepEqual(validateRouting(routing), []);

  routing.accountContexts[1].id = "ctx-personal";
  assert.deepEqual(validateRouting(routing), [
    'accountContexts[1].id: duplicate id "ctx-personal"',
    'destinations[2].accountContextId: no account context "ctx-work"'
  ]);
});

test("validation: references must point at existing items", () => {
  const routing = validRouting();
  routing.destinations[0].accountContextId = "ctx-gone";
  routing.categories[0].destinationIds = ["dest-gone"];
  routing.rules[0].categoryId = "cat-gone";
  routing.fallbackDestinationId = "dest-gone";

  assert.deepEqual(validateRouting(routing), [
    'destinations[0].accountContextId: no account context "ctx-gone"',
    'categories[0].destinationIds: no destination "dest-gone"',
    "categories[0].defaultDestinationId: must be one of the category's destinations",
    'rules[0].categoryId: no category "cat-gone"',
    'fallbackDestinationId: no destination "dest-gone"'
  ]);
});

test("validation: a category's default must be one of its own destinations", () => {
  const routing = validRouting();
  routing.categories[1].defaultDestinationId = "dest-drupal";
  assert.deepEqual(validateRouting(routing), [
    "categories[1].defaultDestinationId: must be one of the category's destinations"
  ]);
});

test("validation: categories need at least one destination, listed once", () => {
  const routing = validRouting();
  routing.categories[0].destinationIds = [];
  routing.categories[1].destinationIds = ["dest-ai-personal", "dest-ai-personal"];
  assert.deepEqual(validateRouting(routing), [
    "categories[0].destinationIds: must list at least one destination",
    'categories[1].destinationIds: "dest-ai-personal" is listed twice'
  ]);
});

test("validation: only Firefox destinations are supported for now", () => {
  const routing = validRouting();
  routing.destinations[0].browser = "safari";
  assert.deepEqual(validateRouting(routing), ['destinations[0].browser: "safari" is not supported']);
});

test("validation: hosts must be bare, normalised hostnames", () => {
  const cases = {
    "Drupal.org": '"Drupal.org" must be written as "drupal.org"',
    "bücher.example": '"bücher.example" must be written as "xn--bcher-kva.example"',
    "drupal.org:8080": '"drupal.org:8080" must be a hostname only, without a scheme, port, path or wildcard',
    "drupal.org/project": '"drupal.org/project" must be a hostname only, without a scheme, port, path or wildcard',
    "*.drupal.org": '"*.drupal.org" must not contain a wildcard; set includeSubdomains instead',
    "drupal.org.": '"drupal.org." must be written without the trailing dot',
    "drupal org": '"drupal org" is not a valid hostname',
    "": "must be a hostname"
  };
  for (const [host, message] of Object.entries(cases)) {
    const routing = validRouting();
    routing.rules[1].host = host;
    assert.deepEqual(validateRouting(routing), [`rules[1].host: ${message}`], host);
  }
});

test("validation: subdomain inclusion must be stated explicitly", () => {
  const routing = validRouting();
  delete routing.rules[1].includeSubdomains;
  assert.deepEqual(validateRouting(routing), ["rules[1].includeSubdomains: must be true or false"]);
});

test("validation: path prefixes must be normalised paths without query or fragment", () => {
  const cases = {
    "project/claro": "must start with /",
    "/project?x=1": "must not contain ? or #",
    "/a/../b": '"/a/../b" must be written as "/b"'
  };
  for (const [pathPrefix, message] of Object.entries(cases)) {
    const routing = validRouting();
    routing.rules[0].pathPrefix = pathPrefix;
    assert.deepEqual(validateRouting(routing), [`rules[0].pathPrefix: ${message}`], pathPrefix);
  }
});

test("validation: priority must be a whole number", () => {
  const routing = validRouting();
  routing.rules[0].priority = 1.5;
  routing.rules[1].priority = "10";
  assert.deepEqual(validateRouting(routing), [
    "rules[0].priority: must be a whole number",
    "rules[1].priority: must be a whole number"
  ]);
});

test("validation: malformed top-level shapes are reported, not thrown", () => {
  assert.deepEqual(validateRouting(null), ["routing: must be an object"]);
  assert.deepEqual(validateRouting({ ...emptyRouting(), rules: "none", destinations: [null] }), [
    "destinations[0]: must be an object",
    "rules: must be a list"
  ]);
});

// --- Container bindings --------------------------------------------------

test("container bindings: must name existing destinations and container ids", () => {
  const routing = validRouting();
  assert.deepEqual(validateContainerBindings({ "dest-drupal": "firefox-container-4" }, routing), []);
  assert.deepEqual(validateContainerBindings({ "dest-gone": "firefox-container-4", "dest-misc": "" }, routing), [
    "containerBindings.dest-gone: no destination with this id",
    "containerBindings.dest-misc: must be a container id"
  ]);
  assert.deepEqual(validateContainerBindings(null, routing), ["containerBindings: must be an object"]);
});
