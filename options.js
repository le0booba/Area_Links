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

const domCache = new Map();
const i18nCache = {};
let savedExcludedDomains = '';
let savedExcludedWords = '';

const getElement = (id) => {
    if (!domCache.has(id)) domCache.set(id, document.getElementById(id));
    return domCache.get(id);
};

const i18n = (key, ...args) => {
    let message = i18nCache[key] || key;
    args.forEach((arg, i) => message = message.replace(`$${i + 1}`, arg));
    return message;
};

const debounce = (fn, delay) => {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
};

const loadLanguage = async (lang = 'en') => {
    if (Object.keys(i18nCache).length > 0) return;
    try {
        const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        if (!response.ok) throw new Error('Network response was not ok');
        const json = await response.json();
        Object.entries(json).forEach(([key, value]) => i18nCache[key] = value.message);
    } catch (error) {
        console.error(`Area Links: Could not load language file for ${lang}.`, error);
        if (lang !== 'en') await loadLanguage('en');
    }
};

const localizePage = () => {
    document.title = i18n('optionsTitle');
    document.querySelectorAll('[data-i18n]').forEach(el => 
        el.textContent = i18n(el.dataset.i18n)
    );
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => 
        el.placeholder = i18n(el.dataset.i18nPlaceholder)
    );
};

const showStatus = (elementId, messageKey, isError = false, duration = 2000) => {
    const status = getElement(elementId);
    if (!status) return;
    status.textContent = i18n(messageKey);
    status.className = `status-message ${isError ? 'status-error' : 'status-success'}`;
    setTimeout(() => status.textContent = '', duration);
};

const updateExclusionButtonsState = () => {
    const domainsValue = getElement('excludedDomains').value.trim();
    const wordsValue = getElement('excludedWords').value.trim();
    
    getElement('clearExcludedDomains').disabled = domainsValue === '';
    getElement('clearExcludedWords').disabled = wordsValue === '';
    getElement('exportExclusions').disabled = domainsValue === '' && wordsValue === '';
    
    const hasUnsavedChanges = domainsValue !== savedExcludedDomains.trim() || 
                               wordsValue !== savedExcludedWords.trim();
    const saveButton = getElement('saveExclusions');
    saveButton.classList.toggle('has-unsaved-changes', hasUnsavedChanges);
    saveButton.disabled = !hasUnsavedChanges;
};

const restoreOptions = async () => {
    const syncKeys = Object.keys(SETTINGS_CONFIG).filter(k => SETTINGS_CONFIG[k].storage === 'sync');
    const localKeys = Object.keys(SETTINGS_CONFIG).filter(k => SETTINGS_CONFIG[k].storage === 'local');
    const syncDefaults = syncKeys.reduce((acc, key) => ({ 
        ...acc, [key]: SETTINGS_CONFIG[key].default 
    }), {});
    const localDefaults = localKeys.reduce((acc, key) => ({ 
        ...acc, [key]: SETTINGS_CONFIG[key].default 
    }), {});

    const [syncSettings, localSettings] = await Promise.all([
        chrome.storage.sync.get(syncDefaults),
        chrome.storage.local.get(localDefaults)
    ]);
    const settings = { ...syncSettings, ...localSettings };

    await loadLanguage(settings.language);
    localizePage();

    getElement('ext-version').textContent = 'v' + chrome.runtime.getManifest().version;

    Object.keys(SETTINGS_CONFIG).forEach(id => {
        const el = getElement(id);
        if (!el || id === 'language') return;
        if (el.type === 'checkbox') {
            el.checked = settings[id];
        } else {
            el.value = settings[id];
        }
    });

    getElement('language-select').value = settings.language;

    savedExcludedDomains = settings.excludedDomains;
    savedExcludedWords = settings.excludedWords;

    const detailsEl = getElement('exclusions-details');
    if (localStorage.getItem('exclusionsOpen') === 'true' && 
        (savedExcludedDomains || savedExcludedWords)) {
        detailsEl.open = true;
    }

    const { linkHistory = [], copyHistory = [] } = await chrome.storage.local.get([
        'linkHistory', 'copyHistory'
    ]);
    getElement('clearHistory').disabled = linkHistory.length === 0 && copyHistory.length === 0;

    updateExclusionButtonsState();
    document.body.classList.remove('loading-settings');
};

