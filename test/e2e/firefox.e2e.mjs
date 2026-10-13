// End-to-end tests in real headless Firefox, driven by Selenium WebDriver.
// They cover what the Node tests' stand-in browser can't: real storage,
// real containers, the extension pages loading as modules, and axe-core
// on Firefox's own rendering.
//
// Run with `npm run test:e2e`. Needs Firefox; see docs/e2e-tests.md.
// The native right-click menu can't be driven by WebDriver, so "Open
// routed link" stays in docs/manual-verification.md.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, openSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { validateRouting } from "../../src/config/validate.js";

const ROOT = new URL("../../", import.meta.url).pathname;
const ADDON_ID = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).browser_specific_settings.gecko.id;
// Fixed with the extensions.webextensions.uuids pref, so page URLs are known.
const UUID = "4b1d6c2e-9a7f-4e3b-8c5d-2f6e1a0b9c7d";
const BASE = `moz-extension://${UUID}`;
const ROUTING_PAGE = `${BASE}/src/settings/routing.html`;
const OPTIONS_PAGE = `${BASE}/src/options/options.html`;
const AXE_SOURCE = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const WAIT = 10_000;

let driver;
let buildDir;
// geckodriver's and Firefox's stdout and stderr.
let firefoxLog;
// How much of firefoxLog has been checked for console errors.
let logOffset = 0;

before(async () => {
  // Install the packaged add-on, the same files `npm run build` ships.
  buildDir = mkdtempSync(join(tmpdir(), "container-homes-e2e-"));
  execFileSync("npx", ["web-ext", "build", "--source-dir", ROOT, "--artifacts-dir", buildDir, "--overwrite-dest"], {
    stdio: "ignore"
  });
  const zip = join(buildDir, readdirSync(buildDir).find((name) => name.endsWith(".zip")));

  const options = new firefox.Options()
    .addArguments("-headless")
    .setPreference("extensions.webextensions.uuids", JSON.stringify({ [ADDON_ID]: UUID }))
    .setPreference("privacy.userContext.enabled", true)
    // Prints page console messages, including extension pages', to stdout,
    // and leaves out Firefox's own, so only pages' messages are printed.
    .setPreference("devtools.console.stdout.content", true)
    .setPreference("devtools.console.stdout.chrome", false);
  if (process.env.FIREFOX_BIN) options.setBinary(process.env.FIREFOX_BIN);

  firefoxLog = join(buildDir, "firefox.log");
  const logFd = openSync(firefoxLog, "a");
  const service = new firefox.ServiceBuilder().setStdio(["ignore", logFd, logFd]);
  driver = await new Builder().forBrowser("firefox").setFirefoxOptions(options).setFirefoxService(service).build();
  await driver.manage().window().setRect({ width: 1280, height: 1024 });
  await driver.installAddon(zip, true);
});

after(async () => {
  await driver?.quit();
  if (buildDir) rmSync(buildDir, { recursive: true, force: true });
});

