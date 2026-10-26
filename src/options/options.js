const SLOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SCHEMA_VERSION = 2;
const DEFAULT_COOKIE_STORE_ID = "firefox-default";

const form = document.querySelector("#config");
const status = document.querySelector("#status");
const exportButton = document.querySelector("#export");
const importInput = document.querySelector("#import");
const saveButton = document.createElement("button");

function homeInputName(cookieStoreId) {
  return `home:${cookieStoreId}`;
}

function slotInputName(cookieStoreId, slotNumber) {
  return `slot:${cookieStoreId}:${slotNumber}`;
}

function addRow(section, labelText, name, value) {
  const label = document.createElement("label");
  const labelSpan = document.createElement("span");
  const input = document.createElement("input");

  labelSpan.textContent = labelText;
  labelSpan.className = "row-label";

  input.type = "url";
  input.name = name;
  input.value = value || "";
  input.placeholder = "https://example.org/";
  input.autocomplete = "off";

  label.className = "row";
  label.append(labelSpan, input);
  section.append(label);
}

function addGeneralSection(autoGroupNewTabs) {
  const section = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const label = document.createElement("label");
  const input = document.createElement("input");
  const labelSpan = document.createElement("span");

  legend.textContent = "General";
  section.append(legend);

  input.type = "checkbox";
  input.name = "autoGroupNewTabs";
  input.checked = autoGroupNewTabs;

  labelSpan.textContent = "Automatically add new tabs to their container's tab group";

  label.className = "row row--checkbox";
  label.append(input, labelSpan);
  section.append(label);
  form.append(section);
}

function addContainerSection({ cookieStoreId, name, colorCode, iconUrl }, homes, slots) {
  const section = document.createElement("fieldset");
  const legend = document.createElement("legend");
  const icon = document.createElement("span");
  const nameText = document.createElement("span");

  icon.className = "identity-icon";
  if (iconUrl) {
    icon.style.setProperty("--identity-icon", `url("${iconUrl}")`);
    icon.style.setProperty("--identity-color", colorCode || "currentColor");
  } else {
    icon.classList.add("identity-icon--default");
  }

  nameText.textContent = name;

  legend.className = "identity-name";
  legend.append(icon, nameText);
  section.append(legend);

  addRow(section, "Home", homeInputName(cookieStoreId), homes[cookieStoreId]);

  const containerSlots = slots[cookieStoreId] || {};
  for (const slotNumber of SLOT_NUMBERS) {
    addRow(
      section,
      `Slot ${slotNumber}`,
      slotInputName(cookieStoreId, slotNumber),
      containerSlots[slotNumber]
    );
  }

  form.append(section);
}

async function load() {
  const { homes = {}, slots = {}, autoGroupNewTabs = false } = await browser.storage.local.get([
    "homes",
    "slots",
    "autoGroupNewTabs"
  ]);
  const containers = await browser.contextualIdentities.query({});

  form.replaceChildren();

  addGeneralSection(autoGroupNewTabs);

  addContainerSection(
    { cookieStoreId: "firefox-default", name: "No container / Default" },
    homes,
    slots
  );

  for (const container of containers) {
    addContainerSection(container, homes, slots);
  }

  saveButton.type = "submit";
  saveButton.textContent = "Save";
  saveButton.disabled = true;
  form.append(saveButton);
}

form.addEventListener("input", (event) => {
  if (!event.target.matches("input")) return;

  status.textContent = "";
  saveButton.disabled = false;
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const homes = {};
  const slots = {};

  for (const input of form.querySelectorAll('input[type="url"]')) {
    const url = input.value.trim();

    if (!url) continue;

    let href;
    try {
      href = new URL(url).href;
    } catch {
      status.textContent = `Not a valid URL: ${url}`;
      return;
    }

    if (input.name.startsWith("home:")) {
      const cookieStoreId = input.name.slice("home:".length);
      homes[cookieStoreId] = href;
    } else if (input.name.startsWith("slot:")) {
      const [, cookieStoreId, slotNumber] = input.name.split(":");
      slots[cookieStoreId] ??= {};
      slots[cookieStoreId][slotNumber] = href;
    }
  }

  const autoGroupNewTabs = form.querySelector('input[name="autoGroupNewTabs"]').checked;

  await browser.storage.local.set({ homes, slots, autoGroupNewTabs });
  status.textContent = "Saved.";
  saveButton.disabled = true;
});

function buildExport(containers, homes, slots, commands) {
  const defaultEntry = {
    cookieStoreId: DEFAULT_COOKIE_STORE_ID,
    homeUrl: homes[DEFAULT_COOKIE_STORE_ID],
    slots: slots[DEFAULT_COOKIE_STORE_ID] || {}
  };

  // Export every container with its identity (name, icon, color) so the import
  // can match by name or recreate it, even if cookieStoreIds differ.
  const exportedContainers = containers.map(({ cookieStoreId, name, icon, color }) => ({
    name,
    icon,
    color,
    homeUrl: homes[cookieStoreId],
    slots: slots[cookieStoreId] || {}
  }));

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    containers: [defaultEntry, ...exportedContainers],
    shortcuts: Object.fromEntries(commands.map(({ name, shortcut }) => [name, shortcut || ""]))
  };
}

exportButton.addEventListener("click", async () => {
  const { homes = {}, slots = {} } = await browser.storage.local.get([
    "homes",
    "slots"
  ]);
  const containers = await browser.contextualIdentities.query({});
  const commands = await browser.commands.getAll();
  const data = buildExport(containers, homes, slots, commands);

  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "container-homes-config.json";
  link.click();
  URL.revokeObjectURL(url);
});

