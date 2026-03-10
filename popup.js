const QUICK_SETTINGS = [
  { id: "popup-openNextToParent", key: "openNextToParent", default: true, storage: "sync" },
  { id: "popup-removeDuplicatesInSelection", key: "removeDuplicatesInSelection", default: true, storage: "sync" },
  { id: "popup-useHistory", key: "useHistory", default: true, storage: "local" },
  { id: "popup-useCopyHistory", key: "useCopyHistory", default: false, storage: "local" },
  { id: "popup-checkDuplicatesOnCopy", key: "checkDuplicatesOnCopy", default: true, storage: "sync" },
];

const SYNC_KEYS = QUICK_SETTINGS.filter((c) => c.storage === "sync").map((c) => c.key);
const LOCAL_KEYS = QUICK_SETTINGS.filter((c) => c.storage === "local").map((c) => c.key);
const i18nCache = {};

const loadLanguage = async (lang) => {
  try {
    const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    const json = await res.json();
    Object.entries(json).forEach(([k, v]) => (i18nCache[k] = v.message));
  } catch { }
};

const i18n = (k, ...a) => {
  let m = i18nCache[k] || chrome.i18n.getMessage(k) || k;
  a.forEach((x, i) => (m = m.replace(`$${i + 1}`, x)));
  return m;
};

const showStatus = (statusEl, k = "popupStatusSaved") => {
  if (!statusEl) return;
  statusEl.textContent = i18n(k);
  statusEl.style.opacity = "1";
  setTimeout(() => (statusEl.style.opacity = "0"), 1200);
};

document.addEventListener("DOMContentLoaded", async () => {
  const statusEl = document.getElementById("status-message");
  const clearBtn = document.getElementById("clear-history-popup");
  const openOptionsBtn = document.getElementById("open-options");
  const openBtn = document.getElementById("action-open-links");
  const copyBtn = document.getElementById("action-copy-links");

  const { language } = await chrome.storage.sync.get({ language: "en" });
  await loadLanguage(language);

  const cmds = await chrome.commands.getAll();
  const shortcutEls = {
    "activate-selection": openBtn?.querySelector(".shortcut"),
    "activate-selection-copy": copyBtn?.querySelector(".shortcut"),
  };

  for (const c of cmds) {
    const el = shortcutEls[c.name];
    if (el && c.shortcut) el.textContent = `(${c.shortcut})`;
  }

  document.querySelectorAll("[data-i18n]").forEach((el) => (el.textContent = i18n(el.dataset.i18n)));
  document.querySelectorAll("[data-i18n-title]").forEach((el) => (el.title = i18n(el.dataset.i18nTitle)));

  const [sync, local] = await Promise.all([
    chrome.storage.sync.get(SYNC_KEYS),
    chrome.storage.local.get([...LOCAL_KEYS, "linkHistory", "copyHistory"]),
  ]);

  const all = { ...sync, ...local };
  if (clearBtn) clearBtn.disabled = !local.linkHistory?.length && !local.copyHistory?.length;

  QUICK_SETTINGS.forEach((c) => {
    const el = document.getElementById(c.id);
    if (el) {
      el.checked = all[c.key] ?? c.default;
      el.addEventListener("change", (e) => {
        chrome.storage[c.storage].set({ [c.key]: e.target.checked }).then(() => showStatus(statusEl));
      });
    }
  });

  const send = (type) => {
    chrome.runtime.sendMessage({ type: "triggerSelectionFromPopup", commandType: type });
    window.close();
  };

  if (openBtn) openBtn.addEventListener("click", () => send("initiateSelection"));
  if (copyBtn) copyBtn.addEventListener("click", () => send("initiateSelectionCopy"));
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      await chrome.storage.local.set({ linkHistory: [], copyHistory: [] });
      clearBtn.disabled = true;
      showStatus(statusEl, "optionsStatusHistoryCleared");
    });
  }
  if (openOptionsBtn) openOptionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const isActive = tab?.url?.startsWith("http");
  if (openBtn) openBtn.disabled = !isActive;
  if (copyBtn) copyBtn.disabled = !isActive;
});