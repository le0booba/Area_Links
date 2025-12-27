const svgCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><line x1="16" y1="0" x2="16" y2="32" stroke="black" stroke-width="1.5"/><line x1="0" y1="16" x2="32" y2="16" stroke="black" stroke-width="1.5"/><rect x="20" y="20" width="10" height="10" fill="white" /><line x1="25" y1="21" x2="25" y2="29" stroke="black" stroke-width="2"/><line x1="21" y1="25" x2="29" y2="25" stroke="black" stroke-width="2"/></svg>`;
const customCopyCursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgCursor)}') 16 16, copy`;
const HIGHLIGHT_CLASS = 'link-opener-highlighted-link';
const DUPLICATE_CLASS = 'link-opener-duplicate-link';
const LIMIT_EXCEEDED_CLASS = 'link-opener-limit-exceeded';
const PREPARE_ANIMATION_CLASS = 'link-opener-prepare-animation';

if (window.hasRunAreaLinks) {
    throw new Error('Area Links content script already injected');
}
window.hasRunAreaLinks = true;

const selectionState = {
    isActive: false,
    isSelecting: false,
    isCopyMode: false,
    isUpdateScheduled: false,
    style: 'classic-blue',
    startCoords: { x: 0, y: 0 },
    currentCoords: { x: 0, y: 0 },
    settings: {},
    historySet: new Set(),
    copyHistorySet: new Set(),
};

let selectionBox = null;
let selectionOverlay = null;
let allTrackedElements = new Set();
let highlightedLinks = [];
let cachedLinks = [];

const isValidLink = (element) => {
    const { href } = element;
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return false;

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    const style = window.getComputedStyle(element);
    return style.visibility === 'visible' && style.display !== 'none';
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
    const { style } = selectionBox;
    style.left = `${rect.x - window.scrollX}px`;
    style.top = `${rect.y - window.scrollY}px`;
    style.width = `${rect.width}px`;
    style.height = `${rect.height}px`;
};

const isExcluded = (url, rawHref) => {
    if (!url || !selectionState.settings) return false;
    const { excludedDomains = [], excludedWords = [] } = selectionState.settings;

    try {
        const urlHostname = new URL(url).hostname.toLowerCase();
        
        if (excludedDomains.some(domain => urlHostname.includes(domain))) return true;
        if (excludedWords.some(word => urlHostname.includes(word))) return true;

        const rawHrefLower = rawHref.toLowerCase();
        const decodedUrlLower = decodeURI(url).toLowerCase();

        if (excludedWords.some(word => 
            rawHrefLower.includes(word) || decodedUrlLower.includes(word)
        )) return true;
    } catch {
        return true;
    }
    return false;
};

const getFilteredLinks = (candidateElements) => {
    const finalLinks = [];
    const seenInSelection = new Set();

    const { isCopyMode, settings } = selectionState;
    const historySet = isCopyMode ? selectionState.copyHistorySet : selectionState.historySet;
    const useHistory = isCopyMode ? settings.useCopyHistory : settings.useHistory;
    const removeDuplicates = isCopyMode ? settings.checkDuplicatesOnCopy : settings.removeDuplicatesInSelection;

    for (const element of candidateElements) {
        const { href } = element;
        
        const isLinkExcluded = (!isCopyMode || settings.applyExclusionsOnCopy) && 
            isExcluded(href, element.href);
        const isSeenInHistory = useHistory && historySet.has(href);
        const isSeenInSelection = seenInSelection.has(href);
        
        if (isLinkExcluded || isSeenInHistory || (removeDuplicates && isSeenInSelection)) continue;
        if (!isCopyMode && finalLinks.length >= settings.tabLimit) break;

        finalLinks.push(element);
        if (removeDuplicates) seenInSelection.add(href);
    }
    return finalLinks;
};

const updateLinkHighlights = () => {
    const selectionRect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    const linksInSelectionBox = cachedLinks.filter(link =>
        link.left < selectionRect.right && link.right > selectionRect.left &&
        link.top < selectionRect.bottom && link.bottom > selectionRect.top
    ).map(link => link.element);

    const finalLinksToHighlight = getFilteredLinks(linksInSelectionBox);
    const finalLinksSet = new Set(finalLinksToHighlight);

    const newTrackedElements = new Set();
    const seenInSelection = new Set();
    let highlightedCount = 0;

    const { isCopyMode, settings, historySet, copyHistorySet } = selectionState;
    const relevantHistorySet = isCopyMode ? copyHistorySet : historySet;
    const useHistory = isCopyMode ? settings.useCopyHistory : settings.useHistory;
    const removeDuplicates = isCopyMode ? settings.checkDuplicatesOnCopy : settings.removeDuplicatesInSelection;
    
    for (const element of linksInSelectionBox) {
        newTrackedElements.add(element);
        const { href } = element;
        
        const isSeenInHistory = useHistory && relevantHistorySet.has(href);
        const isSeenInSelection = seenInSelection.has(href);
        const isLinkExcluded = (!isCopyMode || settings.applyExclusionsOnCopy) && isExcluded(href, element.href);
        
        let statusClass = '';
        if (finalLinksSet.has(element)) {
            statusClass = HIGHLIGHT_CLASS;
            highlightedCount++;
        } else if (isLinkExcluded || isSeenInHistory || (removeDuplicates && isSeenInSelection)) {
            statusClass = DUPLICATE_CLASS;
        } else if (!isCopyMode && highlightedCount >= settings.tabLimit) {
            statusClass = LIMIT_EXCEEDED_CLASS;
        }

        const { classList } = element;
        if (statusClass) {
            if (!classList.contains(statusClass)) {
                classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
                classList.add(statusClass);
            }
        } else if (classList.contains(HIGHLIGHT_CLASS) || classList.contains(DUPLICATE_CLASS) || classList.contains(LIMIT_EXCEEDED_CLASS)) {
            classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
        }
        
        if (removeDuplicates) seenInSelection.add(href);
    }

    for (const el of allTrackedElements) {
        if (!newTrackedElements.has(el)) {
            el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
        }
    }
    
    allTrackedElements = newTrackedElements;
    highlightedLinks = finalLinksToHighlight;
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

    allTrackedElements.forEach(el => 
        el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS)
    );
    
    document.body.classList.remove(PREPARE_ANIMATION_CLASS);
    delete document.body.dataset.linkOpenerHighlightStyle;
    document.body.style.cursor = 'default';

    Object.assign(selectionState, {
        isActive: false,
        isSelecting: false,
        isUpdateScheduled: false,
        settings: {}
    });
    
    cachedLinks = [];
    allTrackedElements.clear();
    highlightedLinks = [];

    chrome.runtime.sendMessage({ type: 'selectionDeactivated' }).catch(() => {});
};

