const QUICK_SETTINGS_CONFIG = [
    { id: 'popup-openNextToParent', key: 'openNextToParent', default: false, storage: 'sync' },
    { id: 'popup-removeDuplicatesInSelection', key: 'removeDuplicatesInSelection', default: true, storage: 'sync' },
    { id: 'popup-useHistory', key: 'useHistory', default: true, storage: 'local' },
    { id: 'popup-useCopyHistory', key: 'useCopyHistory', default: false, storage: 'local' },
    { id: 'popup-checkDuplicatesOnCopy', key: 'checkDuplicatesOnCopy', default: true, storage: 'local' },
];

const domCache = new Map();
const i18nCache = {};

const getElement = (id) => {
    if (!domCache.has(id)) domCache.set(id, document.getElementById(id));
    return domCache.get(id);
};

const i18n = (key, ...args) => {
    let message = i18nCache[key] || key;
    args.forEach((arg, i) => message = message.replace(`$${i + 1}`, arg));
    return message;
};

const loadLanguage = async (lang = 'en') => {
    if (Object.keys(i18nCache).length > 0) return;
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        const json = await response.json();
        Object.entries(json).forEach(([key, value]) => i18nCache[key] = value.message);
    } catch (error) {
        console.error(`Area Links: Could not load language file for ${lang}.`, error);
    }
};

const localizePage = () => {
    document.querySelectorAll('[data-i18n]').forEach(el => 
        el.textContent = i18n(el.dataset.i18n)
    );
    document.querySelectorAll('[data-i18n-title]').forEach(el => 
        el.title = i18n(el.dataset.i18nTitle)
    );
};

const showStatus = (messageKey = "popupStatusSaved") => {
    const statusEl = getElement('status-message');
    if (!statusEl) return;
    statusEl.textContent = i18n(messageKey);
    statusEl.style.opacity = '1';
    setTimeout(() => statusEl.style.opacity = '0', 1200);
};

const loadCommands = async () => {
    const commands = await chrome.commands.getAll();
    const buttonMap = {
        'activate-selection': 'action-open-links',
        'activate-selection-copy': 'action-copy-links'
    };
    
    commands.forEach(command => {
        const buttonId = buttonMap[command.name];
        if (buttonId && command.shortcut) {
            const shortcutEl = getElement(buttonId)?.querySelector('.shortcut');
            if (shortcutEl) shortcutEl.textContent = `(${command.shortcut})`;
        }
    });
};

const initialize = async () => {
    const settings = await chrome.storage.sync.get('language');
    
    await Promise.all([
        loadLanguage(settings.language),
        loadCommands(),
        chrome.runtime.sendMessage({ type: 'refreshContextMenu' }).catch(() => {})
    ]);

    localizePage();
    
    const version = chrome.runtime.getManifest().version;
    const versionTitle = i18n('popupLogoTitle', version);
    document.querySelector('.title-group .logo').title = versionTitle;
    document.querySelector('.title-group h1').title = versionTitle;

    const syncKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'sync').map(c => c.key);
    const localKeys = QUICK_SETTINGS_CONFIG.filter(c => c.storage === 'local').map(c => c.key);

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get(syncKeys),
        chrome.storage.local.get([...localKeys, 'linkHistory', 'copyHistory'])
    ]);
    
    const allSettings = { ...syncItems, ...localItems };

    const clearHistoryBtn = getElement('clear-history-popup');
    clearHistoryBtn.disabled = !localItems.linkHistory?.length && !localItems.copyHistory?.length;

    QUICK_SETTINGS_CONFIG.forEach(config => {
        const el = getElement(config.id);
        if (el) {
            el.checked = allSettings[config.key] ?? config.default;
            el.addEventListener('change', (e) => {
                chrome.storage[config.storage].set({ [config.key]: e.target.checked })
                    .then(() => showStatus());
            });
        }
    });

    const sendMessage = (commandType) => {
        chrome.runtime.sendMessage({ type: 'triggerSelectionFromPopup', commandType });
        window.close();
    };

    getElement('action-open-links').addEventListener('click', () => 
        sendMessage('initiateSelection')
    );
    getElement('action-copy-links').addEventListener('click', () => 
        sendMessage('initiateSelectionCopy')
    );
    
    clearHistoryBtn.addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            clearHistoryBtn.disabled = true;
            showStatus('optionsStatusHistoryCleared');
        });
    });
    
    getElement('open-options').addEventListener('click', () => 
        chrome.runtime.openOptionsPage()
    );

    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const isActiveTab = tabs.length > 0 && tabs[0].url?.startsWith('http');
    getElement('action-open-links').disabled = !isActiveTab;
    getElement('action-copy-links').disabled = !isActiveTab;
};

document.addEventListener('DOMContentLoaded', initialize);