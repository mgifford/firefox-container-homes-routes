const SLOT_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SCHEMA_VERSION = 1;

const form = document.querySelector("#config");
const status = document.querySelector("#status");
const exportButton = document.querySelector("#export");
const importInput = document.querySelector("#import");
const importButton = document.querySelector("#import-button");
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

function buildExport(containers, homes, slots) {
  const allContainers = [
    { cookieStoreId: "firefox-default", name: "No container / Default" },
    ...containers
  ];

  const exportedContainers = allContainers
    .map(({ cookieStoreId, name }) => ({
      cookieStoreId,
      label: name,
      homeUrl: homes[cookieStoreId],
      slots: slots[cookieStoreId] || {}
    }))
    .filter(({ homeUrl, slots: s }) => homeUrl || Object.keys(s).length > 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    containers: exportedContainers
  };
}

exportButton.addEventListener("click", async () => {
  const { homes = {}, slots = {} } = await browser.storage.local.get([
    "homes",
    "slots"
  ]);
  const containers = await browser.contextualIdentities.query({});
  const data = buildExport(containers, homes, slots);

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

// Turns a parsed export file into { homes, slots }, or throws an Error
// describing the first problem found. Nothing is stored unless the whole
// file validates, so a bad file can't leave a half-imported config.
function parseImport(data) {
  if (
    !data ||
    data.schemaVersion !== SCHEMA_VERSION ||
    !Array.isArray(data.containers)
  ) {
    throw new Error("unrecognized file format.");
  }

  const homes = {};
  const slots = {};

  for (const container of data.containers) {
    const cookieStoreId = container?.cookieStoreId;
    if (typeof cookieStoreId !== "string" || !cookieStoreId) {
      throw new Error("a container entry has no cookieStoreId.");
    }

    if (container.homeUrl) {
      homes[cookieStoreId] = parseImportedUrl(container.homeUrl, cookieStoreId);
    }

    if (container.slots !== undefined) {
      if (typeof container.slots !== "object" || container.slots === null) {
        throw new Error(`slots for ${cookieStoreId} are not an object.`);
      }

      for (const [slotNumber, url] of Object.entries(container.slots)) {
        if (!SLOT_NUMBERS.includes(Number(slotNumber))) {
          throw new Error(`${cookieStoreId} has an unknown slot "${slotNumber}".`);
        }
        slots[cookieStoreId] ??= {};
        slots[cookieStoreId][slotNumber] = parseImportedUrl(url, cookieStoreId);
      }
    }
  }

  return { homes, slots };
}

function parseImportedUrl(url, cookieStoreId) {
  try {
    if (typeof url !== "string") throw new TypeError();
    return new URL(url).href;
  } catch {
    throw new Error(`${cookieStoreId} has an invalid URL.`);
  }
}
importButton.addEventListener("click", () => importInput.click());

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

  let homes;
  let slots;
  try {
    ({ homes, slots } = parseImport(data));
  } catch (error) {
    status.textContent = `Could not import: ${error.message}`;
    return;
  }

  const confirmed = confirm(
    `Replace all current settings with the ${data.containers.length} container(s) in this file?`
  );
  if (!confirmed) return;

  await browser.storage.local.set({ homes, slots });
  status.textContent = "Imported.";
  await load();
});

load().catch((error) => {
  console.error(error);
  status.textContent = `Could not load containers: ${error.message}`;
});
