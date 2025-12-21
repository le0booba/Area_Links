const SETTINGS_CONFIG = {
    tabLimit: { default: 15, storage: 'sync' },
    selectionStyle: { default: 'dashed-blue', storage: 'sync' },
    highlightStyle: { default: 'classic-yellow', storage: 'sync' },
    openInNewWindow: { default: false, storage: 'sync' },
    reverseOrder: { default: false, storage: 'sync' },
    openNextToParent: { default: false, storage: 'sync' },
    applyExclusionsOnCopy: { default: false, storage: 'sync' },
    language: { default: 'en', storage: 'sync' },
    showContextMenu: { default: true, storage: 'sync' },
    removeDuplicatesInSelection: { default: true, storage: 'sync' },
    excludedDomains: { default: '', storage: 'local' },
    excludedWords: { default: '', storage: 'local' },
    useHistory: { default: true, storage: 'local' },
    useCopyHistory: { default: false, storage: 'local' },
    checkDuplicatesOnCopy: { default: true, storage: 'local' },
};

let messages = {};
let savedExcludedDomains = '';
let savedExcludedWords = '';
const saveTimers = {};

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
        if (messages[key]) el.textContent = messages[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        if (messages[key]) el.placeholder = messages[key];
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

function updateExportButtonState() {
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');
    document.getElementById('exportExclusions').disabled = domainsTextarea.value.trim() === '' && wordsTextarea.value.trim() === '';
}

function updateSaveButtonState() {
    const saveButton = document.getElementById('saveExclusions');
    if (!saveButton) return;
    const currentDomainsValue = document.getElementById('excludedDomains').value;
    const currentWordsValue = document.getElementById('excludedWords').value;
    const hasUnsavedChanges = currentDomainsValue.trim() !== savedExcludedDomains.trim() || currentWordsValue.trim() !== savedExcludedWords.trim();
    saveButton.classList.toggle('has-unsaved-changes', hasUnsavedChanges);
    saveButton.disabled = !hasUnsavedChanges;
}

async function restoreOptions() {
    const syncKeys = Object.keys(SETTINGS_CONFIG).filter(k => SETTINGS_CONFIG[k].storage === 'sync');
    const localKeys = Object.keys(SETTINGS_CONFIG).filter(k => SETTINGS_CONFIG[k].storage === 'local');
    const syncDefaults = syncKeys.reduce((acc, key) => ({ ...acc, [key]: SETTINGS_CONFIG[key].default }), {});
    const localDefaults = localKeys.reduce((acc, key) => ({ ...acc, [key]: SETTINGS_CONFIG[key].default }), {});

    const [syncItems, localItems] = await Promise.all([
        chrome.storage.sync.get(syncDefaults),
        chrome.storage.local.get(localDefaults)
    ]);
    const settings = { ...syncItems, ...localItems };

    await loadLanguage(settings.language);

    document.getElementById('ext-version').textContent = 'v' + chrome.runtime.getManifest().version;
    document.getElementById('tabLimit').value = settings.tabLimit;
    document.getElementById('selectionStyle').value = settings.selectionStyle;
    document.getElementById('highlightStyle').value = settings.highlightStyle;
    document.getElementById('language-select').value = settings.language;
    
    ['openInNewWindow', 'reverseOrder', 'openNextToParent', 'applyExclusionsOnCopy', 'useHistory', 'checkDuplicatesOnCopy', 'showContextMenu', 'removeDuplicatesInSelection', 'useCopyHistory'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.checked = settings[id];
        }
    });

    savedExcludedDomains = settings.excludedDomains;
    savedExcludedWords = settings.excludedWords;
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');
    domainsTextarea.value = savedExcludedDomains;
    wordsTextarea.value = savedExcludedWords;

    const detailsEl = document.getElementById('exclusions-details');
    if (domainsTextarea.value.trim() || wordsTextarea.value.trim()) {
        if (localStorage.getItem('exclusionsOpen') === 'true') {
            detailsEl.open = true;
        }
    } else {
        detailsEl.open = false;
    }

    chrome.storage.local.get(['linkHistory', 'copyHistory'], (items) => {
        const clearHistoryButton = document.getElementById('clearHistory');
        if (clearHistoryButton) {
            const hasLinks = (items.linkHistory && items.linkHistory.length > 0) || (items.copyHistory && items.copyHistory.length > 0);
            clearHistoryButton.disabled = !hasLinks;
        }
    });

    localizePage();
    updateClearButtonsState();
    updateSaveButtonState();
    updateExportButtonState();

    document.body.classList.remove('loading-settings');
}

