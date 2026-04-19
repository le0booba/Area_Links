const HISTORY_LIMIT = 50;
const DEFAULTS = {
  sync: {
    tabLimit: 15, selectionBoxStyle: 'solid', selectionBoxColor: '#007bff',
    selectionColorCustomPreset0: '#007bff', selectionColorCustomPreset1: '#c90062',
    selectionColorCustomPreset2: '#28a745', selectionColorCustomPreset3: '#343a40',
    selectionStyle: 'dashed', highlightStyle: 'classic-yellow', openInNewWindow: false,
    reverseOrder: false, openNextToParent: true, applyExclusionsOnCopy: false, language: 'en',
    showContextMenu: false, removeDuplicatesInSelection: true, checkDuplicatesOnCopy: true,
  },
  local: {
    excludedDomains: '', excludedWords: '', linkHistory: [], copyHistory: [],
    useHistory: true, useCopyHistory: false,
  }
};

let settingsCache = null;
let initPromise = null;
let lastContextMenuSig = '';

const mergeUnique = (primary, secondary, limit) => {
  const seen = new Set(primary);
  const result = [...primary];
  for (const item of secondary) {
    if (!seen.has(item)) { seen.add(item); result.push(item); }
    if (result.length >= limit) break;
  }
  return result;
};

const processExclusions = () => {
  if (!settingsCache) return;
  const domainSet = new Set();
  for (const raw of (settingsCache.excludedDomains || '').split(',')) {
    const val = raw.trim();
    if (!val) continue;
    try {
      domainSet.add(new URL(val.includes('://') ? val : 'http://' + val).hostname.toLowerCase());
    } catch {
      domainSet.add(val.toLowerCase());
    }
  }
  settingsCache.processedExcludedDomains = [...domainSet];
  settingsCache.processedExcludedWords = (settingsCache.excludedWords || '')
    .split(',')
    .map(w => w.trim().toLowerCase())
    .filter(Boolean);
};

const settingsManager = {
  async initialize() {
    if (initPromise) return initPromise;
    initPromise = Promise.all([
      chrome.storage.sync.get(DEFAULTS.sync),
      chrome.storage.local.get(DEFAULTS.local),
    ]).then(([sync, local]) => {
      settingsCache = { ...sync, ...local };
      processExclusions();
      return settingsCache;
    }).catch(() => {
      settingsCache = { ...DEFAULTS.sync, ...DEFAULTS.local };
      initPromise = null;
      return settingsCache;
    });
    return initPromise;
  },
  get() { return settingsCache ? Promise.resolve(settingsCache) : this.initialize(); },
};

async function setupContextMenu() {
  const settings = await settingsManager.get();

  if (!settings.showContextMenu) {
    if (lastContextMenuSig !== 'hidden') {
      lastContextMenuSig = 'hidden';
      await chrome.contextMenus.removeAll().catch(() => { });
    }
    return;
  }

  const menus = [
    { id: 'activate-selection-menu', title: chrome.i18n.getMessage('cmdActivate') },
    { id: 'activate-selection-copy-menu', title: chrome.i18n.getMessage('cmdActivateCopy') }
  ];

  const sig = JSON.stringify(menus.map(m => [m.id, m.title]));
  if (sig === lastContextMenuSig) return;
  lastContextMenuSig = sig;

  await chrome.contextMenus.removeAll().catch(() => { });
  for (const m of menus) {
    chrome.contextMenus.create({ ...m, contexts: ['page'] }, () => chrome.runtime.lastError);
  }
}

chrome.storage.onChanged.addListener(async (changes) => {
  const settings = await settingsManager.get();
  for (const [k, { newValue }] of Object.entries(changes)) {
    settings[k] = newValue;
  }
  if (changes.excludedDomains || changes.excludedWords) {
    processExclusions();
  }
  if (changes.showContextMenu || changes.language) {
    setupContextMenu();
  }
});

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const browserLang = chrome.i18n.getUILanguage().split('-')[0];
    const language = browserLang === 'ru' ? 'ru' : 'en';
    await Promise.all([
      chrome.storage.sync.set({ ...DEFAULTS.sync, language }),
      chrome.storage.local.set(DEFAULTS.local),
    ]);
  }
  await settingsManager.initialize();
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
  await settingsManager.initialize();
  setupContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id) {
    triggerSelection(tab, info.menuItemId === 'activate-selection-menu' ? 'initiateSelection' : 'initiateSelectionCopy');
  }
});

async function triggerSelection(tab, type) {
  if (!tab?.id || !tab.url?.startsWith('http')) return;

  const s = await settingsManager.get();
  const msg = {
    type, style: s.selectionStyle, selectionBoxStyle: s.selectionBoxStyle,
    selectionBoxColor: s.selectionBoxColor, highlightStyle: s.highlightStyle,
    tabLimit: s.tabLimit, checkDuplicatesOnCopy: s.checkDuplicatesOnCopy,
    applyExclusionsOnCopy: s.applyExclusionsOnCopy, useHistory: s.useHistory,
    useCopyHistory: s.useCopyHistory, removeDuplicatesInSelection: s.removeDuplicatesInSelection,
    linkHistory: s.useHistory ? s.linkHistory : [],
    copyHistory: s.useCopyHistory ? s.copyHistory : [],
    excludedDomains: s.processedExcludedDomains,
    excludedWords: s.processedExcludedWords,
  };

  try {
    await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] }).catch(() => { });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => { });
    chrome.tabs.sendMessage(tab.id, msg).catch(() => { });
  }
}

chrome.commands.onCommand.addListener((cmd, tab) => {
  triggerSelection(tab, cmd === 'activate-selection' ? 'initiateSelection' : 'initiateSelectionCopy');
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  switch (req.type) {
    case 'ping':
      sendResponse({ type: 'pong' });
      break;
    case 'openLinks':
      processLinks(req.urls, sender.tab);
      break;
    case 'saveCopyHistory':
      settingsManager.get().then(s => {
        if (s.useCopyHistory) {
          chrome.storage.local.set({ copyHistory: mergeUnique(req.urls, s.copyHistory, HISTORY_LIMIT) });
        }
      });
      break;
    case 'triggerSelectionFromPopup':
      chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t && triggerSelection(t, req.commandType));
      break;
  }
});

async function processLinks(urls, tab) {
  const s = await settingsManager.get();
  const list = s.reverseOrder ? [...urls].reverse() : urls;
  if (!list.length) return;

  if (s.openInNewWindow) {
    chrome.windows.create({ url: list, focused: true });
  } else {
    const start = s.openNextToParent && tab ? tab.index + 1 : undefined;
    for (let i = 0; i < list.length; i++) {
      chrome.tabs.create({ url: list[i], active: false, index: start !== undefined ? start + i : undefined });
    }
  }

  if (s.useHistory) {
    chrome.storage.local.set({ linkHistory: mergeUnique(list, s.linkHistory, HISTORY_LIMIT) });
  }
}