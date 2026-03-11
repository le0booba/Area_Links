const SETTINGS_CONFIG = {
  tabLimit: { default: 15, storage: "sync" },
  selectionBoxStyle: { default: "solid", storage: "sync" },
  selectionBoxColor: { default: "#007bff", storage: "sync" },
  selectionColorCustomPreset0: { default: "#007bff", storage: "sync" },
  selectionColorCustomPreset1: { default: "#c90062", storage: "sync" },
  selectionColorCustomPreset2: { default: "#28a745", storage: "sync" },
  selectionColorCustomPreset3: { default: "#343a40", storage: "sync" },
  selectionStyle: { default: "dashed-blue", storage: "sync" },
  highlightStyle: { default: "classic-yellow", storage: "sync" },
  openInNewWindow: { default: false, storage: "sync" },
  reverseOrder: { default: false, storage: "sync" },
  openNextToParent: { default: true, storage: "sync" },
  applyExclusionsOnCopy: { default: false, storage: "sync" },
  language: { default: "en", storage: "sync" },
  showContextMenu: { default: false, storage: "sync" },
  removeDuplicatesInSelection: { default: true, storage: "sync" },
  checkDuplicatesOnCopy: { default: true, storage: "sync" },
  excludedDomains: { default: "", storage: "local" },
  excludedWords: { default: "", storage: "local" },
  useHistory: { default: true, storage: "local" },
  useCopyHistory: { default: false, storage: "local" },
};

const i18nCache = {};
const successIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="status-success"><polyline points="20 6 9 17 4 12"></polyline></svg>';
let savedExcludedDomains = "";
let savedExcludedWords = "";
const statusTimeouts = {};

const statusConflicts = {
  "status-exclusions": "status-exclusions-icon",
  "status-exclusions-icon": "status-exclusions",
  "status-behavior": "status-history",
  "status-history": "status-behavior",
  "status-appearance": "status-reset-presets",
  "status-reset-presets": "status-appearance",
};

const $ = (id) => document.getElementById(id);

const formatDate = (d) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

const downloadJson = (filename, data) => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.download = filename;
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
};

const i18n = (key, ...args) => {
  let message = i18nCache[key] || key;
  args.forEach((arg, i) => (message = message.replace(`$${i + 1}`, arg)));
  return message;
};

const debounce = (fn, delay) => {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
};

const loadLanguage = async (lang = "en") => {
  if (Object.keys(i18nCache).length > 0) return;
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    if (!response.ok) throw new Error();
    const json = await response.json();
    Object.entries(json).forEach(([key, value]) => (i18nCache[key] = value.message));
  } catch {
    if (lang !== "en") await loadLanguage("en");
  }
};

const localizePage = () => {
  document.title = i18n("optionsTitle");
  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = i18n(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = i18n(el.dataset.i18nTitle)));
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => (el.placeholder = i18n(el.dataset.i18nPlaceholder)));
};

const setStatus = (elementId, content, isHtml = false, isError = false, duration = 2000) => {
  if (statusTimeouts[elementId]) clearTimeout(statusTimeouts[elementId]);

  const conflictId = statusConflicts[elementId];
  if (conflictId) {
    if (statusTimeouts[conflictId]) clearTimeout(statusTimeouts[conflictId]);
    const conflictEl = $(conflictId);
    if (conflictEl) {
      conflictEl.textContent = "";
      conflictEl.innerHTML = "";
    }
  }

  const el = $(elementId);
  if (!el) return;

  isHtml ? (el.innerHTML = content) : (el.textContent = content);
  el.className = `status-message ${elementId.includes("header") ? "header-status-msg" : ""} ${isError ? "status-error" : "status-success"}`;

  statusTimeouts[elementId] = setTimeout(() => {
    el.textContent = "";
    el.innerHTML = "";
    delete statusTimeouts[elementId];
  }, duration);
};

