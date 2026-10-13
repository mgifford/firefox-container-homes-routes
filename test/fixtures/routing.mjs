// A small routing setup shared by the plan and menu tests: Drupal issues,
// Claude (personal by default, work available) and a Misc fallback.

export const containers = [
  { cookieStoreId: "firefox-container-1", name: "Drupal" },
  { cookieStoreId: "firefox-container-2", name: "Personal AI" },
  { cookieStoreId: "firefox-container-3", name: "Work development" },
  { cookieStoreId: "firefox-container-4", name: "Misc" }
];

export const containerBindings = {
  "dest-drupal": "firefox-container-1",
  "dest-personal-ai": "firefox-container-2",
  "dest-work-dev": "firefox-container-3",
  "dest-misc": "firefox-container-4"
};

export function sampleRouting() {
  return {
    accountContexts: [
      { id: "ctx-personal", label: "Personal" },
      { id: "ctx-work", label: "Work" }
    ],
    destinations: [
      { id: "dest-drupal", label: "Drupal", accountContextId: "ctx-personal", browser: "firefox" },
      { id: "dest-personal-ai", label: "Personal AI", accountContextId: "ctx-personal", browser: "firefox" },
      { id: "dest-work-dev", label: "Work development", accountContextId: "ctx-work", browser: "firefox" },
      { id: "dest-misc", label: "Misc", accountContextId: "ctx-personal", browser: "firefox" }
    ],
    categories: [
      { id: "cat-claro", label: "Claro", destinationIds: ["dest-drupal"], defaultDestinationId: "dest-drupal" },
      { id: "cat-drupal", label: "Drupal general", destinationIds: ["dest-drupal"], defaultDestinationId: "dest-drupal" },
      {
        id: "cat-claude",
        label: "Claude",
        destinationIds: ["dest-personal-ai", "dest-work-dev"],
        defaultDestinationId: "dest-personal-ai"
      }
    ],
    rules: [
      {
        id: "rule-claro",
        categoryId: "cat-claro",
        host: "drupal.org",
        includeSubdomains: true,
        pathPrefix: "/project/claro/issues",
        priority: 0
      },
      { id: "rule-drupal", categoryId: "cat-drupal", host: "drupal.org", includeSubdomains: true, priority: 0 },
      { id: "rule-claude", categoryId: "cat-claude", host: "claude.ai", includeSubdomains: true, priority: 0 }
    ],
    fallbackDestinationId: "dest-misc"
  };
}

export const CLARO_ISSUE = "https://www.drupal.org/project/claro/issues/3565271";
