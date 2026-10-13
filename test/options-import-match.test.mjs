import { test } from "node:test";
import assert from "node:assert/strict";
import { findContainerId } from "../src/options/import-match.js";

const here = [
  { cookieStoreId: "firefox-container-1", name: "Personal" },
  { cookieStoreId: "firefox-container-2", name: "Work" },
  { cookieStoreId: "firefox-container-7", name: "Banking" }
];

test("findContainerId: same install keeps the id", () => {
  const entry = { cookieStoreId: "firefox-container-2", label: "Work" };
  assert.equal(findContainerId(entry, here), "firefox-container-2");
});

test("findContainerId: a different id with the same name matches by name", () => {
  const entry = { cookieStoreId: "firefox-container-12", label: "Banking" };
  assert.equal(findContainerId(entry, here), "firefox-container-7");
});

test("findContainerId: an id used here by another container matches by name", () => {
  const entry = { cookieStoreId: "firefox-container-1", label: "Work" };
  assert.equal(findContainerId(entry, here), "firefox-container-2");
});

test("findContainerId: a name not found here returns null", () => {
  const entry = { cookieStoreId: "firefox-container-1", label: "Client A" };
  assert.equal(findContainerId(entry, here), null);
});

test("findContainerId: a name used by two containers returns null", () => {
  const withDuplicate = [
    ...here,
    { cookieStoreId: "firefox-container-9", name: "Work" }
  ];
  const entry = { cookieStoreId: "firefox-container-4", label: "Work" };
  assert.equal(findContainerId(entry, withDuplicate), null);
});

test("findContainerId: firefox-default stays as is", () => {
  const entry = { cookieStoreId: "firefox-default", label: "No container / Default" };
  assert.equal(findContainerId(entry, here), "firefox-default");
  assert.equal(findContainerId({ cookieStoreId: "firefox-default" }, []), "firefox-default");
});

test("findContainerId: an entry without a label keeps an existing id", () => {
  assert.equal(findContainerId({ cookieStoreId: "firefox-container-1" }, here), "firefox-container-1");
  assert.equal(findContainerId({ cookieStoreId: "firefox-container-5" }, here), null);
});
