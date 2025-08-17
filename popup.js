const QUICK_SETTINGS_CONFIG = [
    { id: 'popup-openInNewWindow', key: 'openInNewWindow', default: false, storage: 'sync' },
    { id: 'popup-reverseOrder', key: 'reverseOrder', default: false, storage: 'sync' },
    { id: 'popup-useHistory', key: 'useHistory', default: true, storage: 'local' },
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
}

function showStatus() {
    const statusEl = document.getElementById('status-message');
    if (!statusEl) return;
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

async function activateSelection(type) {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
        window.close();
        return;
    }

    try {
        const response = await chrome.tabs.sendMessage(tab.id, { type: "ping" });
        if (response?.type !== "pong") {
            window.close();
            return;
        }
    } catch (err) {
        window.close();
        return;
    }

    try {
        const settings = await chrome.storage.sync.get(['selectionStyle']);
        const localSettings = await chrome.storage.local.get(['useHistory', 'checkDuplicatesOnCopy', 'linkHistory']);
        const message = {
            type: type,
            style: settings.selectionStyle,
            checkDuplicatesOnCopy: localSettings.checkDuplicatesOnCopy,
            useHistory: localSettings.useHistory,
            linkHistory: localSettings.useHistory ? localSettings.linkHistory : [],
        };
        chrome.tabs.sendMessage(tab.id, message);
        window.close();
    } catch (err) {
        console.error("An error occurred while preparing to activate selection:", err);
        window.close();
    }
}

async function initialize() {
    const syncKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'sync').map(c => c.key);
    const localKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'local').map(c => c.key);

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get([...syncKeys, 'language']),
        chrome.storage.local.get(localKeys)
    ]);

    const allSettings = { ...syncItems, ...localItems };

    await loadLanguage(allSettings.language || 'en');
    localizePage();
    loadCommands();

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

    document.getElementById('action-open-links').addEventListener('click', () => activateSelection('initiateSelection'));
    document.getElementById('action-copy-links').addEventListener('click', () => activateSelection('initiateSelectionCopy'));
    document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
}

document.addEventListener('DOMContentLoaded', initialize);