// Runs `body` in the current extension page with `api` (the page's
// `browser` object), `win` (its window) and `args`, and returns the
// JSON-serialisable result. WebDriver scripts run in a sandbox, so the
// page's own `browser` is reached through wrappedJSObject. Arguments and
// results cross as JSON strings, so no object is shared between the two.
async function inPage(body, args = null) {
  const result = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     const win = window.wrappedJSObject ?? window;
     const api = win.browser;
     const args = JSON.parse(arguments[0]);
     (async () => { ${body} })().then(
       (value) => done(JSON.stringify({ value: value ?? null })),
       (error) => done(JSON.stringify({ error: String(error && error.message || error) }))
     );`,
    JSON.stringify(args)
  );
  const { value, error } = JSON.parse(result);
  if (error) throw new Error(`In page: ${error}`);
  return value;
}

async function open(url) {
  try {
    await driver.get(url);
  } catch (error) {
    if (error.name !== "UnsupportedOperationError") throw error;
    // Load it from the browser chrome instead, as a privileged navigation.
    await driver.setContext(firefox.Context.CHROME);
    try {
      await driver.executeScript(
        `gBrowser.selectedBrowser.fixupAndLoadURIString(arguments[0], {
           triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
         });`,
        url
      );
    } finally {
      await driver.setContext(firefox.Context.CONTENT);
    }
    await driver.wait(async () => (await driver.getCurrentUrl()) === url, WAIT, `did not open ${url}`);
  }
  await driver.wait(async () => (await driver.executeScript("return document.readyState")) === "complete", WAIT);
}

// Errors printed by Firefox since the last call: console.error() calls in
// pages and uncaught exceptions in the add-on's pages. WebDriver BiDi and the
// browser console in the main process don't see extension pages, which run
// in their own process, but devtools.console.stdout.content prints them.
async function newConsoleErrors() {
  await driver.sleep(250);
  const text = readFileSync(firefoxLog, "utf8");
  const fresh = text.slice(logOffset);
  logOffset = text.length;
  return fresh
    .split("\n")
    .filter((line) => line.startsWith("console.error:") || line.startsWith(`JavaScript error: ${BASE}/`));
}

async function textOf(selector) {
  return driver.findElement(By.css(selector)).getText();
}

async function waitForText(selector, pattern) {
  const node = await driver.wait(until.elementLocated(By.css(selector)), WAIT);
  try {
    await driver.wait(async () => pattern.test(await node.getText()), WAIT);
  } catch {
    assert.fail(`${selector} never matched ${pattern}; its text is ${JSON.stringify(await node.getText())}`);
  }
}

async function type(selector, text) {
  const field = await driver.findElement(By.css(selector));
  await field.clear();
  await field.sendKeys(text);
}

async function axeViolations() {
  const result = await driver.executeAsyncScript(
    `const done = arguments[arguments.length - 1];
     ${AXE_SOURCE}
     axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } })
       .then((r) => done(JSON.stringify(r.violations.map((v) => ({
         id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" "))
       })))), (e) => done(JSON.stringify({ error: String(e) })));`
  );
  const parsed = JSON.parse(result);
  if (parsed.error) throw new Error(`axe-core failed: ${parsed.error}`);
  return parsed;
}

function describeViolations(violations) {
  return violations.map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.targets.join("\n    ")}`).join("\n");
}

test("the console collector sees errors from extension pages", async () => {
  // Without this, "no console errors" below could pass by seeing nothing.
  await open(ROUTING_PAGE);
  await newConsoleErrors();
  await inPage("win.console.error('e2e probe'); win.setTimeout(() => { throw new Error('e2e uncaught probe'); }, 0); return null;");
  await driver.sleep(500);
  const errors = await newConsoleErrors();
  assert.ok(errors.some((line) => line.includes("e2e probe")), `console.error was not collected; got ${JSON.stringify(errors)}`);
  assert.ok(errors.some((line) => line.includes("e2e uncaught probe")), `the exception was not collected; got ${JSON.stringify(errors)}`);
});

test("1. both pages load without console errors", async () => {
  await newConsoleErrors();
  await open(ROUTING_PAGE);
  // The add-on stores an empty routing setup on install.
  await waitForText("#check-results", /No problems found|No routing is set up yet/);
  await open(OPTIONS_PAGE);
  await driver.wait(until.elementLocated(By.css('#config input[name="home:firefox-default"]')), WAIT);
  await driver.sleep(500);
  assert.deepEqual(await newConsoleErrors(), []);
});

test("2. routing page: adding a destination with a new container creates a real container", async () => {
  await open(ROUTING_PAGE);
  await type("#account-label", "E2E sign-ins");
  await driver.findElement(By.css("#account-submit")).click();
  await waitForText("#account-list", /E2E sign-ins/);

  await type("#destination-label", "E2E destination");
  // With one account, it is preselected; choose it explicitly anyway.
  await driver.wait(async () => (await driver.findElements(By.css("#destination-account option"))).length === 2, WAIT);
  const accountId = await inPage(
    "return (await api.storage.local.get('routing')).routing.accountContexts.find((a) => a.label === 'E2E sign-ins').id;"
  );
  await driver.findElement(By.css(`#destination-account option[value="${accountId}"]`)).click();
  await driver.findElement(By.css('#destination-container option[value="new"]')).click();
  await driver.findElement(By.css("#destination-submit")).click();
  await waitForText("#edit-status", /Created container "E2E destination"/);

  const containers = await inPage(
    "return (await api.contextualIdentities.query({})).map((c) => ({ name: c.name, cookieStoreId: c.cookieStoreId }));"
  );
  const created = containers.filter((c) => c.name === "E2E destination");
  assert.equal(created.length, 1, `containers: ${JSON.stringify(containers)}`);

  const { routing, containerBindings } = await inPage("return await api.storage.local.get(['routing', 'containerBindings']);");
  const destination = routing.destinations.find((d) => d.label === "E2E destination");
  assert.equal(destination.accountContextId, accountId);
  assert.equal(containerBindings[destination.id], created[0].cookieStoreId);
  await waitForText("#destination-table", /E2E destination/);
});

