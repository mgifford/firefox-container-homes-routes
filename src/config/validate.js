// Structural and cross-reference checks for the portable `routing` config
// and the local `containerBindings`. Each function returns a list of
// problems ("where: what"); an empty list means valid. Matching semantics
// (precedence, ambiguity between rules) are checked elsewhere.

const SUPPORTED_BROWSERS = ["firefox"];

const isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

// A host must already be in the form Firefox reports for a URL's hostname:
// lowercase, punycode for international names, no port, path, wildcard or
// trailing dot. Subdomains are opted into with includeSubdomains instead.
function hostProblem(host) {
  if (!isNonEmptyString(host)) return "must be a hostname";
  if (host.includes("*")) return `"${host}" must not contain a wildcard; set includeSubdomains instead`;
  if (host.endsWith(".")) return `"${host}" must be written without the trailing dot`;
  let parsed;
  try {
    parsed = new URL(`https://${host}/`);
  } catch {
    return `"${host}" is not a valid hostname`;
  }
  if (parsed.hostname !== host || parsed.port || parsed.pathname !== "/" || parsed.username || parsed.password) {
    return parsed.hostname && !/[/:@*?#]/.test(host)
      ? `"${host}" must be written as "${parsed.hostname}"`
      : `"${host}" must be a hostname only, without a scheme, port, path or wildcard`;
  }
  return null;
}

function pathPrefixProblem(pathPrefix) {
  if (typeof pathPrefix !== "string" || !pathPrefix.startsWith("/")) {
    return "must start with /";
  }
  if (/[?#]/.test(pathPrefix)) return "must not contain ? or #";
  const normalized = new URL(pathPrefix, "https://example.invalid").pathname;
  if (normalized !== pathPrefix) return `"${pathPrefix}" must be written as "${normalized}"`;
  return null;
}

// Checks every item has a unique, non-empty string id and a label (when
// required). Returns the set of valid ids for cross-reference checks.
function checkCollection(problems, name, items, { needsLabel = true } = {}) {
  const ids = new Set();
  if (!Array.isArray(items)) {
    problems.push(`${name}: must be a list`);
    return ids;
  }
  items.forEach((item, index) => {
    const where = `${name}[${index}]`;
    if (!isObject(item)) {
      problems.push(`${where}: must be an object`);
      return;
    }
    if (!isNonEmptyString(item.id)) {
      problems.push(`${where}.id: must be a non-empty string`);
    } else if (ids.has(item.id)) {
      problems.push(`${where}.id: duplicate id "${item.id}"`);
    } else {
      ids.add(item.id);
    }
    if (needsLabel && !isNonEmptyString(item.label)) {
      problems.push(`${where}.label: must be a non-empty string`);
    }
  });
  return ids;
}

export function validateRouting(routing) {
  if (!isObject(routing)) return ["routing: must be an object"];

  const problems = [];
  const contextIds = checkCollection(problems, "accountContexts", routing.accountContexts);
  const destinationIds = checkCollection(problems, "destinations", routing.destinations);
  const categoryIds = checkCollection(problems, "categories", routing.categories);
  checkCollection(problems, "rules", routing.rules, { needsLabel: false });

  const each = (name, check) => {
    if (!Array.isArray(routing[name])) return;
    routing[name].forEach((item, index) => {
      if (isObject(item)) check(item, `${name}[${index}]`);
    });
  };

  // Sign-ins are optional: [{ id, provider, account }], where provider is
  // a name such as "Google" and account is an optional hint such as an
  // email address.
  each("accountContexts", (context, where) => {
    if (context.signIns === undefined) return;
    checkCollection(problems, `${where}.signIns`, context.signIns, { needsLabel: false });
    if (!Array.isArray(context.signIns)) return;
    context.signIns.forEach((signIn, index) => {
      if (!isObject(signIn)) return;
      if (!isNonEmptyString(signIn.provider)) {
        problems.push(`${where}.signIns[${index}].provider: must be a non-empty string`);
      }
      if (signIn.account !== undefined && typeof signIn.account !== "string") {
        problems.push(`${where}.signIns[${index}].account: must be text`);
      }
    });
  });

  each("destinations", (destination, where) => {
    if (!contextIds.has(destination.accountContextId)) {
      problems.push(`${where}.accountContextId: no account context "${destination.accountContextId}"`);
    }
    if (!SUPPORTED_BROWSERS.includes(destination.browser)) {
      problems.push(`${where}.browser: "${destination.browser}" is not supported`);
    }
  });

  each("categories", (category, where) => {
    const list = category.destinationIds;
    if (!Array.isArray(list) || list.length === 0) {
      problems.push(`${where}.destinationIds: must list at least one destination`);
      return;
    }
    const seen = new Set();
    for (const id of list) {
      if (!destinationIds.has(id)) problems.push(`${where}.destinationIds: no destination "${id}"`);
      if (seen.has(id)) problems.push(`${where}.destinationIds: "${id}" is listed twice`);
      seen.add(id);
    }
    if (!list.includes(category.defaultDestinationId)) {
      problems.push(`${where}.defaultDestinationId: must be one of the category's destinations`);
    }
  });

  each("rules", (rule, where) => {
    // A rule leads either to a category (which picks a destination) or
    // straight to one destination.
    const hasCategory = rule.categoryId !== undefined;
    const hasDestination = rule.destinationId !== undefined;
    if (hasCategory === hasDestination) {
      problems.push(`${where}: must have either categoryId or destinationId, not ${hasCategory ? "both" : "neither"}`);
    } else if (hasCategory && !categoryIds.has(rule.categoryId)) {
      problems.push(`${where}.categoryId: no category "${rule.categoryId}"`);
    } else if (hasDestination && !destinationIds.has(rule.destinationId)) {
      problems.push(`${where}.destinationId: no destination "${rule.destinationId}"`);
    }
    const host = hostProblem(rule.host);
    if (host) problems.push(`${where}.host: ${host}`);
    if (typeof rule.includeSubdomains !== "boolean") {
      problems.push(`${where}.includeSubdomains: must be true or false`);
    }
    if (rule.pathPrefix !== undefined) {
      const path = pathPrefixProblem(rule.pathPrefix);
      if (path) problems.push(`${where}.pathPrefix: ${path}`);
    }
    if (!Number.isInteger(rule.priority)) {
      problems.push(`${where}.priority: must be a whole number`);
    }
  });

  const fallback = routing.fallbackDestinationId;
  if (fallback !== null && !destinationIds.has(fallback)) {
    problems.push(`fallbackDestinationId: no destination "${fallback}"`);
  }

  return problems;
}

// Local bindings may only name destinations that exist, and each must map
// to a cookieStoreId string. Whether that container still exists in
// Firefox is checked at routing time, not here.
export function validateContainerBindings(bindings, routing) {
  if (!isObject(bindings)) return ["containerBindings: must be an object"];

  const destinationIds = new Set(
    Array.isArray(routing?.destinations) ? routing.destinations.map((d) => d?.id) : []
  );
  const problems = [];
  for (const [destinationId, cookieStoreId] of Object.entries(bindings)) {
    if (!destinationIds.has(destinationId)) {
      problems.push(`containerBindings.${destinationId}: no destination with this id`);
    }
    if (!isNonEmptyString(cookieStoreId)) {
      problems.push(`containerBindings.${destinationId}: must be a container id`);
    }
  }
  return problems;
}
