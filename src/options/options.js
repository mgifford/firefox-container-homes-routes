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

  if (![1, SCHEMA_VERSION].includes(data.schemaVersion) || !Array.isArray(data.containers)) {
    status.textContent = "Could not import: unrecognized file format.";
    return;
  }

  const confirmed = confirm(
    `Replace all current settings with the ${data.containers.length} container(s) in this file? ` +
      "Containers that don't exist yet (by name) will be created."
  );
  if (!confirmed) return;

  const homes = {};
  const slots = {};
  const existing = await browser.contextualIdentities.query({});
  const claimed = new Set();
  let created = 0;

  for (const container of data.containers) {
    if (!container) continue;

    let cookieStoreId;
    if (container.cookieStoreId === DEFAULT_COOKIE_STORE_ID) {
      cookieStoreId = DEFAULT_COOKIE_STORE_ID;
    } else if (data.schemaVersion === 1) {
      // Legacy exports only carry ids.
      if (typeof container.cookieStoreId !== "string") continue;
      cookieStoreId = container.cookieStoreId;
    } else {
      if (typeof container.name !== "string") continue;
      const match = existing.find(
        (identity) => identity.name === container.name && !claimed.has(identity.cookieStoreId)
      );
      if (match) {
        cookieStoreId = match.cookieStoreId;
      } else {
        const identity = await browser.contextualIdentities.create({
          name: container.name,
          icon: container.icon || "fingerprint",
          color: container.color || "blue"
        });
        cookieStoreId = identity.cookieStoreId;
        created++;
      }
      claimed.add(cookieStoreId);
    }

    if (container.homeUrl) homes[cookieStoreId] = container.homeUrl;
    if (container.slots && Object.keys(container.slots).length > 0) {
      slots[cookieStoreId] = container.slots;
    }
  }

  await browser.storage.local.set({ homes, slots });
  // Older exports have no shortcuts; leave the current ones alone then.
  const failedShortcuts = [];
  if (data.shortcuts && typeof data.shortcuts === "object") {
    const knownCommands = new Set((await browser.commands.getAll()).map(({ name }) => name));
    for (const [name, shortcut] of Object.entries(data.shortcuts)) {
      if (!knownCommands.has(name) || typeof shortcut !== "string") continue;
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
