const svgCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><line x1="16" y1="0" x2="16" y2="32" stroke="black" stroke-width="1.5"/><line x1="0" y1="16" x2="32" y2="16" stroke="black" stroke-width="1.5"/><rect x="20" y="20" width="10" height="10" fill="white" /><line x1="25" y1="21" x2="25" y2="29" stroke="black" stroke-width="2"/><line x1="21" y1="25" x2="29" y2="25" stroke="black" stroke-width="2"/></svg>`;
const customCopyCursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgCursor)}') 16 16, copy`;
const HIGHLIGHT_CLASS = 'link-opener-highlighted-link';
const DUPLICATE_CLASS = 'link-opener-duplicate-link';
const LIMIT_EXCEEDED_CLASS = 'link-opener-limit-exceeded';
const PREPARE_ANIMATION_CLASS = 'link-opener-prepare-animation';
if (window.hasRunAreaLinks) throw new Error('Area Links content script already injected');
window.hasRunAreaLinks = true;
const selectionState = {
    isActive: false, isSelecting: false, isCopyMode: false, isUpdateScheduled: false,
    style: 'classic-blue', startCoords: { x: 0, y: 0 }, currentCoords: { x: 0, y: 0 },
    settings: {}, historySet: new Set(), copyHistorySet: new Set(),
};
let selectionBox = null;
let selectionOverlay = null;
let cachedLinks = null;

const setSelectionBoxAppearance = (settings) => {
    if (!selectionBox) return;
    const { selectionBoxStyle: boxStyle, selectionBoxColor: boxColor } = settings || {};
    if (!boxStyle || !boxColor) {
        selectionBox.style.cssText = '';
        if (settings?.style) selectionBox.className = settings.style;
        return;
    }
    selectionBox.className = '';
    const rgb = /^#?([0-9a-f]{6})$/i.exec(boxColor);
    const borderStyle = { solid: 'solid', dashed: 'dashed', dotted: 'dotted', subtle: 'solid' }[boxStyle] || 'dashed';
    const borderWidth = boxStyle === 'subtle' ? '1px' : '2px';
    if (rgb) {
        const [r, g, b] = [parseInt(rgb[1].substr(0, 2), 16), parseInt(rgb[1].substr(2, 2), 16), parseInt(rgb[1].substr(4, 2), 16)];
        selectionBox.style.setProperty('--al-selection-border-color', `rgba(${r}, ${g}, ${b}, ${boxStyle === 'subtle' ? 0.75 : 0.9})`);
        selectionBox.style.setProperty('--al-selection-fill-color', `rgba(${r}, ${g}, ${b}, ${boxStyle === 'subtle' ? 0.12 : 0.25})`);
    } else {
        selectionBox.style.setProperty('--al-selection-border-color', boxColor);
        selectionBox.style.setProperty('--al-selection-fill-color', boxColor);
    }
    selectionBox.style.setProperty('--al-selection-border-style', borderStyle);
    selectionBox.style.setProperty('--al-selection-border-width', borderWidth);
};

const createSelectionElements = () => {
    if (!selectionOverlay) {
        selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'link-opener-selection-overlay';
        document.body.appendChild(selectionOverlay);
    }
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.id = 'link-opener-selection-box';
        document.body.appendChild(selectionBox);
    }
};

const getSelectionRectangle = (start, end) => {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
};

const updateSelectionBox = () => {
    if (!selectionBox) return;
    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    Object.assign(selectionBox.style, {
        left: `${rect.x - window.scrollX}px`, top: `${rect.y - window.scrollY}px`,
        width: `${rect.width}px`, height: `${rect.height}px`
    });
};

const getLinkData = (item) => {
    if (!item.data) {
        const raw = item.el.href;
        let host = '';
        try { host = new URL(raw).hostname.toLowerCase(); } catch {}
        item.data = {
            raw: raw,
            h: host,
            l: raw.toLowerCase(),
            d: decodeURI(raw).toLowerCase()
        };
    }
    return item.data;
};

const updateLinkHighlights = () => {
    if (!cachedLinks) return;
    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    const { isCopyMode, settings, historySet, copyHistorySet } = selectionState;
    const relevantHistory = isCopyMode ? copyHistorySet : historySet;
    const useHistory = isCopyMode ? settings.useCopyHistory : settings.useHistory;
    const removeDuplicates = isCopyMode ? settings.checkDuplicatesOnCopy : settings.removeDuplicatesInSelection;
    const seenInCurrentPass = new Set();
    let count = 0;
    const len = cachedLinks.length;
    for (let i = 0; i < len; i++) {
        const item = cachedLinks[i];
        const isInside = !(item.t > rect.bottom || item.b < rect.top || item.l > rect.right || item.r < rect.left);
        if (isInside) {
            const data = getLinkData(item);
            let isExcluded = false;
            if ((!isCopyMode || settings.applyExclusionsOnCopy)) {
                const { excludedDomains = [], excludedWords = [] } = settings;
                if (excludedDomains.some(d => data.h.includes(d))) isExcluded = true;
                else if (excludedWords.some(w => data.h.includes(w) || data.l.includes(w) || data.d.includes(w))) isExcluded = true;
            }
            const isHistory = useHistory && relevantHistory.has(data.raw);
            const isSeen = seenInCurrentPass.has(data.raw);
            let newStatus = 0;
            let className = '';
            if (!isExcluded && !isHistory && (!removeDuplicates || !isSeen)) {
                if (isCopyMode || count < settings.tabLimit) {
                    newStatus = 1;
                    className = HIGHLIGHT_CLASS;
                    count++;
                } else if (!isCopyMode) {
                    newStatus = 3;
                    className = LIMIT_EXCEEDED_CLASS;
                }
            } else {
                newStatus = 2;
                className = DUPLICATE_CLASS;
            }
            if (removeDuplicates) seenInCurrentPass.add(data.raw);
            if (item.status !== newStatus) {
                if (item.status !== 0) item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
                if (className) item.el.classList.add(className);
                item.status = newStatus;
            }
        } else {
            if (item.status !== 0) {
                item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
                item.status = 0;
            }
        }
    }
};

