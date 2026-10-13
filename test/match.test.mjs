import { test } from "node:test";
import assert from "node:assert/strict";
import { findAmbiguousRules, matchUrl, siteHost } from "../src/routing/match.js";

function routing({ rules = [], fallback = "dest-misc" } = {}) {
  const categoryIds = [...new Set(rules.map((r) => r.categoryId))];
  return {
    accountContexts: [{ id: "ctx", label: "Personal" }],
    destinations: [
      ...categoryIds.map((id) => ({ id: `dest-${id}`, label: id, accountContextId: "ctx", browser: "firefox" })),
      { id: "dest-misc", label: "Misc", accountContextId: "ctx", browser: "firefox" },
      { id: "dest-other", label: "Other", accountContextId: "ctx", browser: "firefox" }
    ],
    categories: categoryIds.map((id) => ({
      id,
      label: id,
      destinationIds: [`dest-${id}`],
      defaultDestinationId: `dest-${id}`
    })),
    rules,
    fallbackDestinationId: fallback
  };
}

let ruleCount = 0;
function rule(categoryId, host, extra = {}) {
  return { id: `rule-${++ruleCount}`, categoryId, host, includeSubdomains: true, priority: 0, ...extra };
}

const categoryFor = (url, config) => {
  const decision = matchUrl(url, config);
  return decision.kind === "rule" ? decision.category.id : decision.kind;
};

// --- The Drupal examples from the brief ------------------------------------

const drupal = routing({
  rules: [
    rule("claro", "drupal.org", { pathPrefix: "/project/claro/issues" }),
    rule("core", "drupal.org", { pathPrefix: "/project/drupal/issues" }),
    rule("drupal-general", "drupal.org")
  ]
});

test("drupal: Claro and Core issues go to their own categories, other pages to Drupal general", () => {
  assert.equal(categoryFor("https://www.drupal.org/project/claro/issues/3565271", drupal), "claro");
  assert.equal(categoryFor("https://www.drupal.org/project/claro/issues/3565271#comment-5", drupal), "claro");
  assert.equal(categoryFor("https://www.drupal.org/project/drupal/issues/3400000", drupal), "core");
  assert.equal(categoryFor("https://www.drupal.org/project/claro", drupal), "drupal-general");
  assert.equal(categoryFor("https://api.drupal.org/api/drupal", drupal), "drupal-general");
});

test("drupal: short issue links cannot reveal their project, so they go to Drupal general", () => {
  assert.equal(categoryFor("https://www.drupal.org/i/3565271", drupal), "drupal-general");
  assert.equal(categoryFor("https://www.drupal.org/node/3565271", drupal), "drupal-general");
});

// --- Hostname boundaries ---------------------------------------------------

test("hosts: www and the bare domain are the same site, in both directions", () => {
  const exactBare = routing({ rules: [rule("a", "example.org", { includeSubdomains: false })] });
  const exactWww = routing({ rules: [rule("a", "www.example.org", { includeSubdomains: false })] });
  for (const config of [exactBare, exactWww]) {
    assert.equal(categoryFor("https://example.org/", config), "a");
    assert.equal(categoryFor("https://www.example.org/", config), "a");
  }
  assert.equal(siteHost("www.com"), "www.com", "never collapses to a top-level domain");
});

test("hosts: subdomains match only when the rule includes them", () => {
  const exact = routing({ rules: [rule("a", "example.org", { includeSubdomains: false })] });
  const inclusive = routing({ rules: [rule("a", "example.org")] });
  assert.equal(categoryFor("https://api.example.org/", exact), "fallback");
  assert.equal(categoryFor("https://api.example.org/", inclusive), "a");
  assert.equal(categoryFor("https://deep.api.example.org/", inclusive), "a");
});

test("hosts: the domain name appearing elsewhere in the URL never matches", () => {
  const config = routing({ rules: [rule("a", "drupal.org")] });
  for (const url of [
    "https://evil-drupal.org/",
    "https://notdrupal.org/",
    "https://drupal.org.evil.example/",
    "https://evil.example/drupal.org/",
    "https://evil.example/?next=https://drupal.org/",
    "https://evil.example/#drupal.org",
    "https://drupal.org@evil.example/",
    "https://drupal.org:pass@evil.example/"
  ]) {
    assert.equal(categoryFor(url, config), "fallback", url);
  }
});

test("hosts: case, trailing dots, ports and international names are normalised", () => {
  const config = routing({
    rules: [rule("a", "drupal.org"), rule("b", "xn--bcher-kva.example", { includeSubdomains: false })]
  });
  assert.equal(categoryFor("https://WWW.Drupal.ORG/", config), "a");
  assert.equal(categoryFor("https://drupal.org./", config), "a");
  assert.equal(categoryFor("https://drupal.org:8443/", config), "a");
  assert.equal(categoryFor("https://bücher.example/", config), "b");
});

test("only http and https URLs are routed", () => {
  const config = routing({ rules: [rule("a", "drupal.org")] });
  for (const url of ["ftp://drupal.org/", "file:///drupal.org", "javascript:alert(1)", "about:blank", "not a url"]) {
    assert.deepEqual(matchUrl(url, config), { kind: "unsupported" }, url);
  }
  assert.equal(categoryFor("http://drupal.org/", config), "a");
});

