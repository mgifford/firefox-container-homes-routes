import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeUrl } from "../src/options/url.js";

test("normalizeUrl: a bare domain or path gets https://", () => {
  assert.equal(normalizeUrl("drupal.org"), "https://drupal.org/");
  assert.equal(normalizeUrl(" drupal.org/project/claro "), "https://drupal.org/project/claro");
  assert.equal(normalizeUrl("localhost:8080/app"), "https://localhost:8080/app");
});

test("normalizeUrl: an explicit scheme is kept", () => {
  assert.equal(normalizeUrl("http://intranet.example/"), "http://intranet.example/");
  assert.equal(normalizeUrl("HTTPS://Drupal.org"), "https://drupal.org/");
  assert.equal(normalizeUrl("about:blank"), "about:blank");
});

test("normalizeUrl: text that is not a URL is refused", () => {
  assert.throws(() => normalizeUrl("not a url"), TypeError);
  assert.throws(() => normalizeUrl("https://"), TypeError);
  assert.throws(() => normalizeUrl("drupal .org"), TypeError);
});