// Firefox's contextualIdentities values; anything else falls back to a
// default so a file from a newer Firefox still imports.
const CONTAINER_ICONS = [
  "fingerprint", "briefcase", "dollar", "cart", "circle", "gift", "vacation",
  "food", "fruit", "pet", "tree", "chill", "fence"
];
const CONTAINER_COLORS = [
  "blue", "turquoise", "green", "yellow", "orange", "red", "pink", "purple", "toolbar"
];

// Turns a parsed export file into { schemaVersion, entries, shortcuts }, or
// throws an Error describing the first problem found. Nothing is stored or
// created unless the whole file validates, so a bad file can't leave a
// half-imported config.
function parseImport(data) {
  if (
    !data ||
    typeof data !== "object" ||
    ![1, SCHEMA_VERSION].includes(data.schemaVersion) ||
    !Array.isArray(data.containers)
  ) {
    throw new Error("unrecognized file format.");
  }

  const entries = data.containers.map((container) => {
    if (!container || typeof container !== "object") {
      throw new Error("a container entry is not an object.");
    }

    // The default container is keyed by its fixed id in every version; v1
    // files key all containers by id, v2 files by name.
    let entry;
    if (container.cookieStoreId === DEFAULT_COOKIE_STORE_ID || data.schemaVersion === 1) {
      const { cookieStoreId } = container;
      if (typeof cookieStoreId !== "string" || !cookieStoreId) {
        throw new Error("a container entry has no cookieStoreId.");
      }
      entry = { cookieStoreId, label: cookieStoreId };
    } else {
      const { name } = container;
      if (typeof name !== "string" || !name.trim()) {
        throw new Error("a container entry has no name.");
      }
      entry = {
        name,
        icon: CONTAINER_ICONS.includes(container.icon) ? container.icon : "fingerprint",
        color: CONTAINER_COLORS.includes(container.color) ? container.color : "blue",
        label: name
      };
    }

    if (container.homeUrl) {
      entry.homeUrl = parseImportedUrl(container.homeUrl, entry.label);
    }

    entry.slots = {};
    if (container.slots !== undefined) {
      if (
        typeof container.slots !== "object" ||
        container.slots === null ||
        Array.isArray(container.slots)
      ) {
        throw new Error(`slots for ${entry.label} are not an object.`);
      }

      for (const [slotNumber, url] of Object.entries(container.slots)) {
        if (!SLOT_NUMBERS.map(String).includes(slotNumber)) {
          throw new Error(`${entry.label} has an unknown slot "${slotNumber}".`);
        }
        entry.slots[slotNumber] = parseImportedUrl(url, entry.label);
      }
    }

    return entry;
  });

  // Older exports have no shortcuts; leave the current ones alone then.
  let shortcuts = null;
  if (data.shortcuts !== undefined) {
    if (
      typeof data.shortcuts !== "object" ||
      data.shortcuts === null ||
      Array.isArray(data.shortcuts) ||
      !Object.values(data.shortcuts).every((shortcut) => typeof shortcut === "string")
    ) {
      throw new Error("shortcuts are not a map of command names to keys.");
    }
    shortcuts = data.shortcuts;
  }

  return { schemaVersion: data.schemaVersion, entries, shortcuts };
}

function parseImportedUrl(url, label) {
  try {
    if (typeof url !== "string") throw new TypeError();
    return new URL(url).href;
  } catch {
    throw new Error(`${label} has an invalid URL.`);
  }
}

importInput.addEventListener("change", async () => {
  const [file] = importInput.files;
  importInput.value = "";
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    status.textContent = "Could not import: not valid JSON.";
    return;
  }

  let parsed;
  try {
    parsed = parseImport(data);
  } catch (error) {
    status.textContent = `Could not import: ${error.message}`;
    return;
  }

  const confirmed = confirm(
    `Replace all current settings with the ${parsed.entries.length} container(s) in this file? ` +
      "Containers that don't exist yet (by name) will be created."
  );
  if (!confirmed) return;

  const homes = {};
  const slots = {};
  const existing = await browser.contextualIdentities.query({});
  const claimed = new Set();
  let created = 0;

  for (const entry of parsed.entries) {
    let { cookieStoreId } = entry;
    if (!cookieStoreId) {
      const match = existing.find(
        (identity) => identity.name === entry.name && !claimed.has(identity.cookieStoreId)
      );
      if (match) {
        cookieStoreId = match.cookieStoreId;
      } else {
        const identity = await browser.contextualIdentities.create({
          name: entry.name,
          icon: entry.icon,
          color: entry.color
        });
        cookieStoreId = identity.cookieStoreId;
        created++;
      }
      claimed.add(cookieStoreId);
    }

    if (entry.homeUrl) homes[cookieStoreId] = entry.homeUrl;
    if (Object.keys(entry.slots).length > 0) slots[cookieStoreId] = entry.slots;
  }

  await browser.storage.local.set({ homes, slots });

  const failedShortcuts = [];
  if (parsed.shortcuts) {
    const knownCommands = new Set((await browser.commands.getAll()).map(({ name }) => name));
    for (const [name, shortcut] of Object.entries(parsed.shortcuts)) {
      if (!knownCommands.has(name)) continue;
      try {
        await browser.commands.update({ name, shortcut });
      } catch {
        failedShortcuts.push(name);
      }
    }
  }

  await load();
  if (failedShortcuts.length > 0) {
    status.textContent = `Imported, but could not set shortcuts for: ${failedShortcuts.join(", ")}.`;
    return;
  }
  status.textContent = created > 0 ? `Imported; created ${created} container(s).` : "Imported.";
});

load().catch((error) => {
  console.error(error);
  status.textContent = `Could not load containers: ${error.message}`;
});
