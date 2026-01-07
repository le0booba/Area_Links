const SETTINGS_CONFIG = {
    tabLimit: { default: 15, storage: 'sync' },
    selectionBoxStyle: { default: 'solid', storage: 'sync' },
    selectionBoxColor: { default: '#007bff', storage: 'sync' },
    selectionColorCustomPreset0: { default: '#007bff', storage: 'sync' },
    selectionColorCustomPreset1: { default: '#c90062', storage: 'sync' },
    selectionColorCustomPreset2: { default: '#28a745', storage: 'sync' },
    selectionColorCustomPreset3: { default: '#343a40', storage: 'sync' },
    selectionStyle: { default: 'dashed-blue', storage: 'sync' },
    highlightStyle: { default: 'classic-yellow', storage: 'sync' },
    openInNewWindow: { default: false, storage: 'sync' },
    reverseOrder: { default: false, storage: 'sync' },
    openNextToParent: { default: true, storage: 'sync' },
    applyExclusionsOnCopy: { default: false, storage: 'sync' },
    language: { default: 'en', storage: 'sync' },
    showContextMenu: { default: true, storage: 'sync' },
    removeDuplicatesInSelection: { default: true, storage: 'sync' },
    checkDuplicatesOnCopy: { default: true, storage: 'sync' },
    excludedDomains: { default: '', storage: 'local' },
    excludedWords: { default: '', storage: 'local' },
    useHistory: { default: true, storage: 'local' },
    useCopyHistory: { default: false, storage: 'local' },
};
const domCache = new Map();
const i18nCache = {};
const i18nDefaults = {};
const successIconSVG = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="status-success"><polyline points="20 6 9 17 4 12"></polyline></svg>';
let savedExcludedDomains = '';
let savedExcludedWords = '';
const getElement = (id) => {
    if (!domCache.has(id)) domCache.set(id, document.getElementById(id));
    return domCache.get(id);
};
const i18n = (key, ...args) => {
    let message = i18nCache[key] || i18nDefaults[key] || key;
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
    } catch {
        if (lang !== 'en') await loadLanguage('en');
    }
};
const localizePage = () => {
    document.title = i18n('optionsTitle');
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = i18n(el.dataset.i18n));
    document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = i18n(el.dataset.i18nTitle));
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => el.placeholder = i18n(el.dataset.i18nPlaceholder));
};
const showStatus = (elementId, messageKey, isError = false, duration = 2000) => {
    const status = getElement(elementId);
    if (!status) return;
    status.textContent = i18n(messageKey);
    status.className = `status-message ${elementId.includes('header') ? 'header-status-msg' : ''} ${isError ? 'status-error' : 'status-success'}`;
    setTimeout(() => status.textContent = '', duration);
};
const animateButtonIcon = (btnId, color = 'var(--primary-color)') => {
    const btn = getElement(btnId);
    if (!btn) return;
    const originalHTML = btn.innerHTML;
    btn.innerHTML = successIconSVG;
    const originalColor = btn.style.color;
    btn.style.color = color;
    setTimeout(() => { 
        btn.innerHTML = originalHTML;
        btn.style.color = originalColor;
    }, 1200);
};
const updateExclusionButtonsState = () => {
    const domainsValue = getElement('excludedDomains').value.trim();
    const wordsValue = getElement('excludedWords').value.trim();
    getElement('clearExcludedDomains').disabled = !domainsValue;
    getElement('clearExcludedWords').disabled = !wordsValue;
    getElement('exportExclusions').disabled = !domainsValue && !wordsValue;
    const hasUnsavedChanges = domainsValue !== savedExcludedDomains.trim() || wordsValue !== savedExcludedWords.trim();
    const saveButton = getElement('saveExclusions');
    saveButton.classList.toggle('has-unsaved-changes', hasUnsavedChanges);
    saveButton.disabled = !hasUnsavedChanges;
};
const customPresets = [
    { btnId: 'selectionColorPresetCustom0', saveId: 'selectionColorPresetCustomSave0', key: 'selectionColorCustomPreset0' },
    { btnId: 'selectionColorPresetCustom1', saveId: 'selectionColorPresetCustomSave1', key: 'selectionColorCustomPreset1' },
    { btnId: 'selectionColorPresetCustom2', saveId: 'selectionColorPresetCustomSave2', key: 'selectionColorCustomPreset2' },
    { btnId: 'selectionColorPresetCustom3', saveId: 'selectionColorPresetCustomSave3', key: 'selectionColorCustomPreset3' },
];
const checkResetButtonState = () => {
    const resetButton = getElement('resetColorPresets');
    if (!resetButton) return;
    const currentBoxStyle = getElement('selectionBoxStyle').value;
    const currentHighlightStyle = getElement('highlightStyle').value;
    if (currentBoxStyle !== 'solid' || currentHighlightStyle !== 'classic-yellow') {
        resetButton.disabled = false;
        return;
    }
    const presetKeys = customPresets.map(p => p.key);
    chrome.storage.sync.get([...presetKeys, 'selectionBoxColor']).then(currentSettings => {
        const isDefaultPresets = customPresets.every(p => currentSettings[p.key] === SETTINGS_CONFIG[p.key].default);
        const isDefaultColor = currentSettings.selectionBoxColor === SETTINGS_CONFIG.selectionColorCustomPreset0.default;
        resetButton.disabled = isDefaultPresets && isDefaultColor;
    });
};
const updateShortcutsDisplay = () => {
    chrome.commands.getAll(commands => {
        const openCmd = commands.find(c => c.name === 'activate-selection');
        const copyCmd = commands.find(c => c.name === 'activate-selection-copy');
        const openEl = document.getElementById('shortcut-open');
        const copyEl = document.getElementById('shortcut-copy');
        if (openEl) openEl.textContent = openCmd?.shortcut || 'Alt+Z';
        if (copyEl) copyEl.textContent = copyCmd?.shortcut || 'Alt+X';
    });
};
const restoreOptions = async () => {
    const syncDefaults = {}, localDefaults = {};
    Object.keys(SETTINGS_CONFIG).forEach(k => {
        (SETTINGS_CONFIG[k].storage === 'sync' ? syncDefaults : localDefaults)[k] = SETTINGS_CONFIG[k].default;
    });
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
        el.type === 'checkbox' ? el.checked = settings[id] : el.value = settings[id];
    });
    customPresets.forEach(p => {
        const btn = getElement(p.btnId);
        if (btn) btn.style.setProperty('--preset-color', settings[p.key]);
    });
    const selectedColor = (settings.selectionBoxColor || '').toLowerCase();
    customPresets.forEach(p => {
        const btn = getElement(p.btnId);
        if (!btn) return;
        btn.classList.remove('selected');
        const c = (btn.dataset.color || settings[p.key] || '').toLowerCase();
        if (c === selectedColor) btn.classList.add('selected');
    });
    getElement('language-select').value = settings.language;
    savedExcludedDomains = settings.excludedDomains;
    savedExcludedWords = settings.excludedWords;
    const detailsEl = getElement('exclusions-details');
    if (localStorage.getItem('exclusionsOpen') === 'true' && (savedExcludedDomains || savedExcludedWords)) {
        detailsEl.open = true;
    }
    const { linkHistory = [], copyHistory = [] } = await chrome.storage.local.get(['linkHistory', 'copyHistory']);
    getElement('clearHistory').disabled = !linkHistory.length && !copyHistory.length;
    updateExclusionButtonsState();
    checkResetButtonState();
    updateShortcutsDisplay();
    document.body.classList.remove('loading-settings');
};
const saveExclusions = () => {
    const domainsTextarea = getElement('excludedDomains');
    const wordsTextarea = getElement('excludedWords');
    const sanitize = (str, isDomain) => {
        let cleaned = str.replace(/[\r\n\s]+/g, ',').replace(/https?:\/\//gi, '');
        cleaned = cleaned.replace(isDomain ? /[^\p{L}\p{N}\.\-,]/gu : /[^\p{L}\p{N}\.\-_~!$&'()*+,;=:@%\/]/gu, '');
        return cleaned.split(',').map(s => s.trim()).filter(Boolean).join(',');
    };
    const domainsToSave = sanitize(domainsTextarea.value, true);
    const wordsToSave = sanitize(wordsTextarea.value, false);
    domainsTextarea.value = domainsToSave;
    wordsTextarea.value = wordsToSave;
    chrome.storage.local.set({ excludedDomains: domainsToSave, excludedWords: wordsToSave }).then(() => {
        const iconEl = getElement('status-exclusions-icon');
        if (iconEl) {
            iconEl.innerHTML = successIconSVG;
            setTimeout(() => iconEl.innerHTML = '', 2000);
        }

        savedExcludedDomains = domainsToSave;
        savedExcludedWords = wordsToSave;
        updateExclusionButtonsState();
        localStorage.setItem('exclusionsOpen', getElement('exclusions-details').open);
    });
};
const debouncedSaveSetting = debounce((storage, key, value, statusId, messageKey) => {
    chrome.storage[storage].set({ [key]: value }).then(() => {
        showStatus(statusId, messageKey);
        if (['selectionBoxStyle', 'highlightStyle', 'selectionBoxColor'].includes(key)) checkResetButtonState();
    }).catch(() => showStatus(statusId, 'optionsStatusError', true));
}, 400);
const handleSettingChange = (e) => {
    const el = e.target;
    const { id, type } = el;
    const config = SETTINGS_CONFIG[id];
    if (!config || el.tagName === 'TEXTAREA' || id === 'language-select') return;
    let value = type === 'checkbox' ? el.checked : type === 'number' ? parseInt(el.value, 10) : el.value;
    if (type === 'number' && (isNaN(value) || value < 1 || value > 50)) {
        showStatus('status-behavior', 'optionsStatusTabLimitError', true, 3500);
        chrome.storage.sync.get({ tabLimit: 15 }).then(i => el.value = i.tabLimit);
        return;
    }
    const statusId = id.includes('selection') || id === 'highlightStyle' || id === 'showContextMenu' ? 'status-appearance' : id === 'applyExclusionsOnCopy' ? 'status-exclusions' : 'status-behavior';
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
                    if (oldData && newData && confirm(i18n('optionsImportConflictMessage', i18n(field)))) {
                        textarea.value = `${oldData},${newData}`;
                    } else if (newData) textarea.value = newData;
                }
            });
            saveExclusions();
            animateButtonIcon('importExclusions');
        } catch {
            showStatus('status-exclusions', 'optionsStatusImportError', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};
const handleFullSettingsImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            
            const importDomains = data.local && data.local.excludedDomains ? data.local.excludedDomains.trim() : '';
            const importWords = data.local && data.local.excludedWords ? data.local.excludedWords.trim() : '';
            const currentDomains = getElement('excludedDomains').value.trim();
            const currentWords = getElement('excludedWords').value.trim();

            if ((importDomains || importWords) && (currentDomains || currentWords)) {
                if (confirm(i18n('optionsImportConflictMessage', i18n('optionsHeaderExclusions')))) {
                    if (!data.local) data.local = {};
                    if (currentDomains) {
                        data.local.excludedDomains = importDomains ? `${currentDomains},${importDomains}` : currentDomains;
                    }
                    if (currentWords) {
                        data.local.excludedWords = importWords ? `${currentWords},${importWords}` : currentWords;
                    }
                }
            }

            if (data.sync) await chrome.storage.sync.set(data.sync);
            if (data.local) await chrome.storage.local.set(data.local);
            
            animateButtonIcon('importSettings');
            setTimeout(() => { 
                location.reload(); 
            }, 1200);
        } catch {
            showStatus('status-backup', 'optionsStatusBackupError', true);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};
