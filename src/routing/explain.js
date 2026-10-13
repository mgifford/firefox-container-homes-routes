// Plain-language explanations of rules and routing decisions, for the
// routing settings page. Pure.

import { matchUrl } from "./match.js";
import { resolveDestination } from "./resolve.js";

// "drupal.org and its subdomains, paths starting /project/claro/issues"
export function describeRule(rule) {
  const host = rule.includeSubdomains ? `${rule.host} and its subdomains` : rule.host;
  const path = rule.pathPrefix && rule.pathPrefix !== "/" ? `, paths starting ${rule.pathPrefix}` : "";
  const priority = rule.priority !== 0 ? `, priority ${rule.priority}` : "";
  return `${host}${path}${priority}`;
}

// Explains where `url` would open. Returns
//   { summary, details: [[term, description], ...], problem }
// `summary` is one sentence; `details` are label/value pairs; `problem` is
// a sentence describing something to fix, or null.
export function explainUrl(url, context) {
  const { routing, containerBindings, containers } = context;
  const decision = matchUrl(url, routing);

  if (decision.kind === "unsupported") {
    return { summary: "Only web links (http and https) can be routed.", details: [], problem: null };
  }
  if (decision.kind === "auth") {
    return {
      summary: `This is a ${decision.provider} sign-in page. It always stays in the container it was opened from.`,
      details: [],
      problem: null
    };
  }
  if (decision.kind === "none") {
    return {
      summary: "No rule matches and no fallback is set, so the link stays in its current container.",
      details: [],
      problem: null
    };
  }

  const details = [];
  let problem = null;

  if (decision.kind === "rule") {
    details.push(["Rule", describeRule(decision.rule)]);
    if (decision.category) details.push(["Category", decision.category.label]);
    if (decision.ambiguousWith.length > 0) {
      const others = decision.ambiguousWith.map((rule) => `${describeRule(rule)} for ${ruleTargetLabel(routing, rule)}`).join("; ");
      problem = `Other rules match equally: ${others}. The rule listed first is used; give one a higher priority to decide.`;
    }
  } else {
    details.push(["Rule", "None matches; using the fallback destination"]);
  }

  const resolved = resolveDestination(decision.destinationId, routing, containerBindings, containers);
  const destination = routing.destinations.find((d) => d.id === decision.destinationId);
  details.push(["Destination", destination?.label ?? decision.destinationId]);

  if (!resolved.ok) {
    return { summary: "This link can't be routed right now.", details, problem: resolved.message };
  }

  details.push(["Account", resolved.accountContext?.label ?? "Unknown"], ["Container", resolved.containerName]);
  return { summary: `Opens in the ${resolved.containerName} container.`, details, problem };
}

// Where a rule leads, for people: "Claro (category)" or "Work (destination)".
export function ruleTargetLabel(routing, rule) {
  if (rule.destinationId !== undefined) {
    const label = routing.destinations.find((d) => d.id === rule.destinationId)?.label ?? `(missing: ${rule.destinationId})`;
    return `${label} (destination)`;
  }
  const label = routing.categories.find((c) => c.id === rule.categoryId)?.label ?? `(missing: ${rule.categoryId})`;
  return `${label} (category)`;
}
