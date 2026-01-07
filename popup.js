const QUICK_SETTINGS = [
    { id: 'popup-openNextToParent', key: 'openNextToParent', default: true, storage: 'sync' },
    { id: 'popup-removeDuplicatesInSelection', key: 'removeDuplicatesInSelection', default: true, storage: 'sync' },
    { id: 'popup-useHistory', key: 'useHistory', default: true, storage: 'local' },
    { id: 'popup-useCopyHistory', key: 'useCopyHistory', default: false, storage: 'local' },
    { id: 'popup-checkDuplicatesOnCopy', key: 'checkDuplicatesOnCopy', default: true, storage: 'sync' },
];
const i18nCache = {};
const loadLanguage = async (lang) => {
    try {
        const res = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
        const json = await res.json();
        Object.entries(json).forEach(([k, v]) => i18nCache[k] = v.message);
    } catch {}
};
const i18n = (k, ...a) => {
    let m = i18nCache[k] || chrome.i18n.getMessage(k) || k;
    a.forEach((x, i) => m = m.replace(`$${i + 1}`, x));
    return m;
};
const showStatus = (k = "popupStatusSaved") => {
    const el = document.getElementById('status-message');
    if (!el) return;
    el.textContent = i18n(k);
    el.style.opacity = '1';
    setTimeout(() => el.style.opacity = '0', 1200);
};
document.addEventListener('DOMContentLoaded', async () => {
    const s = await chrome.storage.sync.get('language');
    await loadLanguage(s.language || 'en');
    const cmds = await chrome.commands.getAll();
    const map = { 'activate-selection': 'action-open-links', 'activate-selection-copy': 'action-copy-links' };
    cmds.forEach(c => {
        const id = map[c.name];
        if (id && c.shortcut) {
            const el = document.getElementById(id)?.querySelector('.shortcut');
            if (el) el.textContent = `(${c.shortcut})`;
        }
    });
    document.querySelectorAll('[data-i18n]').forEach(el => el.textContent = i18n(el.dataset.i18n));
    document.querySelectorAll('[data-i18n-title]').forEach(el => el.title = i18n(el.dataset.i18nTitle));
    const versionTitle = i18n('popupLogoTitle', chrome.runtime.getManifest().version);
    document.querySelector('.title-group .logo').title = versionTitle;
    document.querySelector('.title-group h1').title = versionTitle;
    const syncKeys = QUICK_SETTINGS.filter(c => c.storage === 'sync').map(c => c.key);
    const localKeys = QUICK_SETTINGS.filter(c => c.storage === 'local').map(c => c.key);
    const [sync, local] = await Promise.all([
        chrome.storage.sync.get(syncKeys), chrome.storage.local.get([...localKeys, 'linkHistory', 'copyHistory'])
    ]);
    const all = { ...sync, ...local };
    const clearBtn = document.getElementById('clear-history-popup');
    clearBtn.disabled = !local.linkHistory?.length && !local.copyHistory?.length;
    QUICK_SETTINGS.forEach(c => {
        const el = document.getElementById(c.id);
        if (el) {
            el.checked = all[c.key] ?? c.default;
            el.addEventListener('change', (e) => {
                chrome.storage[c.storage].set({ [c.key]: e.target.checked }).then(() => showStatus());
            });
        }
    });
    const send = (type) => { chrome.runtime.sendMessage({ type: 'triggerSelectionFromPopup', commandType: type }); window.close(); };
    const [openBtn, copyBtn] = [document.getElementById('action-open-links'), document.getElementById('action-copy-links')];
    openBtn.addEventListener('click', () => send('initiateSelection'));
    copyBtn.addEventListener('click', () => send('initiateSelectionCopy'));
    clearBtn.addEventListener('click', () => {
        chrome.storage.local.set({ linkHistory: [], copyHistory: [] }).then(() => {
            clearBtn.disabled = true;
            showStatus('optionsStatusHistoryCleared');
        });
    });
    document.getElementById('open-options').addEventListener('click', () => chrome.runtime.openOptionsPage());
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isActive = tab?.url?.startsWith('http');
    openBtn.disabled = !isActive;
    copyBtn.disabled = !isActive;
});