const showStatus = (elementId, messageKey, isError = false, duration = 2000) => {
  setStatus(elementId, i18n(messageKey), false, isError, duration);
};

const showToast = (messageKey, isError = false, ...args) => {
  const container = $("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${isError ? "error" : "success"}`;
  toast.textContent = i18n(messageKey, ...args);

  container.appendChild(toast);

  // Auto-remove after animation finishes (300ms in + 2700ms stay + 300ms out = 3.3s total)
  setTimeout(() => {
    toast.remove();
  }, 3300);
};

const showConflictModal = (messageKey, fieldLabelKey) => {
  return new Promise((resolve) => {
    const modal = $("conflict-modal");
    const message = $("conflict-message");
    const btnMerge = $("modal-merge");
    const btnReplace = $("modal-replace");
    const btnCancel = $("modal-cancel");

    message.textContent = i18n(messageKey, i18n(fieldLabelKey));
    modal.style.display = "flex";

    const close = (result) => {
      modal.style.display = "none";
      window.removeEventListener("keydown", onEsc);
      modal.removeEventListener("click", onBackdrop);
      btnMerge.onclick = null;
      btnReplace.onclick = null;
      btnCancel.onclick = null;
      resolve(result);
    };

    const onEsc = (e) => {
      if (e.key === "Escape") close("cancel");
    };

    const onBackdrop = (e) => {
      if (e.target === modal) close("cancel");
    };

    window.addEventListener("keydown", onEsc);
    modal.addEventListener("click", onBackdrop);

    btnMerge.onclick = () => close("merge");
    btnReplace.onclick = () => close("replace");
    btnCancel.onclick = () => close("cancel");
  });
};

const animateButtonIcon = (btnId, color = "var(--primary-color)") => {
  const btn = $(btnId);
  if (!btn) return;
  const originalHTML = btn.innerHTML;
  const originalColor = btn.style.color;
  btn.innerHTML = successIconSVG;
  btn.style.color = color;
  setTimeout(() => {
    btn.innerHTML = originalHTML;
    btn.style.color = originalColor;
  }, 1200);
};

const updateExclusionButtonsState = () => {
  const domainsValue = $("excludedDomains").value.trim();
  const wordsValue = $("excludedWords").value.trim();
  $("clearExcludedDomains").disabled = !domainsValue;
  $("clearExcludedWords").disabled = !wordsValue;
  $("exportExclusions").disabled = !domainsValue && !wordsValue;

  const hasUnsavedChanges = domainsValue !== savedExcludedDomains.trim() || wordsValue !== savedExcludedWords.trim();
  const saveButton = $("saveExclusions");
  saveButton.classList.toggle("has-unsaved-changes", hasUnsavedChanges);
  saveButton.disabled = !hasUnsavedChanges;
};

const customPresets = [
  { btnId: "selectionColorPresetCustom0", saveId: "selectionColorPresetCustomSave0", key: "selectionColorCustomPreset0" },
  { btnId: "selectionColorPresetCustom1", saveId: "selectionColorPresetCustomSave1", key: "selectionColorCustomPreset1" },
  { btnId: "selectionColorPresetCustom2", saveId: "selectionColorPresetCustomSave2", key: "selectionColorCustomPreset2" },
  { btnId: "selectionColorPresetCustom3", saveId: "selectionColorPresetCustomSave3", key: "selectionColorCustomPreset3" },
];

const checkResetButtonState = async () => {
  const resetButton = $("resetColorPresets");
  if (!resetButton) return;

  const isDefaultStyles = $("selectionBoxStyle").value === "solid" && $("highlightStyle").value === "classic-yellow";
  if (!isDefaultStyles) {
    resetButton.disabled = false;
    return;
  }

  const keys = customPresets.map((p) => p.key).concat("selectionBoxColor");
  const currentSettings = await chrome.storage.sync.get(keys);

  const isDefaultPresets = customPresets.every((p) => (currentSettings[p.key] || SETTINGS_CONFIG[p.key].default) === SETTINGS_CONFIG[p.key].default);
  const isDefaultColor = (currentSettings.selectionBoxColor || SETTINGS_CONFIG.selectionColorCustomPreset0.default) === SETTINGS_CONFIG.selectionColorCustomPreset0.default;

  resetButton.disabled = isDefaultPresets && isDefaultColor;
};

const updateShortcutsDisplay = async () => {
  const commands = await chrome.commands.getAll();
  const openCmd = commands.find((c) => c.name === "activate-selection");
  const copyCmd = commands.find((c) => c.name === "activate-selection-copy");

  const openEl = $("shortcut-open");
  const copyEl = $("shortcut-copy");

  if (openEl) openEl.textContent = openCmd?.shortcut || i18n("optionsShortcutNotSet");
  if (copyEl) copyEl.textContent = copyCmd?.shortcut || i18n("optionsShortcutNotSet");
};

const restoreOptions = async () => {
  const syncDefaults = {};
  const localDefaults = {};

  Object.entries(SETTINGS_CONFIG).forEach(([k, v]) => {
    (v.storage === "sync" ? syncDefaults : localDefaults)[k] = v.default;
  });

  const [syncSettings, localSettings] = await Promise.all([
    chrome.storage.sync.get(syncDefaults),
    chrome.storage.local.get(localDefaults),
  ]);

  const settings = { ...syncSettings, ...localSettings };
  await loadLanguage(settings.language);
  localizePage();

  $("ext-version").textContent = "v" + chrome.runtime.getManifest().version;

  Object.keys(SETTINGS_CONFIG).forEach((id) => {
    const el = $(id);
    if (!el || id === "language") return;
    el.type === "checkbox" ? (el.checked = settings[id]) : (el.value = settings[id]);
  });

  customPresets.forEach((p) => {
    const btn = $(p.btnId);
    if (btn) btn.style.setProperty("--preset-color", settings[p.key]);
  });

  const selectedColor = (settings.selectionBoxColor || "").toLowerCase();
  customPresets.forEach((p) => {
    const btn = $(p.btnId);
    if (!btn) return;
    btn.classList.remove("selected");
    if ((btn.dataset.color || settings[p.key] || "").toLowerCase() === selectedColor) btn.classList.add("selected");
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.lang === settings.language);
  });

  savedExcludedDomains = settings.excludedDomains;
  savedExcludedWords = settings.excludedWords;

  const detailsEl = $("exclusions-details");
  if (localStorage.getItem("exclusionsOpen") === "true" && (savedExcludedDomains || savedExcludedWords)) {
    detailsEl.open = true;
  }

  const { linkHistory = [], copyHistory = [] } = await chrome.storage.local.get(["linkHistory", "copyHistory"]);
  $("clearHistory").disabled = !linkHistory.length && !copyHistory.length;

  updateExclusionButtonsState();
  checkResetButtonState();
  updateShortcutsDisplay();
  document.body.classList.remove("loading-settings");
};

