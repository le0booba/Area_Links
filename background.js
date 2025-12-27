const HISTORY_LIMIT = 50;
const SYNC_DEFAULTS = {
  tabLimit: 15,
  selectionStyle: 'dashed-blue',
  highlightStyle: 'classic-yellow',
  openInNewWindow: false,
  reverseOrder: false,
  openNextToParent: false,
  applyExclusionsOnCopy: false,
  language: 'en',
  showContextMenu: true,
  removeDuplicatesInSelection: true,
};
const LOCAL_DEFAULTS = {
  excludedDomains: '',
  excludedWords: '',
  linkHistory: [],
  copyHistory: [],
  useHistory: true,
  useCopyHistory: false,
  checkDuplicatesOnCopy: true,
};

let activeSelectionTabId = null;
let settingsCache = null;

const settingsManager = {
    async initialize() {
        try {
            const [syncSettings, localSettings] = await Promise.all([
                chrome.storage.sync.get(SYNC_DEFAULTS),
                chrome.storage.local.get(LOCAL_DEFAULTS)
            ]);
            settingsCache = { ...syncSettings, ...localSettings };
            this.processExclusions();
            return settingsCache;
        } catch (e) {
            console.error("Area Links: Error loading settings.", e);
            settingsCache = { ...SYNC_DEFAULTS, ...LOCAL_DEFAULTS };
            return settingsCache;
        }
    },
    get() {
        return settingsCache || this.initialize();
    },
    processExclusions() {
        if (!settingsCache) return;
        
        const domains = (settingsCache.excludedDomains || '').split(',').filter(Boolean);
        settingsCache.processedExcludedDomains = domains.map(d => {
            const trimmed = d.trim().toLowerCase();
            try {
                return new URL('http://' + trimmed).hostname;
            } catch {
                return trimmed;
            }
        }).filter(Boolean);

        const rawWords = (settingsCache.excludedWords || '').split(',').filter(Boolean);
        const expandedWords = new Set();
        
        for (const word of rawWords) {
            const w = word.trim().toLowerCase();
            if (!w) continue;
            
            expandedWords.add(w);
            
            try {
                expandedWords.add(encodeURI(w).toLowerCase());
            } catch {}

            try {
                const candidate = w.includes('.') ? w : `${w}.test`;
                const hostname = new URL('http://' + candidate).hostname.toLowerCase();
                if (!w.includes('.') && hostname.endsWith('.test')) {
                    const label = hostname.slice(0, -5);
                    if (label) expandedWords.add(label);
                } else {
                    expandedWords.add(hostname);
                }
            } catch {}
        }

        settingsCache.processedExcludedWords = Array.from(expandedWords);
    },
    async refresh() {
        await this.initialize();
        if (settingsCache.showContextMenu) setupContextMenu();
    }
};

const intelligentSettingsUpdate = (changes, area) => {
    if (!settingsCache) return;

    let needsContextMenuUpdate = false;
    let needsExclusionProcessing = false;

    for (const [key, { newValue }] of Object.entries(changes)) {
        settingsCache[key] = newValue;
        if (key === 'showContextMenu' || key === 'language') needsContextMenuUpdate = true;
        if (key === 'excludedDomains' || key === 'excludedWords') needsExclusionProcessing = true;
    }

    if (needsExclusionProcessing) settingsManager.processExclusions();
    if (needsContextMenuUpdate) setupContextMenu();
};

const i18n = (key) => chrome.i18n.getMessage(key);

async function setupContextMenu() {
    try {
        await chrome.contextMenus.removeAll();
        const settings = await settingsManager.get();
        if (!settings.showContextMenu) return;

        const commands = await chrome.commands.getAll();
        const shortcuts = {
            activate: commands.find(c => c.name === 'activate-selection')?.shortcut || '',
            copy: commands.find(c => c.name === 'activate-selection-copy')?.shortcut || ''
        };

        const menus = [
            {
                id: "activate-selection-menu",
                title: `${i18n("cmdActivate")}${shortcuts.activate ? ` (${shortcuts.activate})` : ''}`
            },
            {
                id: "activate-selection-copy-menu",
                title: `${i18n("cmdActivateCopy")}${shortcuts.copy ? ` (${shortcuts.copy})` : ''}`
            }
        ];

        for (const menu of menus) {
            chrome.contextMenus.create({ ...menu, contexts: ["page"] });
        }
    } catch (e) {
        console.warn(`Area Links: Context menu error - ${e.message}`);
    }
}

async function checkAndApplyBrowserLanguage() {
    const settings = await settingsManager.get();
    const UILang = chrome.i18n.getUILanguage().split('-')[0];
    const supportedLangs = ['en', 'ru'];

    if (supportedLangs.includes(UILang) && UILang !== settings.language) {
        chrome.storage.sync.set({ language: UILang }).catch(e => 
            console.error("Area Links: Error setting language.", e)
        );
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await Promise.all([
            chrome.storage.sync.set(SYNC_DEFAULTS),
            chrome.storage.local.set(LOCAL_DEFAULTS)
        ]).catch(e => console.error("Area Links: Error setting defaults.", e));
        await settingsManager.initialize();
        await checkAndApplyBrowserLanguage();
    } else {
        await settingsManager.initialize();
    }
    await setupContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
    await settingsManager.initialize();
    await setupContextMenu();
});

