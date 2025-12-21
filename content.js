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
    highlightStyle: 'classic-yellow',
    startCoords: { x: 0, y: 0 },
    currentCoords: { x: 0, y: 0 },
    tabLimit: 15,
    checkDuplicatesOnCopy: true,
    applyExclusionsOnCopy: false,
    useHistory: false,
    useCopyHistory: false,
    removeDuplicatesInSelection: true,
    linkHistory: [],
    copyHistory: [],
    historySet: new Set(),
    copyHistorySet: new Set(),
    excludedDomains: [],
    excludedWords: [],
};

let selectionBox = null;
let selectionOverlay = null;
let highlightedElements = new Set();
let duplicateElements = new Set();
let limitExceededElements = new Set();
let cachedLinks = [];

function isValidLink(element) {
    const { href } = element;
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
        return false;
    }

    const style = window.getComputedStyle(element);
    if (style.visibility !== 'visible' || style.display === 'none' || style.pointerEvents === 'none') {
        return false;
    }
    
    if (element.textContent.trim() === '' && !element.querySelector('img, svg')) {
        return false;
    }

    return true;
}

function createSelectionElements() {
    if (!selectionOverlay) {
        selectionOverlay = document.createElement('div');
        selectionOverlay.id = 'link-opener-selection-overlay';
        selectionOverlay.style.display = 'none';
        document.body.appendChild(selectionOverlay);
    }
    if (!selectionBox) {
        selectionBox = document.createElement('div');
        selectionBox.id = 'link-opener-selection-box';
        selectionBox.style.display = 'none';
        document.body.appendChild(selectionBox);
    }
}

function getSelectionRectangle(start, end) {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const width = Math.abs(start.x - end.x);
    const height = Math.abs(start.y - end.y);
    return { x, y, width, height, left: x, top: y, right: x + width, bottom: y + height };
}

