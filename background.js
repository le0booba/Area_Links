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

let activeSelectionTabId = null;
let settingsCache = null;
let initPromise = null;
let lastContextMenuSig = '';
let lastContextMenuUpdate = 0;
const MENU_THROTTLE_MS = 1500;

const mergeUnique = (primary, secondary, limit) => {
  const seen = new Set(primary);
  const result = [...primary];
  for (const item of secondary) {
    if (!seen.has(item)) { seen.add(item); result.push(item); }
    if (result.length >= limit) break;
  }
  return result;
};

const safeSendMessage = (tabId, msg) => chrome.tabs.sendMessage(tabId, msg).catch(() => { });

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

async function setupContextMenu(forceUpdate = false) {
  const now = Date.now();
  if (!forceUpdate && now - lastContextMenuUpdate < MENU_THROTTLE_MS) return;
  lastContextMenuUpdate = now;

  const settings = await settingsManager.get();
  if (!settings.showContextMenu) {
    if (lastContextMenuSig) {
      lastContextMenuSig = '';
      chrome.contextMenus.removeAll().catch(() => { });
    }
    return;
  }

  const commands = await chrome.commands.getAll();
  const shortcuts = new Map(commands.map(c => [c.name, c.shortcut || '']));
  const getShortcut = name => shortcuts.get(name) || '';

  const menus = [
    { id: 'activate-selection-menu', title: `${chrome.i18n.getMessage('cmdActivate')} ${getShortcut('activate-selection') ? `(${getShortcut('activate-selection')})` : ''}` },
    { id: 'activate-selection-copy-menu', title: `${chrome.i18n.getMessage('cmdActivateCopy')} ${getShortcut('activate-selection-copy') ? `(${getShortcut('activate-selection-copy')})` : ''}` },
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
  if (settingsCache) {
    for (const [k, { newValue }] of Object.entries(changes)) {
      settingsCache[k] = newValue;
    }
    if (changes.excludedDomains || changes.excludedWords) {
      processExclusions();
    }
    if (changes.showContextMenu || changes.language) {
      setupContextMenu(true);
    }
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

chrome.windows.onFocusChanged.addListener(windowId => {
  if (windowId !== chrome.windows.WINDOW_ID_NONE) setupContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (tab?.id) {
    triggerSelection(tab, info.menuItemId === 'activate-selection-menu' ? 'initiateSelection' : 'initiateSelectionCopy');
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  if (activeSelectionTabId && activeSelectionTabId !== tabId) {
    safeSendMessage(activeSelectionTabId, { type: 'resetSelection' });
    activeSelectionTabId = null;
  }
  if (settingsCache?.showContextMenu) setupContextMenu();
});

chrome.tabs.onRemoved.addListener(id => {
  if (id === activeSelectionTabId) activeSelectionTabId = null;
});

async function triggerSelection(tab, type) {
  if (!tab?.id || !tab.url?.startsWith('http')) return;

  if (activeSelectionTabId && activeSelectionTabId !== tab.id) {
    safeSendMessage(activeSelectionTabId, { type: 'resetSelection' });
  }

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
    const res = await chrome.tabs.sendMessage(tab.id, msg);
    if (res?.success) activeSelectionTabId = tab.id;
  } catch {
    await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] }).catch(() => { });
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] }).catch(() => { });
    chrome.tabs.sendMessage(tab.id, msg)
      .then(r => { if (r?.success) activeSelectionTabId = tab.id; })
      .catch(() => { });
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
    case 'selectionDeactivated':
      if (sender.tab?.id === activeSelectionTabId) activeSelectionTabId = null;
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