test("3. routing page: the demo config routes the README examples", async () => {
  await open(ROUTING_PAGE);
  // docs/demo/README.md step 2: create the four containers.
  const { containerNames } = JSON.parse(readFileSync(join(ROOT, "docs/demo/routing-sample.json"), "utf8"));
  await inPage(
    `for (const name of args) await api.contextualIdentities.create({ name, color: "blue", icon: "circle" });`,
    Object.values(containerNames)
  );
  // Step 4: the README's console snippet, run from the extension page.
  // validateRouting is pure, so it runs here in Node instead of being
  // imported into the page.
  const demo = await inPage("return await (await win.fetch(api.runtime.getURL('docs/demo/routing-sample.json'))).json();");
  assert.deepEqual(validateRouting(demo.routing), []);
  const loaded = await inPage(
    `const { routing, containerNames } = args;
     const containers = await api.contextualIdentities.query({});
     const containerBindings = {};
     const problems = [];
     for (const [destinationId, name] of Object.entries(containerNames)) {
       const found = containers.filter((c) => c.name === name);
       if (found.length !== 1) problems.push(found.length + ' containers named ' + name);
       else containerBindings[destinationId] = found[0].cookieStoreId;
     }
     if (problems.length === 0) await api.storage.local.set(win.JSON.parse(JSON.stringify({ routing, containerBindings })));
     return problems;`,
    demo
  );
  assert.deepEqual(loaded, []);
  await waitForText("#check-results", /No problems found/);

  const examples = [
    ["https://www.drupal.org/project/claro/issues/3565271", "Drupal", "Claro"],
    ["https://www.drupal.org/project/drupal/issues/3400000", "Drupal", "Drupal Core"],
    ["https://www.drupal.org/i/3565271", "Drupal", "Drupal general"],
    ["https://www.drupal.org/node/3565271", "Drupal", "Drupal general"],
    ["https://claude.ai/new", "Personal AI", "Claude"],
    ["https://github.com/copilot", "Work development", "GitHub Copilot"],
    ["https://github.com/mgifford", "Misc", null],
    ["https://blog.example/post", "Misc", null]
  ];
  for (const [url, container, category] of examples) {
    await type("#test-url", url);
    await driver.findElement(By.css('#test-form button[type="submit"]')).click();
    await waitForText("#test-summary", new RegExp(`^Opens in the ${container} container\\.$`));
    const details = await textOf("#test-details");
    if (category) assert.match(details, new RegExp(`Category\\s+${category}\\b`), `${url}: ${details}`);
    else assert.match(details, /None matches; using the fallback destination/, `${url}: ${details}`);
    assert.equal(await driver.findElement(By.css("#test-problem")).isDisplayed(), false, url);
  }
});

const AXE_PAGES = [
  ["routing settings", ROUTING_PAGE, async () => waitForText("#setup", /Categories/)],
  ["options", OPTIONS_PAGE, async () => driver.wait(until.elementLocated(By.css("#config button[type=submit]")), WAIT)]
];
for (const [name, url, ready] of AXE_PAGES) {
  test(`4. axe-core finds no WCAG 2.0-2.2 A/AA violations on the ${name} page`, async () => {
    await open(url);
    await ready();
    const violations = await axeViolations();
    assert.equal(violations.length, 0, `axe violations:\n${describeViolations(violations)}`);
  });
}

test("5. options page: a bare domain in a home field is saved as https://", async () => {
  await open(OPTIONS_PAGE);
  const home = await driver.wait(until.elementLocated(By.css('#config input[name="home:firefox-default"]')), WAIT);
  await home.clear();
  await home.sendKeys("drupal.org");
  await driver.findElement(By.css("#config button[type=submit]")).click();
  await waitForText("#status", /^Saved\.$/);
  const { homes } = await inPage("return await api.storage.local.get('homes');");
  assert.equal(homes["firefox-default"], "https://drupal.org/");
  assert.equal(await home.getAttribute("value"), "https://drupal.org/");
});

test("no console errors during the rest of the run", async () => {
  assert.deepEqual(await newConsoleErrors(), []);
});
