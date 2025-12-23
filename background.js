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

// Debounce function
function debounce(fn, delay) {
    let timeoutId = null;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

const settingsManager = {
    async initialize() {
        const [syncSettings, localSettings] = await Promise.all([
            chrome.storage.sync.get(SYNC_DEFAULTS),
            chrome.storage.local.get(LOCAL_DEFAULTS)
        ]).catch(e => {
            console.error("Area Links: Error loading settings.", e);
            return [{}, {}];
        });
        settingsCache = { ...syncSettings, ...localSettings };
        this.processExclusions();
        return settingsCache;
    },
    async get() {
        if (settingsCache) {
            return settingsCache;
        }
        return await this.initialize();
    },
    processExclusions() {
        if (!settingsCache) return;
        settingsCache.processedExcludedDomains = (settingsCache.excludedDomains || '')
            .split(',')
            .map(d => d.trim().toLowerCase())
            .filter(Boolean)
            .map(d => {
                try {
                    // Punycode conversion for internationalized domain names
                    return new URL('http://' + d).hostname;
                } catch (e) {
                    return d;
                }
            });

        // Build processedExcludedWords with helpful variants so words entered in Unicode
        // will match domains that are stored/seen as punycode hostnames.
        const rawWords = (settingsCache.excludedWords || '')
            .split(',')
            .map(w => w.trim().toLowerCase())
            .filter(Boolean);

        const expandedWords = new Set();
        for (const w of rawWords) {
            expandedWords.add(w);

            // Add percent-encoded variant to match encoded URLs
            try {
                expandedWords.add(encodeURI(w).toLowerCase());
            } catch (e) {}

            // If word looks like a domain (contains a dot) try to get its punycode hostname
            // If it's just a label (no dot), append a dummy TLD to coerce URL->punycode conversion
            try {
                const candidate = w.includes('.') ? w : `${w}.test`;
                const hostname = new URL('http://' + candidate).hostname.toLowerCase();
                // For labels appended with .test, strip the dummy TLD back to the label
                if (!w.includes('.') && hostname.endsWith('.test')) {
                    const label = hostname.slice(0, -5); // remove '.test'
                    if (label) expandedWords.add(label);
                } else {
                    expandedWords.add(hostname);
                }
            } catch (e) {
                // ignore
            }
        }

        settingsCache.processedExcludedWords = Array.from(expandedWords);
    },
    async refresh() {
        await this.initialize();
        if (settingsCache.showContextMenu || settingsCache.language) {
            setupContextMenu();
        }
    }
};

const intelligentSettingsUpdate = (changes, area) => {
    if (!settingsCache) return;

    let needsContextMenuUpdate = false;
    let needsExclusionProcessing = false;

    for (let [key, { newValue }] of Object.entries(changes)) {
        settingsCache[key] = newValue;
        if (key === 'showContextMenu' || key === 'language') {
            needsContextMenuUpdate = true;
        }
        if (key === 'excludedDomains' || key === 'excludedWords') {
            needsExclusionProcessing = true;
        }
    }

    if (needsExclusionProcessing) {
        settingsManager.processExclusions();
    }
    if (needsContextMenuUpdate) {
        setupContextMenu();
    }
};

function i18n(key) {
    return chrome.i18n.getMessage(key);
}

function handleRuntimeError(context = '') {
    if (chrome.runtime.lastError) {
        console.warn(`Area Links: ${context} - ${chrome.runtime.lastError.message}`);
        return true;
    }
    return false;
}

async function setupContextMenu() {
    await chrome.contextMenus.removeAll().catch(() => {});
    const settings = await settingsManager.get();
    if (!settings.showContextMenu) {
        return;
    }

    const commands = await chrome.commands.getAll().catch(() => []);
    const activateShortcut = commands.find(c => c.name === 'activate-selection')?.shortcut || '';
    const copyShortcut = commands.find(c => c.name === 'activate-selection-copy')?.shortcut || '';

    chrome.contextMenus.create({
        id: "activate-selection-menu",
        title: `${i18n("cmdActivate")}${activateShortcut ? ` (${activateShortcut})` : ''}`,
        contexts: ["page"]
    }, () => handleRuntimeError('contextMenu create'));

    chrome.contextMenus.create({
        id: "activate-selection-copy-menu",
        title: `${i18n("cmdActivateCopy")}${copyShortcut ? ` (${copyShortcut})` : ''}`,
        contexts: ["page"]
    }, () => handleRuntimeError('contextMenu create'));
}

async function checkAndApplyBrowserLanguage() {
    const settings = await settingsManager.get();
    const currentLang = settings.language;
    const UILang = chrome.i18n.getUILanguage().split('-')[0];
    const supportedLangs = ['en', 'ru'];

    if (supportedLangs.includes(UILang) && UILang !== currentLang) {
        chrome.storage.sync.set({ language: UILang }).catch(e => console.error("Area Links: Error setting language.", e));
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await Promise.all([
            chrome.storage.sync.set(SYNC_DEFAULTS),
            chrome.storage.local.set(LOCAL_DEFAULTS)
        ]).catch(e => console.error("Area Links: Error setting default settings on install.", e));
    }
    await settingsManager.initialize();
    if (details.reason === 'install') {
        await checkAndApplyBrowserLanguage();
    }
    await setupContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
    await settingsManager.initialize();
    await setupContextMenu();
});

