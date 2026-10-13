import { test } from "node:test";
import assert from "node:assert/strict";
import { validateContainerBindings, validateRouting } from "../src/config/validate.js";
import { removeAccountContext, removeDestination, saveAccountContext, saveDestination } from "../src/routing/edit.js";
import { containerBindings, sampleRouting } from "./fixtures/routing.mjs";

const makeId = () => "new";

function assertValid({ routing, containerBindings: bindings = containerBindings }) {
  assert.deepEqual(validateRouting(routing), []);
  assert.deepEqual(validateContainerBindings(bindings, routing), []);
}

test("accounts: add with a trimmed name and a new id", () => {
  const routing = sampleRouting();
  const result = saveAccountContext(routing, { label: "  Client A " }, makeId);
  assert.equal(result.id, "ctx-new");
  assert.deepEqual(result.routing.accountContexts.at(-1), { id: "ctx-new", label: "Client A" });
  assert.equal(routing.accountContexts.length, 2, "input is not modified");
  assertValid(result);
});

test("accounts: rename keeps the id; its own name may change case", () => {
  const result = saveAccountContext(sampleRouting(), { id: "ctx-work", label: "WORK" });
  assert.deepEqual(result.routing.accountContexts[1], { id: "ctx-work", label: "WORK" });
});

test("accounts: empty and duplicate names are refused", () => {
  assert.deepEqual(saveAccountContext(sampleRouting(), { label: "  " }), { error: "Enter a name.", field: "label" });
  assert.deepEqual(saveAccountContext(sampleRouting(), { label: "personal" }), {
    error: 'Another account is already called "Personal".',
    field: "label"
  });
});

test("accounts: removal is refused while destinations belong to it", () => {
  assert.deepEqual(removeAccountContext(sampleRouting(), "ctx-work"), {
    error: '"Work" still has destinations: Work development. Move them to another account or remove them first.'
  });
  const empty = saveAccountContext(sampleRouting(), { label: "Spare" }, makeId).routing;
  const result = removeAccountContext(empty, "ctx-new");
  assert.deepEqual(result.routing.accountContexts.map((c) => c.id), ["ctx-personal", "ctx-work"]);
});

test("destinations: add a Firefox destination with its container", () => {
  const result = saveDestination(
    sampleRouting(),
    containerBindings,
    { label: "Client A", accountContextId: "ctx-work", cookieStoreId: "firefox-container-9" },
    makeId
  );
  assert.equal(result.id, "dest-new");
  assert.deepEqual(result.routing.destinations.at(-1), {
    id: "dest-new",
    label: "Client A",
    accountContextId: "ctx-work",
    browser: "firefox"
  });
  assert.equal(result.containerBindings["dest-new"], "firefox-container-9");
  assert.equal(containerBindings["dest-new"], undefined, "input is not modified");
  assertValid(result);
});

test("destinations: edit changes name, account and container; null clears the container", () => {
  const moved = saveDestination(sampleRouting(), containerBindings, {
    id: "dest-drupal",
    label: "Drupal work",
    accountContextId: "ctx-work",
    cookieStoreId: "firefox-container-3"
  });
  assert.deepEqual(moved.routing.destinations[0], {
    id: "dest-drupal",
    label: "Drupal work",
    accountContextId: "ctx-work",
    browser: "firefox"
  });
  assert.equal(moved.containerBindings["dest-drupal"], "firefox-container-3");

  const cleared = saveDestination(sampleRouting(), containerBindings, {
    id: "dest-drupal",
    label: "Drupal",
    accountContextId: "ctx-personal",
    cookieStoreId: null
  });
  assert.equal("dest-drupal" in cleared.containerBindings, false);
  assertValid(cleared);
});

test("destinations: empty or duplicate name and unknown account are refused", () => {
  const save = (changes) =>
    saveDestination(sampleRouting(), containerBindings, { label: "New", accountContextId: "ctx-work", cookieStoreId: null, ...changes });
  assert.deepEqual(save({ label: "" }), { error: "Enter a name.", field: "label" });
  assert.deepEqual(save({ label: "misc" }), { error: 'Another destination is already called "Misc".', field: "label" });
  assert.deepEqual(save({ accountContextId: "" }), { error: "Choose an account.", field: "accountContextId" });
});

test("destinations: removal is refused while a category or the fallback uses it", () => {
  assert.deepEqual(removeDestination(sampleRouting(), containerBindings, "dest-drupal"), {
    error: '"Drupal" is used by the categories Claro, Drupal general. Choose another destination there first.'
  });
  assert.deepEqual(removeDestination(sampleRouting(), containerBindings, "dest-misc"), {
    error: '"Misc" is used by the fallback. Choose another destination there first.'
  });
});

test("destinations: removal drops the destination and its container choice", () => {
  const routing = sampleRouting();
  routing.categories[2].destinationIds = ["dest-personal-ai"];
  const result = removeDestination(routing, containerBindings, "dest-work-dev");
  assert.equal(result.routing.destinations.some((d) => d.id === "dest-work-dev"), false);
  assert.equal("dest-work-dev" in result.containerBindings, false);
  assertValid(result);
});