function saveExclusions() {
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');

    const sanitizeDomains = (str) => {
        let cleaned = str.replace(/[\r\n\s]+/g, ',');
        cleaned = cleaned.replace(/https?:\/\//gi, '');
        cleaned = cleaned.replace(/[^\p{L}\p{N}\.\-,]/gu, '');
        
        return cleaned.split(',')
            .map(item => item.trim())
            .filter(item => item)
            .join(',');
    };

    const sanitizeWords = (str) => {
        let cleaned = str.replace(/[\r\n\s]+/g, ',');
        cleaned = cleaned.replace(/[^\p{L}\p{N}\.\-_~!$&'()*+,;=:@%\/]/gu, '');
        return cleaned.split(',')
            .map(item => item.trim())
            .filter(item => item)
            .join(',');
    };
    
    const domainsToSave = sanitizeDomains(domainsTextarea.value);
    const wordsToSave = sanitizeWords(wordsTextarea.value);

    domainsTextarea.value = domainsToSave;
    wordsTextarea.value = wordsToSave;

    updateClearButtonsState();
    updateExportButtonState();

    const settingsToSave = { excludedDomains: domainsToSave, excludedWords: wordsToSave };
    chrome.storage.local.set(settingsToSave).then(() => {
        showStatus('status-exclusions', messages.optionsStatusExclusionsSaved);
        savedExcludedDomains = domainsToSave;
        savedExcludedWords = wordsToSave;
        updateSaveButtonState();

        const exclusionsDetails = document.getElementById('exclusions-details');
        if (domainsToSave || wordsToSave) {
            if (exclusionsDetails.open) {
                localStorage.setItem('exclusionsOpen', 'true');
            }
        } else {
            localStorage.removeItem('exclusionsOpen');
        }
    });
}

function clearHistory() {
    chrome.storage.local.set({ linkHistory: [], copyHistory: [] })
        .then(() => {
            showStatus('status-history', messages.optionsStatusHistoryCleared, false, 3000);
            document.getElementById('clearHistory').disabled = true;
        });
}

function handleExport() {
    const domains = document.getElementById('excludedDomains').value;
    const words = document.getElementById('excludedWords').value;
    const data = { excludedDomains: domains, excludedWords: words };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    
    const date = new Date();
    const dateString = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    a.download = `area-links-exclusions_${dateString}.json`;
    
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const domainsTextarea = document.getElementById('excludedDomains');
            const wordsTextarea = document.getElementById('excludedWords');
            let changesMade = false;

            const lang = document.getElementById('language-select').value;
            const fieldDisplayNames = {
                excludedDomains: lang === 'ru' ? 'Исключенные домены' : 'Excluded Domains',
                excludedWords: lang === 'ru' ? 'Исключенные слова' : 'Excluded Words'
            };

            const processField = (fieldName, textarea) => {
                if (fieldName in data && typeof data[fieldName] === 'string') {
                    const newData = data[fieldName].trim();
                    const oldData = textarea.value.trim();

                    if (oldData && newData) {
                        const displayName = fieldDisplayNames[fieldName] || fieldName;
                        const message = messages.optionsImportConflictMessage.replace('[FIELD_NAME]', displayName);
                        if (confirm(message)) {
                            textarea.value = oldData + ',' + newData;
                        } else {
                            textarea.value = newData;
                        }
                    } else if (newData) {
                        textarea.value = newData;
                    }
                    changesMade = true;
                }
            };

            processField('excludedDomains', domainsTextarea);
            processField('excludedWords', wordsTextarea);

            if (changesMade) {
                saveExclusions();
                updateExportButtonState();
                updateClearButtonsState();
                showStatus('status-exclusions', messages.optionsStatusImportSuccess);
            }

        } catch (error) {
            showStatus('status-exclusions', messages.optionsStatusImportError, true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

function setupEventListeners() {
    document.getElementById('saveExclusions').addEventListener('click', saveExclusions);
    document.getElementById('clearHistory').addEventListener('click', clearHistory);
    document.getElementById('exportExclusions').addEventListener('click', handleExport);
    document.getElementById('importExclusions').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });
    document.getElementById('import-file-input').addEventListener('change', handleImport);
    
    const exclusionsDetails = document.getElementById('exclusions-details');
    const domainsTextarea = document.getElementById('excludedDomains');
    const wordsTextarea = document.getElementById('excludedWords');

    exclusionsDetails.addEventListener('toggle', (e) => {
        if (domainsTextarea.value.trim() || wordsTextarea.value.trim()) {
            localStorage.setItem('exclusionsOpen', e.target.open);
        } else {
            localStorage.removeItem('exclusionsOpen');
        }
    });

    const textareasHandler = () => {
        updateClearButtonsState();
        updateSaveButtonState();
        updateExportButtonState();
    };
    domainsTextarea.addEventListener('input', textareasHandler);
    wordsTextarea.addEventListener('input', textareasHandler);

    document.getElementById('clearExcludedDomains').addEventListener('click', () => {
        domainsTextarea.value = '';
        saveExclusions();
        updateClearButtonsState();
        updateExportButtonState();
    });
    document.getElementById('clearExcludedWords').addEventListener('click', () => {
        wordsTextarea.value = '';
        saveExclusions();
        updateClearButtonsState();
        updateExportButtonState();
    });
    document.getElementById('shortcutsLink').addEventListener('click', (e) => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });

    document.getElementById('language-select').addEventListener('change', (e) => {
        const newLang = e.target.value;
        chrome.storage.sync.set({ language: newLang }).then(() => {
            location.reload();
        });
    });

    document.querySelector('main').addEventListener('change', (e) => {
        const el = e.target;
        const id = el.id;
        if (id === 'language-select' || el.id === 'import-file-input') return;

        const config = SETTINGS_CONFIG[id];
        if (!config || el.tagName === 'TEXTAREA') return;

        let value;
        let statusId;
        
        switch (el.type) {
            case 'checkbox':
                value = el.checked;
                break;
            case 'number':
                value = parseInt(el.value, 10);
                if (isNaN(value) || value < 1 || value > 50) {
                    showStatus('status-behavior', `${messages.optionsStatusError} ${messages.optionsStatusTabLimitError}`, true, 3500);
                    chrome.storage.sync.get({ tabLimit: SETTINGS_CONFIG.tabLimit.default }).then(items => {
                        el.value = items.tabLimit;
                    });
                    return;
                }
                break;
            default:
                value = el.value;
                break;
        }

        const storageArea = chrome.storage[config.storage];
        
        if (saveTimers[id]) {
            clearTimeout(saveTimers[id]);
        }

        saveTimers[id] = setTimeout(() => {
            storageArea.set({ [id]: value }).then(() => {
                if (id.startsWith('popup-')) return;
                if (['selectionStyle', 'showContextMenu', 'highlightStyle'].includes(id)) {
                    statusId = 'status-appearance';
                } else if (id === 'applyExclusionsOnCopy') {
                    statusId = 'status-exclusions';
                } else {
                    statusId = 'status-behavior';
                }
                if(statusId) showStatus(statusId, messages.optionsStatusSettingSaved);
            });
            delete saveTimers[id];
        }, 400);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    document.title = `${chrome.i18n.getMessage('extName')} - ${chrome.i18n.getMessage('optionsTitle')}`;
    restoreOptions();
    setupEventListeners();
});