function updateSelectionBox() {
    if (!selectionBox) return;
    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    Object.assign(selectionBox.style, {
        left: `${rect.x - window.scrollX}px`,
        top: `${rect.y - window.scrollY}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
    });
}

function isExcluded(url) {
    if (!url) return false;
    try {
        const urlObj = new URL(url);
        const urlHostname = urlObj.hostname.toLowerCase();
        const decodedUrl = decodeURI(url).toLowerCase();

        // Проверка доменов с учетом Punycode
        if (selectionState.excludedDomains.some(domain => {
            try {
                // Конвертируем правило (например, "пример.рф") в Punycode ("xn--...") используя браузер
                const domainPuny = new URL('http://' + domain).hostname.toLowerCase();
                return urlHostname.includes(domainPuny);
            } catch {
                return urlHostname.includes(domain);
            }
        })) {
            return true;
        }

        // Проверка слов (с приведением к нижнему регистру)
        if (selectionState.excludedWords.some(word => decodedUrl.includes(word.toLowerCase()))) {
            return true;
        }
    } catch {
        return true;
    }
    return false;
}

function getIntersectingLinks(selectionRect) {
    const intersecting = [];
    for (const item of cachedLinks) {
        if (item.left < selectionRect.right &&
            item.right > selectionRect.left &&
            item.top < selectionRect.bottom &&
            item.bottom > selectionRect.top) {
            intersecting.push(item.element);
        }
    }
    return intersecting;
}

function updateLinkHighlights(docRect) {
    const intersectingLinks = getIntersectingLinks(docRect);
    const currentlyIntersecting = new Set(intersectingLinks);

    const toRemoveHighlight = new Set([...highlightedElements, ...duplicateElements, ...limitExceededElements].filter(el => !currentlyIntersecting.has(el)));
    toRemoveHighlight.forEach(el => {
        el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
    });

    const seenInSelection = new Set();
    const newHighlighted = new Set();
    const newDuplicates = new Set();
    const newLimitExceeded = new Set();

    intersectingLinks.forEach(element => {
        const { href } = element;
        const isSeenInSelection = seenInSelection.has(href);
        const isSeenInHistory = selectionState.useHistory && selectionState.historySet.has(href);
        const isSeenInCopyHistory = selectionState.useCopyHistory && selectionState.copyHistorySet.has(href);
        
        let isLinkExcluded = false;
        if (!selectionState.isCopyMode || selectionState.applyExclusionsOnCopy) {
            isLinkExcluded = isExcluded(href);
        }

        let shouldBeFiltered = false;

        if (selectionState.isCopyMode) {
             shouldBeFiltered = (selectionState.checkDuplicatesOnCopy && isSeenInSelection) || 
                                (selectionState.useCopyHistory && isSeenInCopyHistory) || 
                                isLinkExcluded;
        } else {
             shouldBeFiltered = (selectionState.removeDuplicatesInSelection && isSeenInSelection) || 
                                (selectionState.useHistory && isSeenInHistory) || 
                                isLinkExcluded;
        }

        const limitReached = !selectionState.isCopyMode && newHighlighted.size >= selectionState.tabLimit;

        if (shouldBeFiltered) {
            newDuplicates.add(element);
        } else if (limitReached) {
            newLimitExceeded.add(element);
        } else {
            newHighlighted.add(element);
            if (!selectionState.isCopyMode || selectionState.checkDuplicatesOnCopy || selectionState.removeDuplicatesInSelection) {
                seenInSelection.add(href);
            }
        }
    });

    newHighlighted.forEach(el => {
        el.classList.add(HIGHLIGHT_CLASS);
        el.classList.remove(DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
    });
    newDuplicates.forEach(el => {
        el.classList.add(DUPLICATE_CLASS);
        el.classList.remove(HIGHLIGHT_CLASS, LIMIT_EXCEEDED_CLASS);
    });
    newLimitExceeded.forEach(el => {
        el.classList.add(LIMIT_EXCEEDED_CLASS);
        el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS);
    });
    
    highlightedElements = newHighlighted;
    duplicateElements = newDuplicates;
    limitExceededElements = newLimitExceeded;
}

function clearHighlights() {
    [...highlightedElements, ...duplicateElements, ...limitExceededElements].forEach(el => {
        el.classList.remove(HIGHLIGHT_CLASS, DUPLICATE_CLASS, LIMIT_EXCEEDED_CLASS);
    });
    highlightedElements.clear();
    duplicateElements.clear();
    limitExceededElements.clear();
}

function resetSelection() {
    const wasActive = selectionState.isActive;

    if (selectionBox) {
        selectionBox.style.display = 'none';
    }
    if (selectionOverlay) {
        selectionOverlay.style.display = 'none';
    }
    clearHighlights();
    document.body.classList.remove(PREPARE_ANIMATION_CLASS);
    delete document.body.dataset.linkOpenerHighlightStyle;
    document.body.style.cursor = 'default';
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('scroll', handleScroll, true);

    Object.assign(selectionState, {
        isActive: false,
        isSelecting: false,
        isUpdateScheduled: false,
        startCoords: { x: 0, y: 0 },
        currentCoords: { x: 0, y: 0 },
        tabLimit: 15,
        historySet: new Set(),
        copyHistorySet: new Set(),
        excludedDomains: [],
        excludedWords: [],
    });
    
    cachedLinks = [];
    highlightedElements.clear();
    duplicateElements.clear();
    limitExceededElements.clear();

    if (wasActive) {
        chrome.runtime.sendMessage({ type: 'selectionDeactivated' });
    }
}

function copyLinksToClipboard(links) {
    const text = links.join('\n');
    if (selectionState.useCopyHistory && links.length > 0) {
        chrome.runtime.sendMessage({ type: "saveCopyHistory", urls: links });
    }

    if (!navigator.clipboard || !window.isSecureContext) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('Area Links: Fallback copy method failed.', err);
        }
        document.body.removeChild(textarea);
        return;
    }
    navigator.clipboard.writeText(text).catch(err => {
        if (err && err.name === 'NotAllowedError') {
            alert(chrome.i18n.getMessage('copyFailedPermissionError'));
        } else {
            console.error('Area Links: Could not copy text.', err);
        }
    });
}

function handleKeyDown(e) {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        resetSelection();
    }
}

function runScheduledUpdate() {
    if (!selectionState.isSelecting) {
        selectionState.isUpdateScheduled = false;
        return;
    }
    updateSelectionBox();
    const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    updateLinkHighlights(rect);
    selectionState.isUpdateScheduled = false;
}

function scheduleUpdate() {
    if (!selectionState.isUpdateScheduled) {
        selectionState.isUpdateScheduled = true;
        requestAnimationFrame(runScheduledUpdate);
    }
}

function handleScroll() {
    if (!selectionState.isSelecting) return;
    scheduleUpdate();
}

function handleMouseMove(e) {
    if (selectionState.isSelecting && (e.buttons & 1) === 0) {
        handleMouseUp({
            button: 0,
            preventDefault: () => {},
            stopPropagation: () => {}
        });
        return;
    }

    selectionState.currentCoords = { x: e.pageX, y: e.pageY };
    scheduleUpdate();
}

function handleMouseUp(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const selectionRect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
    if (selectionRect.width > 5 || selectionRect.height > 5) {
        let links = Array.from(highlightedElements, el => el.href);
        if (links.length > 0) {
            if (selectionState.isCopyMode) {
                if (selectionState.checkDuplicatesOnCopy) {
                    links = [...new Set(links)];
                }
                copyLinksToClipboard(links);
            } else {
                chrome.runtime.sendMessage({ type: "openLinks", urls: links });
            }
        }
    }
    resetSelection();
}

function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    
    selectionState.isSelecting = true;
    selectionState.startCoords = { x: e.pageX, y: e.pageY };
    selectionState.currentCoords = { x: e.pageX, y: e.pageY };
    
    cachedLinks = [];
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const allLinks = document.querySelectorAll('a[href]');
    for (const link of allLinks) {
        if (isValidLink(link)) {
            const rect = link.getBoundingClientRect();
            cachedLinks.push({
                element: link,
                left: rect.left + scrollX,
                right: rect.right + scrollX,
                top: rect.top + scrollY,
                bottom: rect.bottom + scrollY
            });
        }
    }
    
    selectionBox.className = selectionState.style;
    selectionBox.style.display = 'block';
    updateSelectionBox();
    
    selectionOverlay.addEventListener('mousemove', handleMouseMove, true);
    selectionOverlay.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('scroll', handleScroll, true);
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === "ping") {
        sendResponse({ type: "pong" });
        return true;
    }

    if (request.type === "resetSelection") {
        if (selectionState.isActive) {
            resetSelection();
        }
        return false;
    }

    const isInitiate = request.type === "initiateSelection" || request.type === "initiateSelectionCopy";
    if (!isInitiate) {
        return true;
    }
    if (selectionState.isActive) {
        resetSelection();
    }
    
    selectionState.isCopyMode = request.type === "initiateSelectionCopy";
    selectionState.tabLimit = request.tabLimit;
    selectionState.checkDuplicatesOnCopy = request.checkDuplicatesOnCopy;
    selectionState.applyExclusionsOnCopy = request.applyExclusionsOnCopy;
    selectionState.useHistory = request.useHistory;
    selectionState.useCopyHistory = request.useCopyHistory;
    selectionState.removeDuplicatesInSelection = request.removeDuplicatesInSelection;
    selectionState.linkHistory = request.linkHistory || [];
    selectionState.copyHistory = request.copyHistory || [];
    selectionState.historySet = new Set(selectionState.linkHistory);
    selectionState.copyHistorySet = new Set(selectionState.copyHistory);
    selectionState.highlightStyle = request.highlightStyle;
    selectionState.excludedDomains = request.excludedDomains || [];
    selectionState.excludedWords = request.excludedWords || [];
    
    document.body.dataset.linkOpenerHighlightStyle = selectionState.highlightStyle;
    document.body.classList.add(PREPARE_ANIMATION_CLASS);
    document.body.style.cursor = selectionState.isCopyMode ? customCopyCursor : 'crosshair';
    
    selectionState.isActive = true;
    selectionState.style = request.style;
    
    createSelectionElements();
    selectionOverlay.style.display = 'block';

    selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    sendResponse({ success: true, message: "Selection initiated" });
    return true;
});

window.addEventListener('popstate', resetSelection);
window.addEventListener('hashchange', resetSelection);
window.addEventListener('pagehide', resetSelection);