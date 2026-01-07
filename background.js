const HISTORY_LIMIT = 50;
const DEFAULTS = {
    sync: {
        tabLimit: 15, selectionBoxStyle: 'solid', selectionBoxColor: '#007bff',
        selectionColorCustomPreset1: '#c90062', selectionColorCustomPreset2: '#28a745',
        selectionColorCustomPreset3: '#343a40', selectionStyle: 'dashed-blue',
        highlightStyle: 'classic-yellow', openInNewWindow: false, reverseOrder: false,
        openNextToParent: true, applyExclusionsOnCopy: false, language: 'en',
        showContextMenu: true, removeDuplicatesInSelection: true, checkDuplicatesOnCopy: true,
    },
    local: {
        excludedDomains: '', excludedWords: '', linkHistory: [], copyHistory: [],
        useHistory: true, useCopyHistory: false,
    }
};
let activeSelectionTabId = null;
let settingsCache = null;
const settingsManager = {
    async initialize() {
        try {
            const [sync, local] = await Promise.all([
                chrome.storage.sync.get(DEFAULTS.sync), chrome.storage.local.get(DEFAULTS.local)
            ]);
            settingsCache = { ...sync, ...local };
            if (settingsCache.selectionStyle && (!sync.selectionBoxStyle || typeof sync.selectionBoxStyle !== 'string')) {
                const map = {
                    'dashed-blue': { selectionBoxStyle: 'dashed', selectionBoxColor: '#007bff' },
                    'dashed-red': { selectionBoxStyle: 'dotted', selectionBoxColor: '#c90062' },
                    'solid-green': { selectionBoxStyle: 'solid', selectionBoxColor: '#28a745' },
                    'subtle-gray': { selectionBoxStyle: 'subtle', selectionBoxColor: '#343a40' },
                }[settingsCache.selectionStyle];
                if (map) {
                    Object.assign(settingsCache, map);
                    chrome.storage.sync.set(map).catch(() => {});
                }
            }
            this.processExclusions();
        } catch {
            settingsCache = { ...DEFAULTS.sync, ...DEFAULTS.local };
        }
        return settingsCache;
    },
    async get() { return settingsCache || await this.initialize(); },
    processExclusions() {
        if (!settingsCache) return;
        const dRaw = (settingsCache.excludedDomains || '').split(',');
        const dSet = new Set();
        for (let i = 0; i < dRaw.length; i++) {
            const val = dRaw[i].trim();
            if (!val) continue;
            try { 
                dSet.add(new URL(val.includes('://') ? val : 'http://' + val).hostname.toLowerCase()); 
            } catch { 
                dSet.add(val.toLowerCase()); 
            }
        }
        settingsCache.processedExcludedDomains = Array.from(dSet);
        const wRaw = (settingsCache.excludedWords || '').split(',');
        const wSet = new Set();
        for (let i = 0; i < wRaw.length; i++) {
            const val = wRaw[i].trim().toLowerCase();
            if (val) wSet.add(val);
        }
        settingsCache.processedExcludedWords = Array.from(wSet);
    },
    async refresh() {
        await this.initialize();
        if (settingsCache.showContextMenu) setupContextMenu();
    }
};
async function setupContextMenu() {
    try {
        await chrome.contextMenus.removeAll();
    } catch (e) {
        // Ignore removal errors
    }
    
    const settings = await settingsManager.get();
    if (!settings.showContextMenu) return;
    
    const commands = await chrome.commands.getAll();
    const getShortcut = (name) => commands.find(c => c.name === name)?.shortcut || '';
    
    const menus = [
        { id: "activate-selection-menu", title: `${chrome.i18n.getMessage("cmdActivate")} ${getShortcut('activate-selection') && `(${getShortcut('activate-selection')})`}` },
        { id: "activate-selection-copy-menu", title: `${chrome.i18n.getMessage("cmdActivateCopy")} ${getShortcut('activate-selection-copy') && `(${getShortcut('activate-selection-copy')})`}` }
    ];
    
    menus.forEach(m => {
        chrome.contextMenus.create({ ...m, contexts: ["page"] }, () => {
            if (chrome.runtime.lastError) {
                // Suppress "duplicate id" errors
            }
        });
    });
}
chrome.runtime.onInstalled.addListener(async (d) => {
    if (d.reason === 'install') {
        await Promise.all([chrome.storage.sync.set(DEFAULTS.sync), chrome.storage.local.set(DEFAULTS.local)]);
        await settingsManager.initialize();
        const lang = chrome.i18n.getUILanguage().split('-')[0];
        if (['en', 'ru'].includes(lang) && lang !== settingsCache.language) {
            chrome.storage.sync.set({ language: lang });
        }
    } else {
        await settingsManager.initialize();
    }
    setupContextMenu();
});
chrome.runtime.onStartup.addListener(async () => { await settingsManager.initialize(); await setupContextMenu(); });

