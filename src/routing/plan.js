// Routing coordination for an explicit "Open routed link" request: combines
// rule matching (match.js) with container resolution (resolve.js) into
// what to open and how to describe it. Pure; the menu code does the I/O.
//
// `context` is { routing, containerBindings, containers, sourceCookieStoreId }
// where `containers` comes from contextualIdentities.query() and
// `sourceCookieStoreId` is the container of the tab the link is in.

import { matchUrl } from "./match.js";
import { resolveDestination } from "./resolve.js";

// Returns { action: "open", cookieStoreId, title } or { action: "error", title }.
// `title` is plain text for the menu item that triggers it.
export function planRoutedOpen(url, context, { overrideDestinationId } = {}) {
  const { routing, containerBindings, containers, sourceCookieStoreId } = context;
  const decision = matchUrl(url, routing, { overrideDestinationId });

  if (decision.kind === "unsupported") {
    return { action: "error", title: "Can't route this link: only web links can be routed" };
  }
  if (decision.kind === "auth") {
    return {
      action: "open",
      cookieStoreId: sourceCookieStoreId,
      title: `Open ${decision.provider} sign-in in this container (sign-in pages are never moved)`
    };
  }
  if (decision.kind === "none") {
    return { action: "open", cookieStoreId: sourceCookieStoreId, title: "Open routed link in this container (no rule matches)" };
  }

  const resolved = resolveDestination(decision.destinationId, routing, containerBindings, containers);
  if (!resolved.ok) return { action: "error", title: `Can't route this link: ${resolved.message}` };

  return { action: "open", cookieStoreId: resolved.cookieStoreId, title: titleFor(decision, resolved) };
}

function titleFor(decision, resolved) {
  const where = `Open routed link in ${resolved.containerName}`;
  if (decision.kind === "override") return where;
  if (decision.kind === "fallback") return `${where} (no rule matches)`;
  const conflict = decision.ambiguousWith.length > 0 ? ", rules conflict" : "";
  const reason = decision.category ? decision.category.label : decision.rule.host;
  return `${where} (${reason}${conflict})`;
}

// The destinations offered in the "Open routed link in" submenu, as
// [{ destinationId, title, enabled }]. The matched category's destinations
// (if the rule names a category) come first, then the rest, leaving out the one the main item already
// uses. Sign-in pages and non-web links offer no choices. A destination
// that can't be opened right now is listed, disabled, with the reason.
export function routingChoices(url, context) {
  const { routing, containerBindings, containers } = context;
  const decision = matchUrl(url, routing);
  if (decision.kind === "unsupported" || decision.kind === "auth") return [];

  const preferred = decision.category?.destinationIds ?? [];
  const ordered = [
    ...preferred,
    ...routing.destinations.map((d) => d.id).filter((id) => !preferred.includes(id))
  ].filter((id) => id !== decision.destinationId);

  return ordered.map((destinationId) => {
    const resolved = resolveDestination(destinationId, routing, containerBindings, containers);
    const destination = routing.destinations.find((d) => d.id === destinationId);
    if (!resolved.ok) {
      return { destinationId, title: `${destination.label}: ${resolved.message}`, enabled: false };
    }
    const account = resolved.accountContext ? ` (${resolved.accountContext.label})` : "";
    return { destinationId, title: `${destination.label}${account}`, enabled: true };
  });
}

// Firefox menus treat "&" as an access-key marker; "&&" shows a literal "&".
export function menuText(text) {
  return text.replaceAll("&", "&&");
}
