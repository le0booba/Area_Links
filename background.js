const HISTORY_LIMIT = 50;
const SYNC_DEFAULTS = {
  excludedDomains: '',
  excludedWords: '',
  tabLimit: 15,
  selectionStyle: 'classic-blue',
  openInNewWindow: false,
  reverseOrder: false,
  language: 'en',
  showContextMenu: true,
};

const LOCAL_DEFAULTS = {
  linkHistory: [],
  useHistory: true,
  checkDuplicatesOnCopy: true,
};

let isMenuSetupRunning = false;

async function getSettings() {
  let [syncSettings, localSettings] = await Promise.all([
    chrome.storage.sync.get(SYNC_DEFAULTS),
    chrome.storage.local.get(LOCAL_DEFAULTS)
  ]);
  
  return { ...syncSettings, ...localSettings };
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
        await chrome.contextMenus.removeAll();
        const settings = await getSettings();
        if (settings.showContextMenu) {
            const commands = await chrome.commands.getAll();
            const activateShortcut = commands.find(c => c.name === 'activate-selection')?.shortcut || '';
            const copyShortcut = commands.find(c => c.name === 'activate-selection-copy')?.shortcut || '';

            chrome.contextMenus.create({
                id: "activate-selection-menu",
                title: `${i18n("cmdActivate")}${activateShortcut ? ` (${activateShortcut})` : ''}`,
                contexts: ["page"]
            });
            chrome.contextMenus.create({
                id: "activate-selection-copy-menu",
                title: `${i18n("cmdActivateCopy")}${copyShortcut ? ` (${copyShortcut})` : ''}`,
                contexts: ["page"]
            });
        }
    } finally {
        isMenuSetupRunning = false;
    }
}

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.sync.set(SYNC_DEFAULTS);
    chrome.storage.local.set(LOCAL_DEFAULTS);
  }
  setupContextMenu();
});

chrome.runtime.onStartup.addListener(() => {
    setTimeout(() => {
        setupContextMenu();
    }, 1500);
});

chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && (changes.showContextMenu || changes.language)) {
        setupContextMenu();
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
    if (!tab.url?.startsWith('http')) {
        return;
    }

    const settings = await getSettings();

    chrome.tabs.sendMessage(tab.id, {
        type: commandType,
        style: settings.selectionStyle,
        checkDuplicatesOnCopy: settings.checkDuplicatesOnCopy,
        useHistory: settings.useHistory,
        linkHistory: settings.useHistory ? settings.linkHistory : []
    }).catch(error => {
        console.warn(`Area Links: Could not establish connection with content script. ${error.message}`);
    });
}


chrome.commands.onCommand.addListener((command, tab) => {
    const commandType = command === "activate-selection" ? "initiateSelection" : "initiateSelectionCopy";
    triggerSelection(tab, commandType);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "openLinks") {
    processLinks(request.urls);
    return false;
  }
  return false;
});

async function processLinks(urls) {
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
    chrome.windows.create({ url: urlsToOpen, focused: true });
  } else {
    urlsToOpen.forEach(url => chrome.tabs.create({ url, active: false }));
  }

  if (settings.useHistory) {
    const newHistory = [...urlsToOpen, ...settings.linkHistory].slice(0, HISTORY_LIMIT);
    chrome.storage.local.set({ linkHistory: newHistory });
  }
}