const resetSelection = () => {
    if (!selectionState.isActive) return;
    if (selectionOverlay) {
        selectionOverlay.removeEventListener('mousedown', handleMouseDown, true);
        selectionOverlay.removeEventListener('mousemove', handleMouseMove, true);
        selectionOverlay.removeEventListener('mouseup', handleMouseUp, true);
        selectionOverlay.style.display = 'none';
    }
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('scroll', handleScroll, { passive: true });
    if (selectionBox) selectionBox.style.display = 'none';
    if (cachedLinks) {
        cachedLinks.forEach(item => {
            if (item.status !== 0) {
                item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
            }
        });
    }
    document.body.classList.remove(PREPARE_ANIMATION_CLASS);
    delete document.body.dataset.linkOpenerHighlightStyle;
    document.body.style.cursor = 'default';
    selectionState.isActive = false;
    selectionState.isSelecting = false;
    cachedLinks = null;
    chrome.runtime.sendMessage({ type: 'selectionDeactivated' }).catch(() => {});
};

const copyLinksToClipboard = (links) => {
    const text = links.join('\n');
    if (selectionState.settings.useCopyHistory && links.length) {
        chrome.runtime.sendMessage({ type: "saveCopyHistory", urls: links });
    }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).catch(console.error);
    } else {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); } catch {}
        document.body.removeChild(ta);
    }
};

const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resetSelection();
    }
};

const scheduleUpdate = () => {
    if (!selectionState.isUpdateScheduled && selectionState.isSelecting) {
        selectionState.isUpdateScheduled = true;
        requestAnimationFrame(() => {
            if (selectionState.isSelecting) {
                updateSelectionBox();
                updateLinkHighlights();
            }
            selectionState.isUpdateScheduled = false;
        });
    }
};

const handleScroll = () => { if (selectionState.isSelecting) scheduleUpdate(); };

const handleMouseMove = (e) => {
    if (selectionState.isSelecting) {
        if ((e.buttons & 1) === 0) return handleMouseUp(e);
        selectionState.currentCoords = { x: e.pageX, y: e.pageY };
        scheduleUpdate();
    }
};

const handleMouseUp = (e) => {
    if (e.button !== 0 || !selectionState.isSelecting) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    if ((rect.width > 5 || rect.height > 5) && cachedLinks) {
        const urls = [];
        const len = cachedLinks.length;
        for (let i = 0; i < len; i++) {
            if (cachedLinks[i].status === 1) {
                urls.push(getLinkData(cachedLinks[i]).raw);
            }
        }
        if (urls.length) {
            selectionState.isCopyMode ? copyLinksToClipboard(urls) : chrome.runtime.sendMessage({ type: "openLinks", urls });
        }
    }
    resetSelection();
};

const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    selectionState.isSelecting = true;
    selectionState.startCoords = { x: e.pageX, y: e.pageY };
    selectionState.currentCoords = { x: e.pageX, y: e.pageY };
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    cachedLinks = [];
    const links = document.querySelectorAll('a[href]');
    const len = links.length;
    for (let i = 0; i < len; i++) {
        const element = links[i];
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        cachedLinks.push({
            el: element,
            l: rect.left + scrollX,
            r: rect.right + scrollX,
            t: rect.top + scrollY,
            b: rect.bottom + scrollY,
            status: 0,
            data: null
        });
    }
    setSelectionBoxAppearance(selectionState.settings);
    selectionBox.style.display = 'block';
    updateSelectionBox();
    selectionOverlay.addEventListener('mousemove', handleMouseMove, true);
    selectionOverlay.addEventListener('mouseup', handleMouseUp, true);
};

const initSelection = (settings) => {
    if (selectionState.isActive) resetSelection();
    Object.assign(selectionState, {
        isActive: true, isCopyMode: settings.type === "initiateSelectionCopy",
        settings, historySet: new Set(settings.linkHistory || []),
        copyHistorySet: new Set(settings.copyHistory || [])
    });
    document.body.dataset.linkOpenerHighlightStyle = settings.highlightStyle;
    document.body.classList.add(PREPARE_ANIMATION_CLASS);
    document.body.style.cursor = selectionState.isCopyMode ? customCopyCursor : 'crosshair';
    createSelectionElements();
    setSelectionBoxAppearance(settings);
    selectionOverlay.style.display = 'block';
    selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('scroll', handleScroll, { passive: true });
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'ping') return sendResponse({ type: "pong" });
    if (request.type === 'resetSelection') return resetSelection();
    if (request.type.startsWith('initiateSelection')) {
        initSelection(request);
        sendResponse({ success: true });
    }
});

['popstate', 'hashchange', 'pagehide'].forEach(event => window.addEventListener(event, resetSelection));