// Turns a routing destination into the Firefox container to open it in.
//
// The portable config names destinations by logical id. Which local
// container each one uses lives in `containerBindings`
// (destination id -> cookieStoreId), because container ids differ between
// Firefox installations. These functions are pure: callers pass in the
// current list of containers from contextualIdentities.query().

export const DEFAULT_COOKIE_STORE_ID = "firefox-default";
const PRIVATE_COOKIE_STORE_ID = "firefox-private";

// Returns either
//   { ok: true, destination, accountContext, cookieStoreId, containerName }
// or
//   { ok: false, code, destinationId, message }
// where `message` tells the user how to fix it. Codes:
//   unknown-destination   the id is not in the config
//   unsupported-browser   only Firefox destinations can be opened
//   no-container          no container has been chosen for it
//   private-container     bound to private browsing, which is never used
//   container-missing     the chosen container no longer exists
export function resolveDestination(destinationId, routing, containerBindings, containers) {
  const destination = routing.destinations.find((d) => d.id === destinationId);
  if (!destination) {
    return failure("unknown-destination", destinationId, "This link's destination no longer exists. Check the routing settings.");
  }

  const label = destination.label;
  if (destination.browser !== "firefox") {
    return failure(
      "unsupported-browser",
      destinationId,
      `"${label}" opens in ${destination.browser}, which isn't supported yet. Choose a Firefox destination instead.`
    );
  }

  const cookieStoreId = containerBindings[destinationId];
  if (cookieStoreId === undefined) {
    return failure("no-container", destinationId, `Choose a container for "${label}" in the routing settings.`);
  }

  if (cookieStoreId === PRIVATE_COOKIE_STORE_ID) {
    return failure(
      "private-container",
      destinationId,
      `"${label}" is set to private browsing, which routing never uses. Choose a container for it in the routing settings.`
    );
  }

  let containerName;
  if (cookieStoreId === DEFAULT_COOKIE_STORE_ID) {
    containerName = "No container";
  } else {
    const container = containers.find((c) => c.cookieStoreId === cookieStoreId);
    if (!container) {
      return failure(
        "container-missing",
        destinationId,
        `The container for "${label}" was removed. Choose or create a container for it in the routing settings.`
      );
    }
    containerName = container.name;
  }

  const accountContext = routing.accountContexts.find((c) => c.id === destination.accountContextId);
  return { ok: true, destination, accountContext, cookieStoreId, containerName };
}

function failure(code, destinationId, message) {
  return { ok: false, code, destinationId, message };
}

// Containers used by destinations from more than one account context.
// Sharing a container mixes those contexts' sign-ins (one cookie jar), so
// the settings page should warn. Destinations in the same account context
// sharing a container is normal (Claro and Drupal Core both in Drupal).
// Returns [{ cookieStoreId, destinationIds, accountContextIds }].
export function findSharedContainers(routing, containerBindings) {
  const byContainer = new Map();
  for (const destination of routing.destinations) {
    const cookieStoreId = containerBindings[destination.id];
    if (cookieStoreId === undefined) continue;
    if (!byContainer.has(cookieStoreId)) byContainer.set(cookieStoreId, []);
    byContainer.get(cookieStoreId).push(destination);
  }

  const shared = [];
  for (const [cookieStoreId, destinations] of byContainer) {
    const accountContextIds = [...new Set(destinations.map((d) => d.accountContextId))];
    if (accountContextIds.length > 1) {
      shared.push({ cookieStoreId, destinationIds: destinations.map((d) => d.id), accountContextIds });
    }
  }
  return shared;
}