chrome.storage.onChanged.addListener(async (changes) => {
    if (settingsCache) {
        for (const [k, { newValue }] of Object.entries(changes)) {
            settingsCache[k] = newValue;
        }
    }
    
    const keys = Object.keys(changes);
    const refreshMenu = keys.some(k => ['showContextMenu', 'language'].includes(k));
    const processExc = keys.some(k => ['excludedDomains', 'excludedWords'].includes(k));

    if (processExc) {
        if (!settingsCache) await settingsManager.initialize();
        settingsManager.processExclusions();
    }
    
    if (refreshMenu) setupContextMenu();
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (tab?.id) triggerSelection(tab, info.menuItemId === "activate-selection-menu" ? "initiateSelection" : "initiateSelectionCopy");
});

chrome.tabs.onActivated.addListener(i => {
    if (activeSelectionTabId && activeSelectionTabId !== i.tabId) {
        chrome.tabs.sendMessage(activeSelectionTabId, { type: "resetSelection" }).catch(() => {});
        activeSelectionTabId = null;
    }
    setupContextMenu();
});

chrome.windows.onFocusChanged.addListener(windowId => {
    if (windowId !== chrome.windows.WINDOW_ID_NONE) {
        setupContextMenu();
    }
});

chrome.tabs.onRemoved.addListener(id => { if (id === activeSelectionTabId) activeSelectionTabId = null; });
async function triggerSelection(tab, type) {
    if (!tab.url?.startsWith('http') || !tab.id) return;
    if (activeSelectionTabId && activeSelectionTabId !== tab.id) {
        chrome.tabs.sendMessage(activeSelectionTabId, { type: "resetSelection" }).catch(() => {});
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
        excludedDomains: s.processedExcludedDomains, excludedWords: s.processedExcludedWords,
    };
    try {
        const res = await chrome.tabs.sendMessage(tab.id, msg);
        if (res?.success) activeSelectionTabId = tab.id;
    } catch {
        await chrome.scripting.insertCSS({ target: { tabId: tab.id }, files: ['styles.css'] });
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
        chrome.tabs.sendMessage(tab.id, msg).then(r => { if (r?.success) activeSelectionTabId = tab.id; }).catch(() => {});
    }
}
chrome.commands.onCommand.addListener((cmd, tab) => {
    triggerSelection(tab, cmd === "activate-selection" ? "initiateSelection" : "initiateSelectionCopy");
});
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.type === 'ping') return sendResponse({ type: 'pong' });
    if (req.type === 'selectionDeactivated') {
        if (sender.tab?.id === activeSelectionTabId) activeSelectionTabId = null;
    } else if (req.type === 'openLinks') {
        processLinks(req.urls, sender.tab);
    } else if (req.type === 'saveCopyHistory') {
        settingsManager.get().then(s => {
            if (s.useCopyHistory) {
                chrome.storage.local.set({ copyHistory: [...new Set([...req.urls, ...s.copyHistory])].slice(0, HISTORY_LIMIT) });
            }
        });
    } else if (req.type === 'triggerSelectionFromPopup') {
        chrome.tabs.query({ active: true, currentWindow: true }).then(([t]) => t && triggerSelection(t, req.commandType));
    } else if (req.type === 'refreshContextMenu') {
        setupContextMenu();
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
        list.forEach((url, i) => chrome.tabs.create({ url, active: false, index: start !== undefined ? start + i : undefined }));
    }
    if (s.useHistory) {
        chrome.storage.local.set({ linkHistory: [...new Set([...list, ...s.linkHistory])].slice(0, HISTORY_LIMIT) });
    }
}