// Edits to account contexts and destinations, for the routing settings
// page. Pure: each function takes the current config and returns either
// the changed copies or { error } with a sentence telling the user what to
// do (and, for a save, the `field` to fix). Inputs are never modified.

const randomId = () => crypto.randomUUID();

function labelProblem(list, id, label, noun) {
  if (label === "") return { error: "Enter a name.", field: "label" };
  const taken = list.find((item) => item.id !== id && item.label.toLowerCase() === label.toLowerCase());
  return taken ? { error: `Another ${noun} is already called "${taken.label}".`, field: "label" } : null;
}

// Adds an account context, or renames it when `id` is given.
// Returns { routing, id } or { error, field }.
export function saveAccountContext(routing, { id, label }, makeId = randomId) {
  label = label.trim();
  const problem = labelProblem(routing.accountContexts, id, label, "account");
  if (problem) return problem;

  const next = structuredClone(routing);
  if (id) {
    next.accountContexts.find((context) => context.id === id).label = label;
  } else {
    id = `ctx-${makeId()}`;
    next.accountContexts.push({ id, label });
  }
  return { routing: next, id };
}

// Refuses while destinations still belong to the account.
export function removeAccountContext(routing, id) {
  const context = routing.accountContexts.find((c) => c.id === id);
  const users = routing.destinations.filter((d) => d.accountContextId === id).map((d) => d.label);
  if (users.length > 0) {
    return { error: `"${context.label}" still has destinations: ${users.join(", ")}. Move them to another account or remove them first.` };
  }
  const next = structuredClone(routing);
  next.accountContexts = next.accountContexts.filter((c) => c.id !== id);
  return { routing: next };
}

// Adds a destination, or changes it when `id` is given. `cookieStoreId` is
// the container to open it in, or null for none chosen yet.
// Returns { routing, containerBindings, id } or { error, field }.
export function saveDestination(routing, containerBindings, { id, label, accountContextId, cookieStoreId }, makeId = randomId) {
  label = label.trim();
  const problem = labelProblem(routing.destinations, id, label, "destination");
  if (problem) return problem;
  if (!routing.accountContexts.some((c) => c.id === accountContextId)) {
    return { error: "Choose an account.", field: "accountContextId" };
  }

  const next = structuredClone(routing);
  if (id) {
    Object.assign(next.destinations.find((d) => d.id === id), { label, accountContextId });
  } else {
    id = `dest-${makeId()}`;
    next.destinations.push({ id, label, accountContextId, browser: "firefox" });
  }

  const bindings = { ...containerBindings };
  if (cookieStoreId) bindings[id] = cookieStoreId;
  else delete bindings[id];

  return { routing: next, containerBindings: bindings, id };
}

// Refuses while a category or the fallback uses the destination. Its
// container choice is dropped; the container itself is left alone.
export function removeDestination(routing, containerBindings, id) {
  const destination = routing.destinations.find((d) => d.id === id);
  const categories = routing.categories.filter((c) => c.destinationIds.includes(id)).map((c) => c.label);
  const uses = [];
  if (categories.length > 0) uses.push(`the categories ${categories.join(", ")}`);
  if (routing.fallbackDestinationId === id) uses.push("the fallback");
  if (uses.length > 0) {
    return { error: `"${destination.label}" is used by ${uses.join(" and ")}. Choose another destination there first.` };
  }

  const next = structuredClone(routing);
  next.destinations = next.destinations.filter((d) => d.id !== id);
  const bindings = { ...containerBindings };
  delete bindings[id];
  return { routing: next, containerBindings: bindings };
}