chrome.storage.onChanged.addListener(intelligentSettingsUpdate);

chrome.contextMenus.onClicked.addListener((info, tab) => {
    const commandType = info.menuItemId === "activate-selection-menu" ? "initiateSelection" : "initiateSelectionCopy";
    if (tab) triggerSelection(tab, commandType);
});

async function resetSelectionInTab(tabId) {
    if (!tabId) return;
    try {
        await chrome.tabs.sendMessage(tabId, { type: "resetSelection" });
    } catch (e) {
        // Ignore errors, tab might be closed
    } finally {
        if (activeSelectionTabId === tabId) {
            activeSelectionTabId = null;
        }
    }
}

chrome.tabs.onActivated.addListener(activeInfo => {
    if (activeSelectionTabId && activeSelectionTabId !== activeInfo.tabId) {
        resetSelectionInTab(activeSelectionTabId);
    }
});

chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeSelectionTabId) {
        activeSelectionTabId = null;
    }
});

async function triggerSelection(tab, commandType) {
    if (!tab.url?.startsWith('http') || !tab.id) {
        return;
    }
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
            await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            const response = await chrome.tabs.sendMessage(tabId, message);
            if (response?.success) {
                activeSelectionTabId = tabId;
            }
        } catch (injectError) {
            console.warn(`Area Links: Could not inject scripts into tab ${tabId}.`, injectError);
        }
    };

    try {
        const response = await chrome.tabs.sendMessage(tabId, message);
        if (response?.success) {
            activeSelectionTabId = tabId;
        }
    } catch (e) {
        if (e.message.includes('Receiving end does not exist')) {
            await injectAndSend();
        } else {
            console.warn(`Area Links: Error sending message to content script: ${e.message}`);
        }
    }
}


chrome.commands.onCommand.addListener((command, tab) => {
    const commandType = command === "activate-selection" ? "initiateSelection" : "initiateSelectionCopy";
    triggerSelection(tab, commandType);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const messageHandlers = {
        ping: () => sendResponse({ type: 'pong' }),
        selectionDeactivated: () => {
            if (sender.tab && sender.tab.id === activeSelectionTabId) {
                activeSelectionTabId = null;
            }
        },
        openLinks: (req) => processLinks(req.urls, sender.tab),
        saveCopyHistory: async (req) => {
            const settings = await settingsManager.get();
            if (settings.useCopyHistory) {
                const newHistory = [...new Set([...req.urls, ...settings.copyHistory])].slice(0, HISTORY_LIMIT);
                chrome.storage.local.set({ copyHistory: newHistory })
                    .catch(e => console.error("Area Links: Error saving copy history.", e));
            }
        },
        triggerSelectionFromPopup: async (req) => {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
            if (tab) {
                triggerSelection(tab, req.commandType);
            }
        },
        refreshContextMenu: () => setupContextMenu()
    };

    const handler = messageHandlers[request.type];
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
    
    let urlsToOpen = [...urls]; 
    
    if (settings.reverseOrder) {
        urlsToOpen.reverse();
    }
    
    if (urlsToOpen.length === 0) return;

    if (settings.openInNewWindow) {
        chrome.windows.create({
            url: urlsToOpen,
            focused: true
        }).catch(e => console.error("Area Links: Error creating new window.", e));
    } else {
        const startIndex = (settings.openNextToParent && tab) ? tab.index + 1 : undefined;
        urlsToOpen.forEach((url, i) => {
            const newTabIndex = (startIndex !== undefined) ? startIndex + i : undefined;
            chrome.tabs.create({ url, active: false, index: newTabIndex })
                .catch(e => console.error(`Area Links: Error creating tab for ${url}.`, e));
        });
    }
    
    if (settings.useHistory) {
        const newHistory = [...new Set([...urlsToOpen, ...settings.linkHistory])].slice(0, HISTORY_LIMIT);
        chrome.storage.local.set({ linkHistory: newHistory })
            .catch(e => console.error("Area Links: Error saving link history.", e));
    }
}

// Heartbeat check for stale selections
chrome.alarms.create('stale-selection-check', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'stale-selection-check' && activeSelectionTabId) {
        try {
            await chrome.tabs.get(activeSelectionTabId);
        } catch (e) {
            // Tab doesn't exist, so reset the state
            activeSelectionTabId = null;
        }
    }
});