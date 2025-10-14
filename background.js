const HISTORY_LIMIT = 50;
const SYNC_DEFAULTS = {
  tabLimit: 15,
  selectionStyle: 'classic-blue',
  highlightStyle: 'classic-yellow',
  openInNewWindow: false,
  reverseOrder: false,
  openNextToParent: false,
  language: 'en',
  showContextMenu: true,
};
const LOCAL_DEFAULTS = {
  excludedDomains: '',
  excludedWords: '',
  linkHistory: [],
  useHistory: true,
  checkDuplicatesOnCopy: true,
};

let settingsCache = null;
let isMenuSetupRunning = false;

async function initializeSettings() {
    const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(SYNC_DEFAULTS),
        chrome.storage.local.get(LOCAL_DEFAULTS)
    ]);
    settingsCache = { ...syncSettings, ...localSettings };
    return settingsCache;
}

async function getSettings() {
    return settingsCache || await initializeSettings();
}

function i18n(key) {
    return chrome.i18n.getMessage(key);
}

async function setupContextMenu() {
    if (isMenuSetupRunning) {
        return;
    }
    isMenuSetupRunning = true;
    try {
        const settings = await getSettings();
        if (settings.showContextMenu) {
            const commands = await chrome.commands.getAll();
            const activateShortcut = commands.find(c => c.name === 'activate-selection')?.shortcut || '';
            const copyShortcut = commands.find(c => c.name === 'activate-selection-copy')?.shortcut || '';

            const menus = [
                {
                    id: "activate-selection-menu",
                    title: `${i18n("cmdActivate")}${activateShortcut ? ` (${activateShortcut})` : ''}`,
                    contexts: ["page"]
                },
                {
                    id: "activate-selection-copy-menu",
                    title: `${i18n("cmdActivateCopy")}${copyShortcut ? ` (${copyShortcut})` : ''}`,
                    contexts: ["page"]
                }
            ];

            await Promise.all(menus.map(menu => {
                return new Promise(resolve => {
                    chrome.contextMenus.update(menu.id, { title: menu.title }, () => {
                        if (chrome.runtime.lastError) {
                            chrome.contextMenus.create(menu, resolve);
                        } else {
                            resolve();
                        }
                    });
                });
            }));
        } else {
             await chrome.contextMenus.removeAll();
        }
    } finally {
        isMenuSetupRunning = false;
    }
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
    }
    await initializeSettings();
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

async function triggerSelection(tab, commandType) {
    if (!tab.url?.startsWith('http') || !tab.id) {
        return;
    }
    const tabId = tab.id;
    const settings = await getSettings();
    const message = {
        type: commandType,
        style: settings.selectionStyle,
        highlightStyle: settings.highlightStyle,
        checkDuplicatesOnCopy: settings.checkDuplicatesOnCopy,
        useHistory: settings.useHistory,
        linkHistory: settings.useHistory ? settings.linkHistory : []
    };

    try {
        const response = await chrome.tabs.sendMessage(tabId, { type: "ping" });
        if (response && response.type === "pong") {
            chrome.tabs.sendMessage(tabId, message);
        }
    } catch (e) {
        try {
            await chrome.scripting.insertCSS({
                target: { tabId },
                files: ['styles.css'],
            });
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['content.js'],
            });
            chrome.tabs.sendMessage(tabId, message);
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
    if (request.type === "openLinks") {
        processLinks(request.urls, sender.tab);
        return false;
    }

    if (request.type === 'triggerSelectionFromPopup') {
         chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
            if (tab) {
                triggerSelection(tab, request.commandType);
            }
        });
        return false;
    }
    return false;
});

async function processLinks(urls, tab) {
    const settings = await getSettings();
    const excludedDomains = settings.excludedDomains.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
    const excludedWords = settings.excludedWords.split(',').map(w => w.trim().toLowerCase()).filter(Boolean);
    let uniqueUrls = [...new Set(urls)];
    if (settings.reverseOrder) {
        uniqueUrls.reverse();
    }
    const filteredUrls = uniqueUrls.filter(url => {
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