const setupEventListeners = () => {
    getElement('saveExclusions').addEventListener('click', saveExclusions);
    getElement('clearHistory').addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            const statusEl = getElement('status-history');
            statusEl.innerHTML = successIconSVG;
            setTimeout(() => statusEl.innerHTML = '', 2000);
            getElement('clearHistory').disabled = true;
        });
    });
    getElement('exportExclusions').addEventListener('click', () => {
        const data = { excludedDomains: getElement('excludedDomains').value, excludedWords: getElement('excludedWords').value };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        const d = new Date();
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        a.download = `area-links-exclusions_${dateStr}.json`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        animateButtonIcon('exportExclusions');
    });
    getElement('importExclusions').addEventListener('click', () => getElement('import-file-input').click());
    getElement('import-file-input').addEventListener('change', handleImport);
    
    getElement('exportSettings').addEventListener('click', async () => {
        const sync = await chrome.storage.sync.get(null);
        const local = await chrome.storage.local.get(['excludedDomains', 'excludedWords', 'useHistory', 'useCopyHistory']);
        const data = { sync, local };
        const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
        const a = document.createElement('a');
        const d = new Date();
        const dateStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
        a.download = `area-links-settings_${dateStr}.json`;
        a.href = url;
        a.click();
        URL.revokeObjectURL(url);
        
        animateButtonIcon('exportSettings');
    });
    getElement('importSettings').addEventListener('click', () => getElement('import-settings-file').click());
    getElement('import-settings-file').addEventListener('change', handleFullSettingsImport);

    ['excludedDomains', 'excludedWords'].forEach(id => {
        const textarea = getElement(id);
        textarea.addEventListener('input', updateExclusionButtonsState);
        getElement(`clear${id.charAt(0).toUpperCase() + id.slice(1)}`).addEventListener('click', () => {
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
    getElement('exclusions-details').addEventListener('toggle', e => localStorage.setItem('exclusionsOpen', e.target.open));
    document.querySelector('main').addEventListener('change', handleSettingChange);
    const saveSelectionBoxColor = (hex) => {
        debouncedSaveSetting('sync', 'selectionBoxColor', hex, 'status-appearance', 'optionsStatusSettingSaved');
        getElement('selectionBoxColor').value = hex;
        const normalized = hex.trim().toLowerCase();
        customPresets.forEach(p => {
            const btn = getElement(p.btnId);
            if (!btn) return;
            btn.classList.remove('selected');
            const c = (btn.dataset.color || btn.style.getPropertyValue('--preset-color') || '').trim().toLowerCase();
            if (c === normalized) btn.classList.add('selected');
        });
    };
    getElement('selectionBoxColor')?.addEventListener('input', (e) => saveSelectionBoxColor(e.target.value));
    customPresets.forEach(p => {
        getElement(p.btnId)?.addEventListener('click', () => {
            chrome.storage.sync.get({ [p.key]: SETTINGS_CONFIG[p.key].default }).then(v => {
                if (v[p.key]) saveSelectionBoxColor(v[p.key]);
            });
        });
        getElement(p.saveId)?.addEventListener('click', () => {
            const hex = getElement('selectionBoxColor').value;
            chrome.storage.sync.set({ [p.key]: hex }).then(() => {
                const btn = getElement(p.btnId);
                if (btn) btn.style.setProperty('--preset-color', hex);
                showStatus('status-appearance', 'optionsStatusSettingSaved');
                saveSelectionBoxColor(hex);
                checkResetButtonState();
            }).catch(() => showStatus('status-appearance', 'optionsStatusError', true));
        });
    });
    getElement('resetColorPresets')?.addEventListener('click', () => {
        const defaults = {
            selectionBoxStyle: 'solid', highlightStyle: 'classic-yellow',
            selectionBoxColor: SETTINGS_CONFIG.selectionColorCustomPreset0.default,
            ...customPresets.reduce((acc, p) => ({ ...acc, [p.key]: SETTINGS_CONFIG[p.key].default }), {})
        };
        chrome.storage.sync.set(defaults).then(() => {
            customPresets.forEach(p => getElement(p.btnId)?.style.setProperty('--preset-color', defaults[p.key]));
            getElement('selectionBoxStyle').value = defaults.selectionBoxStyle;
            getElement('highlightStyle').value = defaults.highlightStyle;
            
            const statusEl = getElement('status-reset-presets');
            statusEl.innerHTML = successIconSVG;
            setTimeout(() => statusEl.innerHTML = '', 2000);
            
            saveSelectionBoxColor(defaults.selectionBoxColor);
            checkResetButtonState();
        }).catch(() => showStatus('status-appearance', 'optionsStatusError', true));
    });
    window.addEventListener('focus', updateShortcutsDisplay);
};
document.addEventListener('DOMContentLoaded', async () => {
    await restoreOptions();
    setupEventListeners();
});