// --- Path boundaries -------------------------------------------------------

test("paths: prefixes match whole segments only", () => {
  const config = routing({ rules: [rule("a", "example.org", { pathPrefix: "/project/claro" })] });
  assert.equal(categoryFor("https://example.org/project/claro", config), "a");
  assert.equal(categoryFor("https://example.org/project/claro/", config), "a");
  assert.equal(categoryFor("https://example.org/project/claro/issues/1", config), "a");
  assert.equal(categoryFor("https://example.org/project/claroline", config), "fallback");
  assert.equal(categoryFor("https://example.org/project", config), "fallback");
  assert.equal(categoryFor("https://example.org/other?path=/project/claro", config), "fallback");
});

test("paths: a trailing slash on the prefix makes no difference", () => {
  const config = routing({ rules: [rule("a", "example.org", { pathPrefix: "/docs/" })] });
  assert.equal(categoryFor("https://example.org/docs", config), "a");
  assert.equal(categoryFor("https://example.org/docs/page", config), "a");
});

test("paths: matching is case-sensitive, as servers usually are", () => {
  const config = routing({ rules: [rule("a", "example.org", { pathPrefix: "/Docs" })] });
  assert.equal(categoryFor("https://example.org/docs", config), "fallback");
});

// --- Precedence ------------------------------------------------------------

test("precedence: a higher priority beats a more specific rule", () => {
  const config = routing({
    rules: [rule("specific", "team.slack.com", { includeSubdomains: false }), rule("broad", "slack.com", { priority: 5 })]
  });
  assert.equal(categoryFor("https://team.slack.com/", config), "broad");
});

test("precedence: at equal priority, a deeper host beats a shallower one", () => {
  const config = routing({ rules: [rule("broad", "slack.com"), rule("team", "team.slack.com")] });
  assert.equal(categoryFor("https://team.slack.com/messages", config), "team");
  assert.equal(categoryFor("https://other.slack.com/", config), "broad");
});

test("precedence: at equal depth, an exact host beats one including subdomains", () => {
  const config = routing({
    rules: [rule("inclusive", "example.org"), rule("exact", "example.org", { includeSubdomains: false })]
  });
  assert.equal(categoryFor("https://example.org/", config), "exact");
  assert.equal(categoryFor("https://www.example.org/", config), "exact");
  assert.equal(categoryFor("https://api.example.org/", config), "inclusive");
});

test("precedence: host specificity is compared before path specificity", () => {
  const config = routing({
    rules: [rule("path", "example.org", { pathPrefix: "/a/b/c" }), rule("host", "api.example.org")]
  });
  assert.equal(categoryFor("https://api.example.org/a/b/c", config), "host");
});

test("precedence: a one-time override beats every rule", () => {
  const config = drupal;
  const decision = matchUrl("https://www.drupal.org/project/claro/issues/1", config, {
    overrideDestinationId: "dest-other"
  });
  assert.deepEqual(decision, { kind: "override", destinationId: "dest-other" });
});

test("precedence: an override naming an unknown destination is ignored", () => {
  const decision = matchUrl("https://www.drupal.org/project/claro/issues/1", drupal, {
    overrideDestinationId: "dest-gone"
  });
  assert.equal(decision.kind, "rule");
});

test("fallback: unmatched links go to the fallback, or stay put without one", () => {
  assert.deepEqual(matchUrl("https://blog.example/", drupal), { kind: "fallback", destinationId: "dest-misc" });
  const noFallback = routing({ rules: [rule("a", "drupal.org")], fallback: null });
  assert.deepEqual(matchUrl("https://blog.example/", noFallback), { kind: "none" });
});

test("rules whose category is missing are skipped", () => {
  const config = routing({ rules: [rule("a", "example.org")] });
  config.rules.push(rule("gone", "example.org", { priority: 9 }));
  assert.equal(categoryFor("https://example.org/", config), "a");
});

test("the decision names the rule, category and default destination", () => {
  const decision = matchUrl("https://www.drupal.org/project/claro/issues/1", drupal);
  assert.equal(decision.kind, "rule");
  assert.equal(decision.rule.pathPrefix, "/project/claro/issues");
  assert.equal(decision.destinationId, "dest-claro");
  assert.deepEqual(decision.ambiguousWith, []);
});

// --- Ambiguity -------------------------------------------------------------

test("ambiguity: tied rules in different categories are flagged; the first listed is used", () => {
  const first = rule("first", "example.org", { pathPrefix: "/docs" });
  const second = rule("second", "www.example.org", { pathPrefix: "/docs/" });
  const config = routing({ rules: [first, second] });

  const decision = matchUrl("https://example.org/docs/page", config);
  assert.equal(decision.category.id, "first");
  assert.deepEqual(decision.ambiguousWith, [second]);
  assert.deepEqual(findAmbiguousRules(config), [[first, second]]);
});

