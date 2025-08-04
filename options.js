const DEFAULT_SETTINGS = {
    excludedDomains: '',
    excludedWords: '',
    tabLimit: 15,
    selectionStyle: 'classic-blue',
    openInNewWindow: false,
    reverseOrder: false,
    useHistory: true,
    checkDuplicatesOnCopy: true,
    language: 'en',
    showContextMenu: true,
};

const SYNC_SETTINGS_KEYS = ['excludedDomains', 'excludedWords', 'tabLimit', 'selectionStyle', 'openInNewWindow', 'reverseOrder', 'language', 'showContextMenu'];
const LOCAL_SETTINGS_KEYS = ['useHistory', 'checkDuplicatesOnCopy'];

let messages = {};
let savedExcludedDomains = '';
let savedExcludedWords = '';

async function loadLanguage(lang) {
    try {
        const url = chrome.runtime.getURL(`_locales/${lang}/messages.json`);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to fetch ${lang}`);
        const json = await response.json();
        messages = Object.entries(json).reduce((acc, [key, value]) => {
            acc[key] = value.message;
            return acc;
        }, {});
    } catch (error) {
        console.error(`Could not load language file for ${lang}:`, error);
        if (lang !== 'en') await loadLanguage('en');
    }
}

function localizePage() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const target = el.classList.contains('button-text') ? el : el;
        if (messages[key]) target.textContent = messages[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (messages[key]) el.placeholder = messages[key];
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        if (key === "Area Links Options") {
            document.title = `${messages.extName || 'Area Links'} - ${messages.optionsTitle || 'Settings'}`;
        } else if (messages[key]) {
            el.title = messages[key];
        }
    });
}

function showStatus(elementId, message, isError = false, duration = 2000) {
    const status = document.getElementById(elementId);
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? 'var(--danger-color)' : 'var(--primary-color)';
    setTimeout(() => {
        if (status.textContent === message) {
            status.textContent = '';
        }
    }, duration);
}

function updateClearButtonsState() {
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');
    document.getElementById('clearExcludedDomains').disabled = domainsTextarea.value.trim() === '';
    document.getElementById('clearExcludedWords').disabled = wordsTextarea.value.trim() === '';
}

function updateSaveButtonState() {
    const saveButton = document.getElementById('saveExclusions');
    if (!saveButton) return;

    const currentDomains = document.getElementById('excludedDomains').value;
    const currentWords = document.getElementById('excludedWords').value;

    const hasUnsavedChanges =
        currentDomains.trim() !== savedExcludedDomains.trim() ||
        currentWords.trim() !== savedExcludedWords.trim();
    
    saveButton.classList.toggle('has-unsaved-changes', hasUnsavedChanges);
}

async function restoreOptions() {
    const syncDefaults = SYNC_SETTINGS_KEYS.reduce((acc, key) => ({ ...acc, [key]: DEFAULT_SETTINGS[key] }), {});
    const localDefaults = LOCAL_SETTINGS_KEYS.reduce((acc, key) => ({ ...acc, [key]: DEFAULT_SETTINGS[key] }), {});

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get(syncDefaults),
        chrome.storage.local.get(localDefaults)
    ]);

    const settings = { ...syncItems, ...localItems };

    await loadLanguage(settings.language);

    document.getElementById('ext-version').textContent = 'v' + chrome.runtime.getManifest().version;
    document.getElementById('tabLimit').value = settings.tabLimit;
    document.getElementById('selectionStyle').value = settings.selectionStyle;
    document.getElementById('openInNewWindow').checked = settings.openInNewWindow;
    document.getElementById('reverseOrder').checked = settings.reverseOrder;
    document.getElementById('useHistory').checked = settings.useHistory;
    document.getElementById('checkDuplicatesOnCopy').checked = settings.checkDuplicatesOnCopy;
    document.getElementById('showContextMenu').checked = settings.showContextMenu;
    document.getElementById('language-select').value = settings.language;

    savedExcludedDomains = settings.excludedDomains;
    savedExcludedWords = settings.excludedWords;
    document.getElementById('excludedDomains').value = savedExcludedDomains;
    document.getElementById('excludedWords').value = savedExcludedWords;

    const exclusionsDetails = document.getElementById('exclusions-details');
    if (localStorage.getItem('exclusionsOpen') === 'true') {
        exclusionsDetails.open = true;
    }

    localizePage();
    updateClearButtonsState();
    updateSaveButtonState();
}

function saveExclusions() {
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');
    
    const domainsToSave = domainsTextarea.value.trim();
    const wordsToSave = wordsTextarea.value.trim();

    domainsTextarea.value = domainsToSave;
    wordsTextarea.value = wordsToSave;

    const settingsToSave = {
        excludedDomains: domainsToSave,
        excludedWords: wordsToSave,
    };
    chrome.storage.sync.set(settingsToSave).then(() => {
        showStatus('status-exclusions', messages.optionsStatusExclusionsSaved);
        savedExcludedDomains = domainsToSave;
        savedExcludedWords = wordsToSave;
        updateSaveButtonState();
    });
}

function clearHistory() {
    chrome.storage.local.set({ linkHistory: [] })
        .then(() => showStatus('status-history', messages.optionsStatusHistoryCleared, false, 3000));
}

function setupEventListeners() {
    document.getElementById('saveExclusions').addEventListener('click', saveExclusions);
    document.getElementById('clearHistory').addEventListener('click', clearHistory);

    const exclusionsDetails = document.getElementById('exclusions-details');
    exclusionsDetails.addEventListener('toggle', () => {
        localStorage.setItem('exclusionsOpen', exclusionsDetails.open);
    });

    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');
    
    domainsTextarea.addEventListener('input', () => {
        updateClearButtonsState();
        updateSaveButtonState();
    });
    wordsTextarea.addEventListener('input', () => {
        updateClearButtonsState();
        updateSaveButtonState();
    });

    document.getElementById('clearExcludedDomains').addEventListener('click', () => {
        domainsTextarea.value = '';
        updateClearButtonsState();
        saveExclusions();
    });
    document.getElementById('clearExcludedWords').addEventListener('click', () => {
        wordsTextarea.value = '';
        updateClearButtonsState();
        saveExclusions();
    });

    document.getElementById('shortcutsLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
}

function setupInstantSaveHandlers() {
    const instantSaveHandler = (key, value, storageArea, statusId) => {
        chrome.storage[storageArea].set({ [key]: value }).then(() => {
            if (statusId) {
                showStatus(statusId, messages.optionsStatusSettingSaved);
            }
        });
    };

    ['openInNewWindow', 'reverseOrder'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => instantSaveHandler(id, e.target.checked, 'sync', 'status-behavior'));
    });
    ['useHistory', 'checkDuplicatesOnCopy'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => instantSaveHandler(id, e.target.checked, 'local', 'status-behavior'));
    });

    document.getElementById('showContextMenu').addEventListener('change', (e) => {
        instantSaveHandler('showContextMenu', e.target.checked, 'sync', 'status-appearance');
    });

    document.getElementById('selectionStyle').addEventListener('change', (e) => {
        instantSaveHandler('selectionStyle', e.target.value, 'sync', 'status-appearance');
    });

    document.getElementById('language-select').addEventListener('change', async (e) => {
        await loadLanguage(e.target.value);
        localizePage();
        instantSaveHandler('language', e.target.value, 'sync');
    });

    document.getElementById('tabLimit').addEventListener('change', (e) => {
        const value = parseInt(e.target.value, 10);
        if (isNaN(value) || value < 1 || value > 50) {
            showStatus('status-behavior', `${messages.optionsStatusError} ${messages.optionsStatusTabLimitError}`, true, 3500);
            chrome.storage.sync.get({ tabLimit: 15 }).then(items => {
                e.target.value = items.tabLimit;
            });
        } else {
            instantSaveHandler('tabLimit', value, 'sync', 'status-behavior');
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    restoreOptions();
    setupEventListeners();
    setupInstantSaveHandlers();
});