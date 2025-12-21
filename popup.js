const QUICK_SETTINGS_CONFIG = [
    { id: 'popup-openNextToParent', key: 'openNextToParent', default: false, storage: 'sync' },
    { id: 'popup-removeDuplicatesInSelection', key: 'removeDuplicatesInSelection', default: true, storage: 'sync' },
    { id: 'popup-useHistory', key: 'useHistory', default: true, storage: 'local' },
    { id: 'popup-useCopyHistory', key: 'useCopyHistory', default: false, storage: 'local' },
    { id: 'popup-checkDuplicatesOnCopy', key: 'checkDuplicatesOnCopy', default: true, storage: 'local' },
];

let messages = {};

async function loadLanguage(lang) {
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        const json = await response.json();
        messages = Object.entries(json).reduce((acc, [key, value]) => {
            acc[key] = value.message;
            return acc;
        }, {});
    } catch (error) {
        console.error(`Could not load language file for ${lang}:`, error);
    }
}

function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (messages[key]) {
            el.textContent = messages[key];
        }
    });
     document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (messages[key]) {
            el.title = messages[key];
        }
    });
}

function showStatus(messageKey = "popupStatusSaved") {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;
    statusEl.textContent = messages[messageKey] || '';
    statusEl.style.opacity = '1';
    setTimeout(() => {
        statusEl.style.opacity = '0';
    }, 1200);
}

async function loadCommands() {
    const commands = await chrome.commands.getAll();
    commands.forEach(command => {
        let buttonId;
        if (command.name === 'activate-selection') {
            buttonId = 'action-open-links';
        } else if (command.name === 'activate-selection-copy') {
            buttonId = 'action-copy-links';
        }

        if (buttonId) {
            const button = document.getElementById(buttonId);
            const shortcutEl = button.querySelector('.shortcut');
            if (shortcutEl && command.shortcut) {
                shortcutEl.textContent = `(${command.shortcut})`;
            }
        }
    });
}

async function establishConnection() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'ping' });
        return response?.type === 'pong';
    } catch (e) {
        return false;
    }
}

async function initialize() {
    chrome.runtime.sendMessage({ type: 'refreshContextMenu' });

    const isConnected = await establishConnection();
    const openBtn = document.getElementById('action-open-links');
    const copyBtn = document.getElementById('action-copy-links');
    const clearHistoryBtn = document.getElementById('clear-history-popup');

    if (isConnected) {
        openBtn.disabled = false;
        copyBtn.disabled = false;
    }

    const syncKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'sync').map(c => c.key);
    const localKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'local').map(c => c.key);

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get([...syncKeys, 'language']),
        chrome.storage.local.get([...localKeys, 'linkHistory', 'copyHistory'])
    ]);

    const allSettings = { ...syncItems, ...localItems };

    await loadLanguage(allSettings.language || 'en');
    localizePage();
    loadCommands();

    const version = chrome.runtime.getManifest().version;
    const versionTitle = chrome.i18n.getMessage('popupLogoTitle', version);

    const logoEl = document.querySelector('.logo');
    if (logoEl) {
        logoEl.title = versionTitle;
    }

    const titleEl = document.querySelector('.title-group h1');
    if (titleEl) {
        titleEl.title = versionTitle;
    }

    clearHistoryBtn.disabled = (!localItems.linkHistory || localItems.linkHistory.length === 0) && (!localItems.copyHistory || localItems.copyHistory.length === 0);

    QUICK_SETTINGS_CONFIG.forEach(config => {
        const el = document.getElementById(config.id);
        if (el) {
            el.checked = allSettings[config.key] ?? config.default;
            el.addEventListener('change', (e) => {
                const storageArea = config.storage === 'local' ? chrome.storage.local : chrome.storage.sync;
                storageArea.set({ [config.key]: e.target.checked }).then(showStatus);
            });
        }
    });

    openBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
            type: 'triggerSelectionFromPopup',
            commandType: 'initiateSelection'
        });
        window.close();
    });
    copyBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({
            type: 'triggerSelectionFromPopup',
            commandType: 'initiateSelectionCopy'
        });
        window.close();
    });
    clearHistoryBtn.addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            clearHistoryBtn.disabled = true;
            showStatus('optionsStatusHistoryCleared');
        });
    });
    document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

document.addEventListener('DOMContentLoaded', initialize);