chrome.storage.onChanged.addListener(intelligentSettingsUpdate);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const commandType = info.menuItemId === "activate-selection-menu" 
        ? "initiateSelection" 
        : "initiateSelectionCopy";
    if (tab) triggerSelection(tab, commandType);
});

async function resetSelectionInTab(tabId) {
    if (!tabId) return;
    try {
        await chrome.tabs.sendMessage(tabId, { type: "resetSelection" });
    } catch {
    } finally {
        if (activeSelectionTabId === tabId) activeSelectionTabId = null;
    }
}

chrome.tabs.onActivated.addListener(activeInfo => {
    if (activeSelectionTabId && activeSelectionTabId !== activeInfo.tabId) {
        resetSelectionInTab(activeSelectionTabId);
    }
});

chrome.tabs.onRemoved.addListener(tabId => {
    if (tabId === activeSelectionTabId) activeSelectionTabId = null;
});

async function triggerSelection(tab, commandType) {
    if (!tab.url?.startsWith('http') || !tab.id) return;
    
    const tabId = tab.id;
    if (activeSelectionTabId && activeSelectionTabId !== tabId) {
        await resetSelectionInTab(activeSelectionTabId);
    }

    const settings = await settingsManager.get();
    const message = {
        type: commandType,
        style: settings.selectionStyle,
        highlightStyle: settings.highlightStyle,
        tabLimit: settings.tabLimit,
        checkDuplicatesOnCopy: settings.checkDuplicatesOnCopy,
        applyExclusionsOnCopy: settings.applyExclusionsOnCopy,
        useHistory: settings.useHistory,
        useCopyHistory: settings.useCopyHistory,
        removeDuplicatesInSelection: settings.removeDuplicatesInSelection,
        linkHistory: settings.useHistory ? settings.linkHistory : [],
        copyHistory: settings.useCopyHistory ? settings.copyHistory : [],
        excludedDomains: settings.processedExcludedDomains,
        excludedWords: settings.processedExcludedWords,
    };
    
    const injectAndSend = async () => {
        try {
            await Promise.all([
                chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] }),
                chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] })
            ]);
            const response = await chrome.tabs.sendMessage(tabId, message);
            if (response?.success) activeSelectionTabId = tabId;
        } catch (e) {
            console.warn(`Area Links: Could not inject scripts into tab ${tabId}.`, e);
        }
    };

    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        if (response?.success) activeSelectionTabId = tabId;
    } catch (e) {
        if (e.message.includes('Receiving end does not exist')) {
            await injectAndSend();
        } else {
            console.warn(`Area Links: Error sending message: ${e.message}`);
        }
    }
}

chrome.commands.onCommand.addListener((command, tab) => {
    const commandType = command === "activate-selection" 
        ? "initiateSelection" 
        : "initiateSelectionCopy";
    triggerSelection(tab, commandType);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handlers = {
        ping: () => sendResponse({ type: 'pong' }),
        selectionDeactivated: () => {
            if (sender.tab?.id === activeSelectionTabId) activeSelectionTabId = null;
        },
        openLinks: (req) => processLinks(req.urls, sender.tab),
        saveCopyHistory: async (req) => {
            const settings = await settingsManager.get();
            if (settings.useCopyHistory) {
                const newHistory = [...new Set([...req.urls, ...settings.copyHistory])]
                    .slice(0, HISTORY_LIMIT);
                chrome.storage.local.set({ copyHistory: newHistory })
                    .catch(e => console.error("Area Links: Error saving copy history.", e));
            }
        },
        triggerSelectionFromPopup: async (req) => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab) triggerSelection(tab, req.commandType);
        },
        refreshContextMenu: () => setupContextMenu()
    };

    const handler = handlers[request.type];
    if (handler) {
        const result = handler(request);
        if (result instanceof Promise) {
            result.then(sendResponse);
            return true;
        }
    }
    return false;
});

async function processLinks(urls, tab) {
    const settings = await settingsManager.get();
    
    let urlsToOpen = settings.reverseOrder ? [...urls].reverse() : urls;
    if (urlsToOpen.length === 0) return;

    if (settings.openInNewWindow) {
        chrome.windows.create({ url: urlsToOpen, focused: true })
            .catch(e => console.error("Area Links: Error creating window.", e));
    } else {
        const startIndex = settings.openNextToParent && tab ? tab.index + 1 : undefined;
        urlsToOpen.forEach((url, i) => {
            const index = startIndex !== undefined ? startIndex + i : undefined;
            chrome.tabs.create({ url, active: false, index })
                .catch(e => console.error(`Area Links: Error creating tab.`, e));
        });
    }
    
    if (settings.useHistory) {
        const newHistory = [...new Set([...urlsToOpen, ...settings.linkHistory])]
            .slice(0, HISTORY_LIMIT);
        chrome.storage.local.set({ linkHistory: newHistory })
            .catch(e => console.error("Area Links: Error saving link history.", e));
    }
}

chrome.alarms.create('stale-selection-check', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'stale-selection-check' && activeSelectionTabId) {
        try {
            await chrome.tabs.get(activeSelectionTabId);
        } catch {
            activeSelectionTabId = null;
        }
    }
});