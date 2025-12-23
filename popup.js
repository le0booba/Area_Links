const QUICK_SETTINGS_CONFIG = [
    { id: 'popup-openNextToParent', key: 'openNextToParent', default: false, storage: 'sync' },
    { id: 'popup-removeDuplicatesInSelection', key: 'removeDuplicatesInSelection', default: true, storage: 'sync' },
    { id: 'popup-useHistory', key: 'useHistory', default: true, storage: 'local' },
    { id: 'popup-useCopyHistory', key: 'useCopyHistory', default: false, storage: 'local' },
    { id: 'popup-checkDuplicatesOnCopy', key: 'checkDuplicatesOnCopy', default: true, storage: 'local' },
];

const domCache = {};
const i18nCache = {};

function getElement(id) {
    if (!domCache[id]) {
        domCache[id] = document.getElementById(id);
    }
    return domCache[id];
}

function i18n(key, ...args) {
    let message = i18nCache[key] || key;
    args.forEach((arg, i) => {
        message = message.replace(`$${i + 1}`, arg);
    });
    return message;
}

async function loadLanguage(lang = 'en') {
    if (Object.keys(i18nCache).length > 0) return;
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        const json = await response.json();
        Object.entries(json).forEach(([key, value]) => {
            i18nCache[key] = value.message;
        });
    } catch (error) {
        console.error(`Area Links: Could not load language file for ${lang}.`, error);
    }
}

function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        el.textContent = i18n(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        el.title = i18n(el.dataset.i18nTitle);
    });
}

function showStatus(messageKey = "popupStatusSaved") {
    const statusEl = getElement('status-message');
    if (!statusEl) return;
    statusEl.textContent = i18n(messageKey);
    statusEl.style.opacity = '1';
    setTimeout(() => {
        statusEl.style.opacity = '0';
    }, 1200);
}

async function loadCommands() {
    const commands = await chrome.commands.getAll().catch(() => []);
    commands.forEach(command => {
        const buttonId = command.name === 'activate-selection' ? 'action-open-links' : 
                         command.name === 'activate-selection-copy' ? 'action-copy-links' : null;
        if (buttonId) {
            const button = getElement(buttonId);
            const shortcutEl = button?.querySelector('.shortcut');
            if (shortcutEl && command.shortcut) {
                shortcutEl.textContent = `(${command.shortcut})`;
            }
        }
    });
}

async function initialize() {
    const [settings, commands] = await Promise.all([
        chrome.storage.sync.get('language'),
        loadCommands(),
        chrome.runtime.sendMessage({ type: 'refreshContextMenu' }).catch(() => {})
    ]);

    await loadLanguage(settings.language);
    localizePage();
    
    const version = chrome.runtime.getManifest().version;
    const versionTitle = i18n('popupLogoTitle', version);
    document.querySelector('.logo').title = versionTitle;
    document.querySelector('.title-group h1').title = versionTitle;

    const syncKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'sync').map(c => c.key);
    const localKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'local').map(c => c.key);

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get(syncKeys),
        chrome.storage.local.get([...localKeys, 'linkHistory', 'copyHistory'])
    ]);
    
    const allSettings = { ...syncItems, ...localItems };

    const clearHistoryBtn = getElement('clear-history-popup');
    clearHistoryBtn.disabled = (localItems.linkHistory?.length === 0) && (localItems.copyHistory?.length === 0);

    QUICK_SETTINGS_CONFIG.forEach(config => {
        const el = getElement(config.id);
        if (el) {
            el.checked = allSettings[config.key] ?? config.default;
            el.addEventListener('change', (e) => {
                const storage = chrome.storage[config.storage];
                storage.set({ [config.key]: e.target.checked }).then(() => showStatus());
            });
        }
    });

    getElement('action-open-links').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'triggerSelectionFromPopup', commandType: 'initiateSelection' });
        window.close();
    });
    getElement('action-copy-links').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'triggerSelectionFromPopup', commandType: 'initiateSelectionCopy' });
        window.close();
    });
    clearHistoryBtn.addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            clearHistoryBtn.disabled = true;
            showStatus('optionsStatusHistoryCleared');
        });
    });
    getElement('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());

    // Enable action buttons only if a tab is active
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const isActiveTab = tabs.length > 0 && tabs[0].url?.startsWith('http');
        getElement('action-open-links').disabled = !isActiveTab;
        getElement('action-copy-links').disabled = !isActiveTab;
    });
}

document.addEventListener('DOMContentLoaded', initialize);