// Keeps the demo config valid and its documented examples true.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateRouting } from "../src/config/validate.js";
import { matchUrl } from "../src/routing/match.js";

const demo = JSON.parse(readFileSync(new URL("../docs/demo/routing-sample.json", import.meta.url), "utf8"));

test("demo config: passes validation", () => {
  assert.deepEqual(validateRouting(demo.routing), []);
});

test("demo config: names a container for every destination", () => {
  assert.deepEqual(
    Object.keys(demo.containerNames).sort(),
    demo.routing.destinations.map((d) => d.id).sort()
  );
});

test("demo config: the examples in docs/demo/README.md route as documented", () => {
  const where = (url) => {
    const decision = matchUrl(url, demo.routing);
    return [decision.category?.label ?? decision.kind, decision.destinationId];
  };
  assert.deepEqual(where("https://www.drupal.org/project/claro/issues/3565271"), ["Claro", "dest-drupal"]);
  assert.deepEqual(where("https://www.drupal.org/project/drupal/issues/3400000"), ["Drupal Core", "dest-drupal"]);
  assert.deepEqual(where("https://www.drupal.org/i/3565271"), ["Drupal general", "dest-drupal"]);
  assert.deepEqual(where("https://www.drupal.org/node/3565271"), ["Drupal general", "dest-drupal"]);
  assert.deepEqual(where("https://claude.ai/new"), ["Claude", "dest-personal-ai"]);
  assert.deepEqual(where("https://github.com/copilot"), ["GitHub Copilot", "dest-work-dev"]);
  assert.deepEqual(where("https://github.com/mgifford"), ["fallback", "dest-misc"]);
  assert.deepEqual(where("https://blog.example/post"), ["fallback", "dest-misc"]);
});

test("demo config: personal and work AI destinations use different account contexts", () => {
  const contextOf = (id) => demo.routing.destinations.find((d) => d.id === id).accountContextId;
  assert.notEqual(contextOf("dest-personal-ai"), contextOf("dest-work-dev"));
});
