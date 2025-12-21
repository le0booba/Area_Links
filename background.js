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

async function initializeSettings() {
    const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(SYNC_DEFAULTS),
        chrome.storage.local.get(LOCAL_DEFAULTS)
    ]);
    const settings = { ...syncSettings, ...localSettings };
    await chrome.storage.session.set({ settingsCache: settings });
    return settings;
}

async function getSettings() {
    const result = await chrome.storage.session.get('settingsCache');
    if (result.settingsCache && Object.keys(result.settingsCache).length > 0) {
        return result.settingsCache;
    }
    return await initializeSettings();
}

function i18n(key) {
    return chrome.i18n.getMessage(key);
}

async function setupContextMenu() {
    await chrome.contextMenus.removeAll();
    const settings = await getSettings();
    if (!settings.showContextMenu) {
        return;
    }

    const commands = await chrome.commands.getAll();
    const activateShortcut = commands.find(c => c.name === 'activate-selection')?.shortcut || '';
    const copyShortcut = commands.find(c => c.name === 'activate-selection-copy')?.shortcut || '';

    chrome.contextMenus.create({
        id: "activate-selection-menu",
        title: `${i18n("cmdActivate")}${activateShortcut ? ` (${activateShortcut})` : ''}`,
        contexts: ["page"]
    }, () => chrome.runtime.lastError);

    chrome.contextMenus.create({
        id: "activate-selection-copy-menu",
        title: `${i18n("cmdActivateCopy")}${copyShortcut ? ` (${copyShortcut})` : ''}`,
        contexts: ["page"]
    }, () => chrome.runtime.lastError);
}

async function checkAndApplyBrowserLanguage() {
    const settings = await getSettings();
    const currentLang = settings.language;
    const UILang = chrome.i18n.getUILanguage().split('-')[0];
    const supportedLangs = ['en', 'ru'];

    if (supportedLangs.includes(UILang) && UILang !== currentLang) {
        await chrome.storage.sync.set({ language: UILang });
    }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === 'install') {
        await chrome.storage.sync.set(SYNC_DEFAULTS);
        await chrome.storage.local.set(LOCAL_DEFAULTS);
        await initializeSettings();
        await checkAndApplyBrowserLanguage();
    } else {
        await initializeSettings();
    }
    await setupContextMenu();
});

chrome.runtime.onStartup.addListener(async () => {
    await initializeSettings();
    await setupContextMenu();
});

chrome.storage.onChanged.addListener(async (changes, area) => {
    await initializeSettings();
    if (area === 'sync' && (changes.showContextMenu || changes.language)) {
        await setupContextMenu();
    }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === "activate-selection-menu") {
        triggerSelection(tab, "initiateSelection");
    } else if (info.menuItemId === "activate-selection-copy-menu") {
        triggerSelection(tab, "initiateSelectionCopy");
    }
});

chrome.tabs.onActivated.addListener(activeInfo => {
    if (activeSelectionTabId && activeSelectionTabId !== activeInfo.tabId) {
        chrome.tabs.sendMessage(activeSelectionTabId, { type: "resetSelection" }).catch(() => {
            if (activeSelectionTabId) {
                activeSelectionTabId = null;
            }
        });
    }
});

chrome.tabs.onRemoved.addListener((tabId, removeInfo) => {
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
        try {
            await chrome.tabs.sendMessage(activeSelectionTabId, { type: "resetSelection" });
        } catch (e) {
            activeSelectionTabId = null;
        }
    }

    const settings = await getSettings();
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
        excludedDomains: settings.excludedDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean),
        excludedWords: settings.excludedWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean),
    };

    try {
        await chrome.tabs.sendMessage(tabId, { type: "ping" });
        chrome.tabs.sendMessage(tabId, message, (response) => {
            if (!chrome.runtime.lastError && response?.success) {
                activeSelectionTabId = tabId;
            }
        });
    } catch (e) {
        try {
            await chrome.scripting.insertCSS({ target: { tabId }, files: ['styles.css'] });
            await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
            chrome.tabs.sendMessage(tabId, message, (response) => {
                if (!chrome.runtime.lastError && response?.success) {
                    activeSelectionTabId = tabId;
                }
            });
        } catch (injectError) {
            console.warn(`Area Links: Could not inject scripts into tab ${tabId}.`, injectError);
        }
    }
}

chrome.commands.onCommand.addListener((command, tab) => {
    const commandType = command === "activate-selection" ? "initiateSelection" : "initiateSelectionCopy";
    triggerSelection(tab, commandType);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ping') {
        sendResponse({ type: 'pong' });
        return true;
    }

    if (request.type === 'selectionDeactivated') {
        if (sender.tab && sender.tab.id === activeSelectionTabId) {
            activeSelectionTabId = null;
        }
        return false;
    }
    
    if (request.type === "openLinks") {
        processLinks(request.urls, sender.tab);
    }
    
    if (request.type === "saveCopyHistory") {
        getSettings().then(settings => {
            if (settings.useCopyHistory) {
                const newHistory = [...request.urls, ...settings.copyHistory].slice(0, HISTORY_LIMIT);
                chrome.storage.local.set({ copyHistory: newHistory });
            }
        });
    }

    if (request.type === 'triggerSelectionFromPopup') {
         chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            if (tab) {
                triggerSelection(tab, request.commandType);
            }
        });
    }

    if (request.type === 'refreshContextMenu') {
        setupContextMenu();
    }
});

async function processLinks(urls, tab) {
    const settings = await getSettings();
    const excludedDomains = settings.excludedDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    const excludedWords = settings.excludedWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    
    let urlsToProcess = urls;
    if (settings.removeDuplicatesInSelection) {
        urlsToProcess = [...new Set(urls)];
    }
    
    if (settings.reverseOrder) {
        urlsToProcess.reverse();
    }
    const filteredUrls = urlsToProcess.filter(url => {
        if (settings.useHistory && settings.linkHistory.includes(url)) {
            return false;
        }
        try {
            const lowerCaseUrl = url.toLowerCase();
            const urlHostname = new URL(url).hostname.toLowerCase();
            if (excludedDomains.some(domain => urlHostname.includes(domain))) return false;
            if (excludedWords.some(word => lowerCaseUrl.includes(word))) return false;
        } catch {
            return false;
        }
        return true;
    });
    const urlsToOpen = filteredUrls.slice(0, settings.tabLimit);
    if (urlsToOpen.length === 0) return;

    if (settings.openInNewWindow) {
        chrome.windows.create({
            url: urlsToOpen,
            focused: true
        });
    } else {
        const startIndex = (settings.openNextToParent && tab) ? tab.index + 1 : undefined;
        urlsToOpen.forEach((url, i) => {
            const newTabIndex = (startIndex !== undefined) ? startIndex + i : undefined;
            chrome.tabs.create({
                url,
                active: false,
                index: newTabIndex
            });
        });
    }
    
    if (settings.useHistory) {
        const newHistory = [...urlsToOpen, ...settings.linkHistory].slice(0, HISTORY_LIMIT);
        chrome.storage.local.set({
            linkHistory: newHistory
        });
    }
}