test("ambiguity: tied rules in the same category are not ambiguous", () => {
  const config = routing({ rules: [rule("a", "example.org"), rule("a", "www.example.org")] });
  assert.deepEqual(matchUrl("https://example.org/", config).ambiguousWith, []);
  assert.deepEqual(findAmbiguousRules(config), []);
});

test("ambiguity: rules separated by priority or specificity are not reported", () => {
  const config = routing({
    rules: [
      rule("a", "example.org"),
      rule("b", "example.org", { priority: 1 }),
      rule("c", "example.org", { includeSubdomains: false }),
      rule("d", "example.org", { pathPrefix: "/x" })
    ]
  });
  assert.deepEqual(findAmbiguousRules(config), []);
});

// --- Sign-in pages ---------------------------------------------------------

const everywhere = routing({
  rules: [
    rule("google", "google.com", { priority: 9 }),
    rule("microsoft", "microsoftonline.com", { priority: 9 }),
    rule("live", "live.com", { priority: 9 }),
    rule("github", "github.com", { priority: 9 })
  ]
});

test("sign-in: known provider sign-in pages are never routed", () => {
  for (const [url, provider] of [
    ["https://accounts.google.com/v3/signin/identifier?continue=https://claude.ai", "Google"],
    ["https://accounts.google.com/o/oauth2/v2/auth?client_id=x", "Google"],
    ["https://login.microsoftonline.com/common/oauth2/v2.0/authorize", "Microsoft"],
    ["https://login.live.com/oauth20_authorize.srf", "Microsoft"],
    ["https://github.com/login", "GitHub"],
    ["https://github.com/login/oauth/authorize?client_id=x", "GitHub"],
    ["https://www.github.com/login/device", "GitHub"],
    ["https://github.com/session", "GitHub"],
    ["https://github.com/sessions/two-factor", "GitHub"],
    ["https://github.com/sessions/verified-device", "GitHub"]
  ]) {
    assert.deepEqual(matchUrl(url, everywhere), { kind: "auth", provider }, url);
  }
});

test("sign-in: the guard beats a one-time override and the fallback", () => {
  const decision = matchUrl("https://accounts.google.com/signin", drupal, { overrideDestinationId: "dest-other" });
  assert.deepEqual(decision, { kind: "auth", provider: "Google" });
});

test("sign-in: look-alikes and ordinary pages on provider domains are routed normally", () => {
  for (const url of [
    "https://mail.google.com/mail/u/0/",
    "https://accounts.google.com.evil.example/signin",
    "https://evil.example/accounts.google.com/signin",
    "https://evil.example/login",
    "https://evil.example/oauth/authorize",
    "https://github.com/loginator",
    "https://github.com/someone/login",
    "https://github.com/sessionsx",
    "https://github.com/copilot",
    "https://graph.microsoft.com/login"
  ]) {
    assert.notEqual(matchUrl(url, everywhere).kind, "auth", url);
  }
});

// --- Rules that name a destination ------------------------------------------

function withSiteRules(...rules) {
  const config = routing({ rules: [rule("drupal", "drupal.org")] });
  config.rules.push(...rules);
  return config;
}

test("site rules: a rule naming a destination opens there, with no category", () => {
  const siteRule = { id: "site-1", destinationId: "dest-other", host: "docs.google.com", includeSubdomains: true, priority: 0 };
  const decision = matchUrl("https://docs.google.com/document/d/1", withSiteRules(siteRule));
  assert.deepEqual(decision, { kind: "rule", destinationId: "dest-other", rule: siteRule, category: null, ambiguousWith: [] });
});

test("site rules: precedence is the same as for category rules", () => {
  const deeper = { id: "site-api", destinationId: "dest-other", host: "api.drupal.org", includeSubdomains: false, priority: 0 };
  const config = withSiteRules(deeper);
  assert.equal(matchUrl("https://api.drupal.org/x", config).destinationId, "dest-other");
  assert.equal(matchUrl("https://www.drupal.org/x", config).destinationId, "dest-drupal");
});

test("site rules: a rule whose destination is missing is skipped", () => {
  const config = withSiteRules({ id: "site-gone", destinationId: "dest-gone", host: "drupal.org", includeSubdomains: true, priority: 9 });
  assert.equal(matchUrl("https://drupal.org/", config).destinationId, "dest-drupal");
});

test("site rules: a tie with a category rule, or another destination, is ambiguous; the same destination is not", () => {
  const sameSite = { id: "site-tie", destinationId: "dest-other", host: "drupal.org", includeSubdomains: true, priority: 0 };
  const config = withSiteRules(sameSite);
  assert.deepEqual(matchUrl("https://drupal.org/", config).ambiguousWith, [sameSite]);
  assert.equal(findAmbiguousRules(config).length, 1);

  const twice = withSiteRules();
  twice.rules = [
    { id: "s1", destinationId: "dest-other", host: "example.org", includeSubdomains: true, priority: 0 },
    { id: "s2", destinationId: "dest-other", host: "www.example.org", includeSubdomains: true, priority: 0 }
  ];
  assert.deepEqual(findAmbiguousRules(twice), []);
});
