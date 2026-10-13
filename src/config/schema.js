// Stored configuration layout and migrations.
//
// Version history:
//   (none) Before 0.3.0: `homes` only.
//   1      0.3.0: adds `slots`; later `autoGroupNewTabs`.
//   2      Routing fork: adds `routing` (portable: account contexts,
//          destinations, categories, rules) and `containerBindings`
//          (local only: destination id -> cookieStoreId).
//
// `homes`, `slots` and `autoGroupNewTabs` keep their v1 shape in every
// version. Migrations only add keys, so existing settings are never
// rewritten.

export const CONFIG_VERSION = 2;

// Storage keys a migration needs to read.
export const MIGRATION_KEYS = ["configVersion", "routing", "containerBindings"];

export function emptyRouting() {
  return {
    accountContexts: [],
    destinations: [],
    categories: [],
    rules: [],
    fallbackDestinationId: null
  };
}

// Takes the stored values for MIGRATION_KEYS. Returns { updates } with the
// keys to write (empty when already current), or { error } when the stored
// config comes from a newer version, which must be left untouched.
export function migrateConfig(stored) {
  const version = stored.configVersion ?? 1;

  if (version > CONFIG_VERSION) {
    return { error: `stored config version ${version} is newer than supported version ${CONFIG_VERSION}` };
  }

  const updates = {};

  if (version < 2) {
    if (stored.routing === undefined) updates.routing = emptyRouting();
    if (stored.containerBindings === undefined) updates.containerBindings = {};
  }

  if (stored.configVersion !== CONFIG_VERSION) updates.configVersion = CONFIG_VERSION;

  return { updates };
}