const saveExclusions = () => {
    const domainsTextarea = getElement('excludedDomains');
    const wordsTextarea = getElement('excludedWords');

    const sanitize = (str, isDomain) => {
        let cleaned = str.replace(/[\r\n\s]+/g, ',').replace(/https?:\/\//gi, '');
        const regex = isDomain 
            ? /[^\p{L}\p{N}\.\-,]/gu 
            : /[^\p{L}\p{N}\.\-_~!$&'()*+,;=:@%\/]/gu;
        cleaned = cleaned.replace(regex, '');
        return cleaned.split(',').map(s => s.trim()).filter(Boolean).join(',');
    };

    const domainsToSave = sanitize(domainsTextarea.value, true);
    const wordsToSave = sanitize(wordsTextarea.value, false);

    domainsTextarea.value = domainsToSave;
    wordsTextarea.value = wordsToSave;

    chrome.storage.local.set({ 
        excludedDomains: domainsToSave, 
        excludedWords: wordsToSave 
    }).then(() => {
        showStatus('status-exclusions', 'optionsStatusExclusionsSaved');
        savedExcludedDomains = domainsToSave;
        savedExcludedWords = wordsToSave;
        updateExclusionButtonsState();
        localStorage.setItem('exclusionsOpen', getElement('exclusions-details').open);
    });
};

const debouncedSaveSetting = debounce((storage, key, value, statusId, messageKey) => {
    chrome.storage[storage].set({ [key]: value })
        .then(() => showStatus(statusId, messageKey))
        .catch(err => showStatus(statusId, 'optionsStatusError', true));
}, 400);

const handleSettingChange = (e) => {
    const el = e.target;
    const { id, type } = el;
    const config = SETTINGS_CONFIG[id];
    if (!config || el.tagName === 'TEXTAREA' || id === 'language-select') return;

    let value = type === 'checkbox' ? el.checked : 
                type === 'number' ? parseInt(el.value, 10) : el.value;
    
    if (type === 'number' && (isNaN(value) || value < 1 || value > 50)) {
        showStatus('status-behavior', 'optionsStatusTabLimitError', true, 3500);
        chrome.storage.sync.get({ tabLimit: SETTINGS_CONFIG.tabLimit.default })
            .then(i => el.value = i.tabLimit);
        return;
    }
    
    const statusId = ['selectionStyle', 'showContextMenu', 'highlightStyle'].includes(id) 
        ? 'status-appearance'
        : id === 'applyExclusionsOnCopy' ? 'status-exclusions' : 'status-behavior';
    
    debouncedSaveSetting(config.storage, id, value, statusId, 'optionsStatusSettingSaved');
};

const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = e => {
        try {
            const data = JSON.parse(e.target.result);
            ['excludedDomains', 'excludedWords'].forEach(field => {
                if (data[field] && typeof data[field] === 'string') {
                    const textarea = getElement(field);
                    const oldData = textarea.value.trim();
                    const newData = data[field].trim();
                    if (oldData && newData && 
                        confirm(i18n('optionsImportConflictMessage', i18n(field)))) {
                        textarea.value = `${oldData},${newData}`;
                    } else if (newData) {
                        textarea.value = newData;
                    }
                }
            });
            saveExclusions();
            showStatus('status-exclusions', 'optionsStatusImportSuccess');
        } catch (error) {
            showStatus('status-exclusions', 'optionsStatusImportError', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

const setupEventListeners = () => {
    getElement('saveExclusions').addEventListener('click', saveExclusions);
    
    getElement('clearHistory').addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            showStatus('status-history', 'optionsStatusHistoryCleared', false, 3000);
            getElement('clearHistory').disabled = true;
        });
    });
    
    getElement('exportExclusions').addEventListener('click', () => {
        const data = { 
            excludedDomains: getElement('excludedDomains').value, 
            excludedWords: getElement('excludedWords').value 
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.download = `area-links-exclusions_${new Date().toISOString().slice(0, 10)}.json`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
    });
    
    getElement('importExclusions').addEventListener('click', () => 
        getElement('import-file-input').click()
    );
    getElement('import-file-input').addEventListener('change', handleImport);

    ['excludedDomains', 'excludedWords'].forEach(id => {
        const textarea = getElement(id);
        textarea.addEventListener('input', updateExclusionButtonsState);
        getElement(`clear${id.charAt(0).toUpperCase() + id.slice(1)}`)
            .addEventListener('click', () => {
                textarea.value = '';
                saveExclusions();
            });
    });

    getElement('language-select').addEventListener('change', e => {
        chrome.storage.sync.set({ language: e.target.value }).then(() => location.reload());
    });
    
    getElement('shortcutsLink').addEventListener('click', e => {
        e.preventDefault();
        chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
    });
    
    getElement('exclusions-details').addEventListener('toggle', e => {
        localStorage.setItem('exclusionsOpen', e.target.open);
    });
    
    document.querySelector('main').addEventListener('change', handleSettingChange);
};

document.addEventListener('DOMContentLoaded', async () => {
    await restoreOptions();
    setupEventListeners();
});