const copyLinksToClipboard = (links) => {
    const text = links.join('\n');
    if (selectionState.settings.useCopyHistory && links.length > 0) {
        chrome.runtime.sendMessage({ type: "saveCopyHistory", urls: links });
    }

    if (!navigator.clipboard || !window.isSecureContext) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed; opacity:0;';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Area Links: Fallback copy failed.', err);
        }
        document.body.removeChild(textarea);
        return;
    }
    navigator.clipboard.writeText(text).catch(err => 
        console.error('Area Links: Clipboard write failed.', err)
    );
};

const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resetSelection();
    }
};

const runScheduledUpdate = () => {
    if (!selectionState.isSelecting) {
        selectionState.isUpdateScheduled = false;
        return;
    }
    updateSelectionBox();
    updateLinkHighlights();
    selectionState.isUpdateScheduled = false;
};

const scheduleUpdate = () => {
    if (!selectionState.isUpdateScheduled) {
        selectionState.isUpdateScheduled = true;
        requestAnimationFrame(runScheduledUpdate);
    }
};

const handleScroll = () => {
    if (selectionState.isSelecting) scheduleUpdate();
};

const handleMouseMove = (e) => {
    if (selectionState.isSelecting && (e.buttons & 1) === 0) {
        handleMouseUp(e);
        return;
    }
    selectionState.currentCoords = { x: e.pageX, y: e.pageY };
    scheduleUpdate();
};

const handleMouseUp = (e) => {
    if (e.button !== 0 || !selectionState.isSelecting) return;
    e.preventDefault();
    e.stopPropagation();

    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    if (rect.width > 5 || rect.height > 5) {
        const linksToProcess = highlightedLinks.map(el => el.href);
        if (linksToProcess.length > 0) {
            if (selectionState.isCopyMode) {
                copyLinksToClipboard(linksToProcess);
            } else {
                chrome.runtime.sendMessage({ type: "openLinks", urls: linksToProcess });
            }
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
    const links = document.querySelectorAll('a[href]');
    
    cachedLinks = Array.from(links).reduce((acc, link) => {
        if (isValidLink(link)) {
            const rect = link.getBoundingClientRect();
            acc.push({
                element: link,
                href: link.href,
                left: rect.left + scrollX,
                right: rect.right + scrollX,
                top: rect.top + scrollY,
                bottom: rect.bottom + scrollY
            });
        }
        return acc;
    }, []);
    
    selectionBox.className = selectionState.style;
    selectionBox.style.display = 'block';
    updateSelectionBox();
    
    selectionOverlay.addEventListener('mousemove', handleMouseMove, true);
    selectionOverlay.addEventListener('mouseup', handleMouseUp, true);
};

const initSelection = (settings) => {
    if (selectionState.isActive) resetSelection();
    
    Object.assign(selectionState, {
        isActive: true,
        isCopyMode: settings.type === "initiateSelectionCopy",
        style: settings.style,
        settings: settings,
        historySet: new Set(settings.linkHistory || []),
        copyHistorySet: new Set(settings.copyHistory || [])
    });
    
    document.body.dataset.linkOpenerHighlightStyle = settings.highlightStyle;
    document.body.classList.add(PREPARE_ANIMATION_CLASS);
    document.body.style.cursor = selectionState.isCopyMode ? customCopyCursor : 'crosshair';
    
    createSelectionElements();
    selectionOverlay.style.display = 'block';

    selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('scroll', handleScroll, { passive: true });
};

const messageHandlers = {
    initiateSelection: initSelection,
    initiateSelectionCopy: initSelection,
    resetSelection,
    ping: (req, sender, sendResponse) => sendResponse({ type: "pong" }),
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const handler = messageHandlers[request.type];
    if (handler) {
        handler(request, sender, sendResponse);
        if (request.type === 'initiateSelection' || request.type === 'initiateSelectionCopy') {
            sendResponse({ success: true });
        }
        return true;
    }
});

['popstate', 'hashchange', 'pagehide'].forEach(event => 
    window.addEventListener(event, resetSelection)
);