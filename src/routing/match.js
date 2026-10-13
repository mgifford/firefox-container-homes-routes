// Pure rule matching: given a URL and the routing config, decide which
// destination a link should open in, and explain why.
//
// A rule leads to a category (whose default destination is used, with its
// other destinations offered as choices) or straight to one destination.
//
// Precedence, highest first:
//   0. Known sign-in pages (auth-endpoints.js) are never routed.
//   1. One-time override chosen by the user for this link.
//   2. Matching rules, by priority (higher number wins).
//   3. Among equal priority, the most specific rule:
//        a. more host labels    (team.slack.com beats slack.com)
//        b. exact host          (beats a rule that includes subdomains)
//        c. more path segments  (/project/claro beats /project)
//      Rules still tied after this that lead to different places (another
//      category or destination) are reported as ambiguous; the one listed
//      first in the config is used.
//   4. The fallback destination (Misc), if one is configured.
//   5. Otherwise nothing: the link stays where it is.
//
// Host matching works on the parsed hostname only, never on the URL text,
// and only on whole labels: a rule for drupal.org can match
// api.drupal.org but never evil-drupal.org or drupal.org.evil.example.
// A leading "www." is ignored on both sides. Ports are ignored. Path
// prefixes match whole segments: /project/claro matches
// /project/claro/issues/1 but not /project/claroline.

import { AUTH_ENDPOINTS } from "./auth-endpoints.js";

const ROUTABLE_PROTOCOLS = ["http:", "https:"];

// "www.drupal.org" and "drupal.org" are treated as the same site. A bare
// "www.com"-style name is left alone so a rule can't collapse to a TLD.
export function siteHost(hostname) {
  const host = hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
  if (host.startsWith("www.") && host.indexOf(".", 4) !== -1) return host.slice(4);
  return host;
}

// "/a/" and "/a" are the same prefix; "/" is the same as no prefix.
function normalizedPrefix(pathPrefix) {
  if (pathPrefix === undefined) return "";
  return pathPrefix.replace(/\/+$/, "");
}

function hostMatches(rule, urlHost) {
  const ruleHost = siteHost(rule.host);
  if (urlHost === ruleHost) return true;
  return rule.includeSubdomains === true && urlHost.endsWith(`.${ruleHost}`);
}

function pathMatches(rule, pathname) {
  const prefix = normalizedPrefix(rule.pathPrefix);
  if (prefix === "") return true;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function specificity(rule) {
  const prefix = normalizedPrefix(rule.pathPrefix);
  return [
    siteHost(rule.host).split(".").length,
    rule.includeSubdomains ? 0 : 1,
    prefix === "" ? 0 : prefix.split("/").length - 1
  ];
}

// Negative when a should win over b, positive when b should, 0 when tied.
function compareRules(a, b) {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const sa = specificity(a);
  const sb = specificity(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) return sb[i] - sa[i];
  }
  return 0;
}

// Where a rule leads, as a key: rules with the same key never conflict.
function ruleTarget(rule) {
  return rule.destinationId !== undefined ? `destination:${rule.destinationId}` : `category:${rule.categoryId}`;
}

function parseRoutable(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  return ROUTABLE_PROTOCOLS.includes(parsed.protocol) ? parsed : null;
}

function authEndpointFor(urlHost, pathname) {
  return AUTH_ENDPOINTS.find(
    (endpoint) => hostMatches(endpoint, urlHost) && pathMatches(endpoint, pathname)
  );
}

// Returns a decision:
//   { kind: "unsupported" }                     not an http(s) URL
//   { kind: "auth", provider }                  a sign-in page: stays put
//   { kind: "override", destinationId }
//   { kind: "rule", destinationId, rule, category, ambiguousWith }
//                                               category is null for a rule
//                                               naming a destination
//   { kind: "fallback", destinationId }
//   { kind: "none" }                            no rule and no fallback
// `ambiguousWith` lists other rules tied with the chosen one that lead
// somewhere else (empty when the choice is clear).
export function matchUrl(url, routing, { overrideDestinationId } = {}) {
  const parsed = parseRoutable(url);
  if (!parsed) return { kind: "unsupported" };

  const urlHost = siteHost(parsed.hostname);
  const authEndpoint = authEndpointFor(urlHost, parsed.pathname);
  if (authEndpoint) return { kind: "auth", provider: authEndpoint.provider };

  const destinationIds = new Set(routing.destinations.map((d) => d.id));

  if (overrideDestinationId !== undefined && destinationIds.has(overrideDestinationId)) {
    return { kind: "override", destinationId: overrideDestinationId };
  }

  const categories = new Map(routing.categories.map((c) => [c.id, c]));

  // Array.prototype.sort is stable, so ties keep their config order.
  const candidates = routing.rules
    .filter((rule) => categories.has(rule.categoryId) || destinationIds.has(rule.destinationId))
    .filter((rule) => hostMatches(rule, urlHost) && pathMatches(rule, parsed.pathname))
    .sort(compareRules);

  if (candidates.length > 0) {
    const [rule] = candidates;
    const category = categories.get(rule.categoryId) ?? null;
    const ambiguousWith = candidates.filter(
      (other) => other !== rule && compareRules(rule, other) === 0 && ruleTarget(other) !== ruleTarget(rule)
    );
    const destinationId = category ? category.defaultDestinationId : rule.destinationId;
    return { kind: "rule", destinationId, rule, category, ambiguousWith };
  }

  if (routing.fallbackDestinationId !== null && destinationIds.has(routing.fallbackDestinationId)) {
    return { kind: "fallback", destinationId: routing.fallbackDestinationId };
  }

  return { kind: "none" };
}

// Groups of rules that would tie for some URL and send it to different
// places (categories or destinations). Two rules can only tie when they have the same priority, the
// same site host, the same subdomain setting and the same path prefix, so
// grouping on that key finds every ambiguity without enumerating URLs.
export function findAmbiguousRules(routing) {
  const groups = new Map();
  for (const rule of routing.rules) {
    const key = JSON.stringify([
      rule.priority,
      siteHost(rule.host),
      rule.includeSubdomains === true,
      normalizedPrefix(rule.pathPrefix)
    ]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(rule);
  }
  return [...groups.values()].filter(
    (rules) => new Set(rules.map(ruleTarget)).size > 1
  );
}
