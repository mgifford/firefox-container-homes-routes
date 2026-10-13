import { test } from "node:test";
import assert from "node:assert/strict";
import { describeRule, explainUrl } from "../src/routing/explain.js";
import { CLARO_ISSUE, containerBindings, containers, sampleRouting } from "./fixtures/routing.mjs";

const context = (changes = {}) => ({ routing: sampleRouting(), containerBindings: { ...containerBindings }, containers, ...changes });

test("describeRule: host, subdomains, path and priority in plain words", () => {
  assert.equal(
    describeRule({ host: "drupal.org", includeSubdomains: true, pathPrefix: "/project/claro/issues", priority: 0 }),
    "drupal.org and its subdomains, paths starting /project/claro/issues"
  );
  assert.equal(describeRule({ host: "claude.ai", includeSubdomains: false, priority: 5 }), "claude.ai, priority 5");
});

test("explain: a routed link names the rule, category, destination, account and container", () => {
  assert.deepEqual(explainUrl(CLARO_ISSUE, context()), {
    summary: "Opens in the Drupal container.",
    details: [
      ["Rule", "drupal.org and its subdomains, paths starting /project/claro/issues"],
      ["Category", "Claro"],
      ["Destination", "Drupal"],
      ["Account", "Personal"],
      ["Container", "Drupal"]
    ],
    problem: null
  });
});

test("explain: the fallback is named as such", () => {
  const result = explainUrl("https://blog.example/", context());
  assert.equal(result.summary, "Opens in the Misc container.");
  assert.deepEqual(result.details[0], ["Rule", "None matches; using the fallback destination"]);
});

test("explain: sign-in pages, non-web links and no fallback each get a sentence", () => {
  assert.match(explainUrl("https://accounts.google.com/", context()).summary, /Google sign-in page/);
  assert.match(explainUrl("mailto:a@example.org", context()).summary, /Only web links/);
  const noFallback = context();
  noFallback.routing.fallbackDestinationId = null;
  assert.match(explainUrl("https://blog.example/", noFallback).summary, /stays in its current container/);
});

test("explain: a missing container is reported as the problem to fix", () => {
  const result = explainUrl(CLARO_ISSUE, context({ containers: containers.slice(1) }));
  assert.equal(result.summary, "This link can't be routed right now.");
  assert.match(result.problem, /container for "Drupal" was removed/);
  assert.deepEqual(result.details.at(-1), ["Destination", "Drupal"]);
});

test("explain: conflicting rules are named, with how to resolve them", () => {
  const ctx = context();
  ctx.routing.rules.push({ id: "rule-dup", categoryId: "cat-claude", host: "drupal.org", includeSubdomains: true, priority: 0 });
  const result = explainUrl("https://www.drupal.org/about", ctx);
  assert.match(result.problem, /drupal\.org and its subdomains \(Claude\)/);
  assert.match(result.problem, /higher priority/);
});