const saveExclusions = async () => {
  const sanitize = (str, isDomain) => str
    .replace(/[\r\n\s]+/g, ",")
    .replace(/https?:\/\//gi, "")
    .replace(isDomain ? /[^\p{L}\p{N}\.\-,]/gu : /[^\p{L}\p{N}\.\-_~!$&'()*+,;=:@%\/]/gu, "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .join(",");

  const domainsToSave = sanitize($("excludedDomains").value, true);
  const wordsToSave = sanitize($("excludedWords").value, false);

  $("excludedDomains").value = domainsToSave;
  $("excludedWords").value = wordsToSave;

  await chrome.storage.local.set({ excludedDomains: domainsToSave, excludedWords: wordsToSave });
  setStatus("status-exclusions-icon", successIconSVG, true);
  savedExcludedDomains = domainsToSave;
  savedExcludedWords = wordsToSave;
  updateExclusionButtonsState();
  localStorage.setItem("exclusionsOpen", $("exclusions-details").open);
};

const debouncedSaveSetting = debounce(async (storage, key, value, statusId, messageKey) => {
  try {
    await chrome.storage[storage].set({ [key]: value });
    showStatus(statusId, messageKey);
    if (["selectionBoxStyle", "highlightStyle", "selectionBoxColor"].includes(key)) checkResetButtonState();
  } catch {
    showStatus(statusId, "optionsStatusError", true);
  }
}, 50);

const handleSettingChange = (e) => {
  const { id, type, checked, value: rawValue, tagName } = e.target;
  const config = SETTINGS_CONFIG[id];
  if (!config || tagName === "TEXTAREA" || id === "language-select") return;

  let value = type === "checkbox" ? checked : type === "number" ? parseInt(rawValue, 10) : rawValue;

  if (type === "number" && (isNaN(value) || value < 1 || value > 50)) {
    showStatus("status-behavior", "optionsStatusTabLimitError", true, 3500);
    chrome.storage.sync.get({ tabLimit: 15 }).then((i) => ($(id).value = i.tabLimit));
    return;
  }

  const statusId = id.includes("selection") || id === "highlightStyle" || id === "showContextMenu"
    ? "status-appearance"
    : id === "applyExclusionsOnCopy"
      ? "status-exclusions"
      : "status-behavior";

  if (id === "showContextMenu") {
    chrome.storage[config.storage]
      .set({ [id]: value })
      .then(() => showStatus(statusId, "optionsStatusSettingSaved"))
      .catch(() => showStatus(statusId, "optionsStatusError", true));
  } else {
    debouncedSaveSetting(config.storage, id, value, statusId, "optionsStatusSettingSaved");
  }
};

const handleImport = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (parseError) {
        showToast("optionsStatusImportInvalidSyntax", true);
        return;
      }

      if (!data || (typeof data.excludedDomains === "undefined" && typeof data.excludedWords === "undefined")) {
        showToast("optionsStatusImportInvalidFile", true);
        return;
      }

      let importedCount = 0;
      let changedCount = 0;

      for (const field of ["excludedDomains", "excludedWords"]) {
        if (typeof data[field] === "string" && data[field].trim()) {
          importedCount++;
          const textarea = $(field);
          const oldData = textarea.value.trim();
          const newData = data[field].trim();

          if (oldData && oldData !== newData) {
            const labelKey = field === "excludedDomains" ? "optionsExcludedDomains" : "optionsExcludedWords";
            const result = await showConflictModal("optionsImportConflictMessage", labelKey);
            if (result === "cancel") return;

            if (result === "merge") {
              textarea.value = `${oldData},${newData}`;
              changedCount++;
            } else {
              textarea.value = newData;
              changedCount++;
            }
          } else if (oldData !== newData) {
            textarea.value = newData;
            changedCount++;
          }
        }
      }

      if (changedCount > 0) {
        saveExclusions();
      }
      showToast("optionsStatusImportSuccess", false, importedCount, changedCount);
    } catch (err) {
      showToast("optionsStatusBackupError", true);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

const handleFullSettingsImport = (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      let data;
      try {
        data = JSON.parse(e.target.result);
      } catch (parseError) {
        showToast("optionsStatusImportInvalidSyntax", true);
        return;
      }

      if (!data || (typeof data.sync === "undefined" && typeof data.local === "undefined" && typeof data.shortcuts === "undefined")) {
        showToast("optionsStatusImportInvalidFile", true);
        return;
      }

      let importedCount = 0;
      let changedCount = 0;

      const currentSync = await chrome.storage.sync.get(null);
      const currentLocal = await chrome.storage.local.get(null);

      // Handle exclusions merge conflict
      const importDomains = data.local?.excludedDomains?.trim() || "";
      const importWords = data.local?.excludedWords?.trim() || "";
      const currentDomains = currentLocal.excludedDomains?.trim() || "";
      const currentWords = currentLocal.excludedWords?.trim() || "";

      if ((importDomains && currentDomains && importDomains !== currentDomains) || (importWords && currentWords && importWords !== currentWords)) {
        const result = await showConflictModal("optionsImportConflictMessage", "optionsHeaderExclusions");
        if (result === "cancel") return;

        if (result === "merge") {
          if (!data.local) data.local = {};
          if (importDomains && currentDomains && importDomains !== currentDomains) {
            data.local.excludedDomains = `${currentDomains},${importDomains}`;
          }
          if (importWords && currentWords && importWords !== currentWords) {
            data.local.excludedWords = `${currentWords},${importWords}`;
          }
        }
      }

      // Count and compare sync settings
      if (data.sync) {
        for (const [key, value] of Object.entries(data.sync)) {
          importedCount++;
          if (JSON.stringify(currentSync[key]) !== JSON.stringify(value)) {
            changedCount++;
          }
        }
        await chrome.storage.sync.set(data.sync);
      }

      // Count and compare local settings
      if (data.local) {
        for (const [key, value] of Object.entries(data.local)) {
          importedCount++;
          if (JSON.stringify(currentLocal[key]) !== JSON.stringify(value)) {
            changedCount++;
          }
        }
        await chrome.storage.local.set(data.local);
      }

      // Count and compare shortcuts
      if (data.shortcuts) {
        const shortcutsKeys = Object.keys(data.shortcuts);
        const currentShortcuts = currentLocal.savedShortcuts || {};
        importedCount += shortcutsKeys.length;
        
        let shortcutsChanged = false;
        for (const key of shortcutsKeys) {
          if (currentShortcuts[key] !== data.shortcuts[key]) {
            changedCount++;
            shortcutsChanged = true;
          }
        }
        if (shortcutsChanged) {
          await chrome.storage.local.set({ savedShortcuts: data.shortcuts });
        }
      }

      showToast("optionsStatusImportSuccess", false, importedCount, changedCount);
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      showToast("optionsStatusBackupError", true);
    }
  };
  reader.readAsText(file);
  event.target.value = "";
};

const setupEventListeners = () => {
  $("saveExclusions").addEventListener("click", saveExclusions);
  $("clearHistory").addEventListener("click", async () => {
    await chrome.storage.local.set({ linkHistory: [], copyHistory: [] });
    setStatus("status-history", successIconSVG, true);
    $("clearHistory").disabled = true;
  });

  $("exportExclusions").addEventListener("click", () => {
    const data = { excludedDomains: $("excludedDomains").value, excludedWords: $("excludedWords").value };
    downloadJson(`area-links-exclusions_${formatDate(new Date())}.json`, data);
  });

  $("importExclusions").addEventListener("click", () => $("import-file-input").click());
  $("import-file-input").addEventListener("change", handleImport);

  $("exportSettings").addEventListener("click", async () => {
    const sync = await chrome.storage.sync.get(null);
    const local = await chrome.storage.local.get(["excludedDomains", "excludedWords", "useHistory", "useCopyHistory"]);
    const commands = await chrome.commands.getAll();
    const shortcuts = commands.reduce((acc, cmd) => (cmd.name && cmd.shortcut ? { ...acc, [cmd.name]: cmd.shortcut } : acc), {});
    downloadJson(`area-links-settings_${formatDate(new Date())}.json`, { sync, local, shortcuts });
  });

  $("importSettings").addEventListener("click", () => $("import-settings-file").click());
  $("import-settings-file").addEventListener("change", handleFullSettingsImport);

  ["excludedDomains", "excludedWords"].forEach((id) => {
    const textarea = $(id);
    textarea.addEventListener("input", updateExclusionButtonsState);
    $(`clear${id.charAt(0).toUpperCase() + id.slice(1)}`).addEventListener("click", () => {
      textarea.value = "";
      saveExclusions();
    });
  });

  document.querySelectorAll(".lang-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.classList.contains("active")) return;
      chrome.storage.sync.set({ language: btn.dataset.lang }).then(() => location.reload());
    });
  });

  const handleShortcuts = (e) => {
    if (e.button === 0 || e.button === 1) {
      e.preventDefault();
      chrome.tabs.create({ url: "chrome://extensions/shortcuts", active: e.button === 0 });
    }
  };

  const shortcutsLink = $("shortcutsLink");
  shortcutsLink.addEventListener("click", handleShortcuts);
  shortcutsLink.addEventListener("auxclick", handleShortcuts);
  shortcutsLink.addEventListener("contextmenu", (e) => e.preventDefault());
  $("exclusions-details").addEventListener("toggle", (e) => localStorage.setItem("exclusionsOpen", e.target.open));
  document.querySelector("main").addEventListener("change", handleSettingChange);

  const updateColorUI = (hex) => {
    $("selectionBoxColor").value = hex;
    const normalized = hex.trim().toLowerCase();
    customPresets.forEach((p) => {
      const btn = $(p.btnId);
      if (!btn) return;
      btn.classList.remove("selected");
      const c = (btn.dataset.color || btn.style.getPropertyValue("--preset-color") || "").trim().toLowerCase();
      if (c === normalized) btn.classList.add("selected");
    });
  };

  const saveSelectionBoxColor = (hex) => {
    const picker = $("selectionBoxColor");
    if (picker && picker.dataset.lastSaved === hex) return;
    debouncedSaveSetting("sync", "selectionBoxColor", hex, "status-appearance", "optionsStatusSettingSaved");
    updateColorUI(hex);
    if (picker) picker.dataset.lastSaved = hex;
  };

  $("selectionBoxColor")?.addEventListener("input", (e) => saveSelectionBoxColor(e.target.value));

  customPresets.forEach((p) => {
    $(p.btnId)?.addEventListener("click", async (e) => {
      if (e.currentTarget.classList.contains("selected")) return;
      const v = await chrome.storage.sync.get({ [p.key]: SETTINGS_CONFIG[p.key].default });
      if (v[p.key]) saveSelectionBoxColor(v[p.key]);
    });

    $(p.saveId)?.addEventListener("click", async () => {
      const hex = $("selectionBoxColor").value;
      const btn = $(p.btnId);
      if (btn && (btn.dataset.color || btn.style.getPropertyValue("--preset-color") || "").trim().toLowerCase() === hex.trim().toLowerCase()) return;
      try {
        await chrome.storage.sync.set({ [p.key]: hex });
        if (btn) btn.style.setProperty("--preset-color", hex);
        showStatus("status-appearance", "optionsStatusSettingSaved");
        saveSelectionBoxColor(hex);
        checkResetButtonState();
      } catch {
        showStatus("status-appearance", "optionsStatusError", true);
      }
    });
  });

  $("resetColorPresets")?.addEventListener("click", async () => {
    const defaults = {
      selectionBoxStyle: "solid",
      highlightStyle: "classic-yellow",
      selectionBoxColor: SETTINGS_CONFIG.selectionColorCustomPreset0.default,
      ...customPresets.reduce((acc, p) => ({ ...acc, [p.key]: SETTINGS_CONFIG[p.key].default }), {}),
    };
    try {
      await chrome.storage.sync.set(defaults);
      customPresets.forEach((p) => $(p.btnId)?.style.setProperty("--preset-color", defaults[p.key]));
      $("selectionBoxStyle").value = defaults.selectionBoxStyle;
      $("highlightStyle").value = defaults.highlightStyle;
      setStatus("status-reset-presets", successIconSVG, true);
      updateColorUI(defaults.selectionBoxColor);
      checkResetButtonState();
    } catch {
      showStatus("status-appearance", "optionsStatusError", true);
    }
  });

  window.addEventListener("focus", updateShortcutsDisplay);
};

document.addEventListener("DOMContentLoaded", async () => {
  await restoreOptions();
  setupEventListeners();
});