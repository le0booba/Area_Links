(() => {
    const svgCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><line x1="16" y1="0" x2="16" y2="32" stroke="black" stroke-width="1.5"/><line x1="0" y1="16" x2="32" y2="16" stroke="black" stroke-width="1.5"/><rect x="20" y="20" width="10" height="10" fill="white" /><line x1="25" y1="21" x2="25" y2="29" stroke="black" stroke-width="2"/><line x1="21" y1="25" x2="29" y2="25" stroke="black" stroke-width="2"/></svg>`;
    const customCopyCursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgCursor)}') 16 16, copy`;
    const HIGHLIGHT_CLASS = 'link-opener-highlighted-link';
    const DUPLICATE_CLASS = 'link-opener-duplicate-link';
    const LIMIT_EXCEEDED_CLASS = 'link-opener-limit-exceeded';
    const PREPARE_ANIMATION_CLASS = 'link-opener-prepare-animation';

    if (window.hasRunAreaLinks) return;
    window.hasRunAreaLinks = true;

    const state = {
        isActive: false, isSelecting: false, isCopyMode: false, isUpdateScheduled: false,
        startX: 0, startY: 0, currentX: 0, currentY: 0,
        settings: {}, historySet: new Set(), copyHistorySet: new Set(),
    };

    let selectionBox = null;
    let selectionOverlay = null;
    let cachedLinks = null;
    const seenInCurrentPass = new Set();

    const setSelectionBoxAppearance = (settings = {}) => {
        if (!selectionBox) return;
        const { selectionBoxStyle: boxStyle, selectionBoxColor: boxColor, style } = settings;
        if (!boxStyle || !boxColor) {
            selectionBox.style.cssText = '';
            if (style) selectionBox.className = style;
            return;
        }
        selectionBox.className = '';
        const rgb = /^#?([0-9a-f]{6})$/i.exec(boxColor);
        const borderStyle = boxStyle === 'dotted' ? 'dotted' : boxStyle === 'solid' || boxStyle === 'subtle' ? 'solid' : 'dashed';
        const borderWidth = boxStyle === 'subtle' ? '1px' : '2px';
        if (rgb) {
            const hex = rgb[1];
            const r = parseInt(hex, 16) >> 16;
            const g = (parseInt(hex, 16) >> 8) & 0xff;
            const b = parseInt(hex, 16) & 0xff;
            const isSubtle = boxStyle === 'subtle';
            selectionBox.style.setProperty('--al-selection-border-color', `rgba(${r}, ${g}, ${b}, ${isSubtle ? 0.75 : 0.9})`);
            selectionBox.style.setProperty('--al-selection-fill-color', `rgba(${r}, ${g}, ${b}, ${isSubtle ? 0.12 : 0.25})`);
        } else {
            selectionBox.style.setProperty('--al-selection-border-color', boxColor);
            selectionBox.style.setProperty('--al-selection-fill-color', boxColor);
        }
        selectionBox.style.setProperty('--al-selection-border-style', borderStyle);
        selectionBox.style.setProperty('--al-selection-border-width', borderWidth);
    };

    const createSelectionElements = () => {
        selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'link-opener-selection-overlay';
        document.body.appendChild(selectionOverlay);

        selectionBox = document.createElement('div');
        selectionBox.id = 'link-opener-selection-box';
        selectionBox.style.display = 'none';
        document.body.appendChild(selectionBox);
    };

    const getRect = () => {
        const x = Math.min(state.startX, state.currentX);
        const y = Math.min(state.startY, state.currentY);
        const w = Math.abs(state.startX - state.currentX);
        const h = Math.abs(state.startY - state.currentY);
        return { left: x, top: y, right: x + w, bottom: y + h, width: w, height: h };
    };

    const updateSelectionBox = () => {
        if (!selectionBox) return;
        const { left, top, width, height } = getRect();
        selectionBox.style.cssText += `left:${left - window.scrollX}px;top:${top - window.scrollY}px;width:${width}px;height:${height}px;`;
    };

    const getDecodedLower = (data) => {
        if (data.d !== null) return data.d;
        try { data.d = decodeURI(data.raw).toLowerCase(); } catch { data.d = data.l; }
        return data.d;
    };

    const getLinkData = (item) => {
        if (item.data) return item.data;
        const raw = item.el.href;
        let host = '';
        try { host = new URL(raw).hostname.toLowerCase(); } catch { }
        item.data = { raw, h: host, l: raw.toLowerCase(), d: null };
        return item.data;
    };

    const updateLinkHighlights = () => {
        if (!cachedLinks) return;
        const rect = getRect();
        const { isCopyMode, settings, historySet, copyHistorySet } = state;
        const relevantHistory = isCopyMode ? copyHistorySet : historySet;
        const useHistory = isCopyMode ? settings.useCopyHistory : settings.useHistory;
        const removeDuplicates = isCopyMode ? settings.checkDuplicatesOnCopy : settings.removeDuplicatesInSelection;
        if (removeDuplicates) seenInCurrentPass.clear();
        const excludedDomains = settings.excludedDomains || [];
        const excludedWords = settings.excludedWords || [];
        const checkExclusions = !isCopyMode || settings.applyExclusionsOnCopy;
        const hasExcludedDomains = excludedDomains.length > 0;
        const hasExcludedWords = excludedWords.length > 0;
        let count = 0;

        for (const item of cachedLinks) {
            const inside = item.t <= rect.bottom && item.b >= rect.top && item.l <= rect.right && item.r >= rect.left;
            if (inside) {
                const data = getLinkData(item);
                let isExcluded = false;
                if (checkExclusions) {
                    if (hasExcludedDomains) isExcluded = excludedDomains.some(d => data.h.includes(d));
                    if (!isExcluded && hasExcludedWords) isExcluded = excludedWords.some(w => getDecodedLower(data).includes(w));
                }
                const isHistory = useHistory && relevantHistory.has(data.raw);
                const isSeen = removeDuplicates && seenInCurrentPass.has(data.raw);
                let newStatus, className;
                if (!isExcluded && !isHistory && !isSeen) {
                    if (isCopyMode || count < settings.tabLimit) {
                        newStatus = 1; className = HIGHLIGHT_CLASS; count++;
                    } else {
                        newStatus = 3; className = LIMIT_EXCEEDED_CLASS;
                    }
                } else {
                    newStatus = 2; className = DUPLICATE_CLASS;
                }
                if (removeDuplicates) seenInCurrentPass.add(data.raw);
                if (item.status !== newStatus) {
                    if (item.status !== 0) item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
                    item.el.classList.add(className);
                    item.status = newStatus;
                }
            } else if (item.status !== 0) {
                item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
                item.status = 0;
            }
        }
    };

    const handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') resetSelection();
    };

    const resetSelection = () => {
        if (!state.isActive) return;
        if (selectionOverlay) {
            selectionOverlay.removeEventListener('mousedown', handleMouseDown, true);
            selectionOverlay.removeEventListener('mousemove', handleMouseMove, true);
            selectionOverlay.removeEventListener('mouseup', handleMouseUp, true);
            selectionOverlay.remove();
            selectionOverlay = null;
        }
        document.removeEventListener('keydown', handleKeyDown, true);
        document.removeEventListener('scroll', handleScroll, { passive: true });
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        ['popstate', 'hashchange', 'pagehide', 'blur'].forEach(event => window.removeEventListener(event, resetSelection));

        if (selectionBox) {
            selectionBox.remove();
            selectionBox = null;
        }
        if (cachedLinks) {
            for (const item of cachedLinks) {
                if (item.status !== 0) item.el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
            }
        }
        document.body.classList.remove(PREPARE_ANIMATION_CLASS);
        delete document.body.dataset.linkOpenerHighlightStyle;
        document.body.style.cursor = '';

        state.isActive = false;
        state.isSelecting = false;
        cachedLinks = null;

        state.historySet.clear();
        state.copyHistorySet.clear();
        state.settings = {};
        seenInCurrentPass.clear();
    };

    const copyLinksToClipboard = (links) => {
        const text = links.join('\n');
        if (state.settings.useCopyHistory && links.length) {
            chrome.runtime.sendMessage({ type: 'saveCopyHistory', urls: links });
        }
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).catch(() => { });
        } else {
            const ta = Object.assign(document.createElement('textarea'), {
                value: text, style: 'position:fixed;opacity:0'
            });
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch { }
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
        if (!state.isUpdateScheduled && state.isSelecting) {
            state.isUpdateScheduled = true;
            requestAnimationFrame(() => {
                if (state.isSelecting) {
                    updateSelectionBox();
                    updateLinkHighlights();
                }
                state.isUpdateScheduled = false;
            });
        }
    };

    const handleScroll = () => { if (state.isSelecting) scheduleUpdate(); };

    const handleMouseMove = (e) => {
        if (!state.isSelecting) return;
        if ((e.buttons & 1) === 0) return handleMouseUp(e);
        state.currentX = e.pageX;
        state.currentY = e.pageY;
        scheduleUpdate();
    };

    const handleMouseUp = (e) => {
        if (e.button !== 0 || !state.isSelecting) return;
        e.preventDefault();
        e.stopPropagation();
        const rect = getRect();
        if ((rect.width > 5 || rect.height > 5) && cachedLinks) {
            const urls = cachedLinks.filter(item => item.status === 1).map(item => getLinkData(item).raw);
            if (urls.length) {
                state.isCopyMode
                    ? copyLinksToClipboard(urls)
                    : chrome.runtime.sendMessage({ type: 'openLinks', urls });
            }
        }
        resetSelection();
    };

    const handleMouseDown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.stopPropagation();
        state.isSelecting = true;
        state.startX = state.currentX = e.pageX;
        state.startY = state.currentY = e.pageY;

        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        cachedLinks = [];

        for (const element of document.links) {
            const r = element.getBoundingClientRect();
            if (r.width <= 1 || r.height <= 1) continue;
            const absLeft = r.left + scrollX;
            const absTop = r.top + scrollY;
            if (absLeft + r.width < 0 || absTop + r.height < 0) continue;
            cachedLinks.push({ el: element, l: absLeft, r: absLeft + r.width, t: absTop, b: absTop + r.height, status: 0, data: null });
        }

        setSelectionBoxAppearance(state.settings);
        selectionBox.style.display = 'block';
        updateSelectionBox();
        selectionOverlay.addEventListener('mousemove', handleMouseMove, true);
        selectionOverlay.addEventListener('mouseup', handleMouseUp, true);
    };

    const initSelection = (settings) => {
        if (state.isActive) resetSelection();
        state.isActive = true;
        state.isCopyMode = settings.type === 'initiateSelectionCopy';
        state.settings = settings;
        state.historySet = new Set(settings.linkHistory || []);
        state.copyHistorySet = new Set(settings.copyHistory || []);
        document.body.dataset.linkOpenerHighlightStyle = settings.highlightStyle;
        document.body.classList.add(PREPARE_ANIMATION_CLASS);
        document.body.style.cursor = state.isCopyMode ? customCopyCursor : 'crosshair';

        createSelectionElements();
        setSelectionBoxAppearance(settings);

        selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
        document.addEventListener('keydown', handleKeyDown, true);
        document.addEventListener('scroll', handleScroll, { passive: true });
        document.addEventListener('visibilitychange', handleVisibilityChange);
        ['popstate', 'hashchange', 'pagehide', 'blur'].forEach(event => window.addEventListener(event, resetSelection));
    };

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.type === 'ping') return sendResponse({ type: 'pong' });
        if (request.type === 'resetSelection') return resetSelection();
        if (request.type.startsWith('initiateSelection')) {
            initSelection(request);
            sendResponse({ success: true });
        }
    });
})();