const svgCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><line x1="16" y1="0" x2="16" y2="32" stroke="black" stroke-width="1.5"/><line x1="0" y1="16" x2="32" y2="16" stroke="black" stroke-width="1.5"/><rect x="20" y="20" width="10" height="10" fill="white" /><line x1="25" y1="21" x2="25" y2="29" stroke="black" stroke-width="2"/><line x1="21" y1="25" x2="29" y2="25" stroke="black" stroke-width="2"/></svg>`;
const customCopyCursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgCursor)}') 16 16, copy`;
const HIGHLIGHT_CLASS = 'link-opener-highlighted-link';
const PREPARE_ANIMATION_CLASS = 'link-opener-prepare-animation';

const selectionState = {
    isActive: false,
    isSelecting: false,
    isCopyMode: false,
    isUpdateScheduled: false,
    hasScannedLinks: false,
    style: 'classic-blue',
    highlightStyle: 'classic-yellow',
    startCoords: { x: 0, y: 0 },
    currentCoords: { x: 0, y: 0 },
    checkDuplicatesOnCopy: true,
    useHistory: false,
    linkHistory: [],
    historySet: new Set(),
};

let selectionBox = null;
let selectionOverlay = null;
let highlightedElements = new Set();
let linkDataCache = [];

function createSelectionElements() {
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
        display: 'block',
    });
}

function getIntersectingLinkData(docRect) {
    return linkDataCache.filter(linkData =>
        linkData.docRect.left < docRect.right &&
        linkData.docRect.right > docRect.left &&
        linkData.docRect.top < docRect.bottom &&
        linkData.docRect.bottom > docRect.top
    );
}

function updateLinkHighlights(docRect) {
    const intersectingData = getIntersectingLinkData(docRect);
    const newHighlightedElements = new Set();
    const seenInSelection = new Set();
    intersectingData.forEach(({ element, href }) => {
        const isSeenInSelection = seenInSelection.has(href);
        const isSeenInHistory = selectionState.useHistory && selectionState.historySet.has(href);

        const shouldBeFiltered = selectionState.isCopyMode
            ? selectionState.checkDuplicatesOnCopy && isSeenInSelection
            : isSeenInSelection || isSeenInHistory;

        if (!shouldBeFiltered) {
            newHighlightedElements.add(element);
            if (!selectionState.isCopyMode || selectionState.checkDuplicatesOnCopy) {
                seenInSelection.add(href);
            }
        }
    });
    highlightedElements.forEach(el => {
        if (!newHighlightedElements.has(el)) {
            el.classList.remove(HIGHLIGHT_CLASS);
        }
    });
    newHighlightedElements.forEach(el => {
        if (!highlightedElements.has(el)) {
            el.classList.add(HIGHLIGHT_CLASS);
        }
    });
    highlightedElements = newHighlightedElements;
}

function clearHighlights() {
    highlightedElements.forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
    highlightedElements.clear();
}

function resetSelection() {
    if (selectionBox) {
        selectionBox.remove();
        selectionBox = null;
    }
    if (selectionOverlay) {
        selectionOverlay.remove();
        selectionOverlay = null;
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
        hasScannedLinks: false,
        isUpdateScheduled: false,
        startCoords: { x: 0, y: 0 },
        currentCoords: { x: 0, y: 0 },
        historySet: new Set(),
    });
    
    linkDataCache = [];
    highlightedElements = new Set();
}

function copyLinksToClipboard(links) {
    const text = links.join('\n');
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
        console.error('Area Links: Could not copy text.', err);
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
    if (selectionState.hasScannedLinks) {
        const rect = getSelectionRectangle(selectionState.startCoords, selectionState.currentCoords);
        updateLinkHighlights(rect);
    }
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

function populateLinkDataCache() {
    const viewportTop = window.scrollY;
    const viewportBottom = viewportTop + window.innerHeight;

    linkDataCache = Array.from(document.querySelectorAll('a[href]')).map(link => {
        const { href } = link;
        if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;

        const rect = link.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return null;
        
        const elementTop = rect.top + viewportTop;
        const elementBottom = rect.bottom + viewportTop;
        if (elementBottom < viewportTop - 200 || elementTop > viewportBottom + 200) {
            return null;
        }

        return {
            element: link,
            href: href,
            docRect: {
                top: elementTop,
                left: rect.left + window.scrollX,
                right: rect.left + window.scrollX + rect.width,
                bottom: elementBottom,
            }
        };
    }).filter(Boolean);
    selectionState.hasScannedLinks = true;
}

function handleMouseMove(e) {
    if (!selectionState.hasScannedLinks) {
        populateLinkDataCache();
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
    
    createSelectionElements();
    selectionBox.className = selectionState.style;
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
    const isInitiate = request.type === "initiateSelection" || request.type === "initiateSelectionCopy";
    if (!isInitiate) {
        return true;
    }
    if (selectionState.isActive) {
        resetSelection();
    }
    
    const isCopyMode = request.type === "initiateSelectionCopy";
    selectionState.isCopyMode = isCopyMode;
    selectionState.checkDuplicatesOnCopy = request.checkDuplicatesOnCopy;
    selectionState.useHistory = request.useHistory;
    selectionState.linkHistory = request.linkHistory || [];
    selectionState.historySet = new Set(selectionState.linkHistory);
    selectionState.highlightStyle = request.highlightStyle;
    
    document.body.dataset.linkOpenerHighlightStyle = selectionState.highlightStyle;
    document.body.classList.add(PREPARE_ANIMATION_CLASS);
    document.body.style.cursor = isCopyMode ? customCopyCursor : 'crosshair';
    
    selectionState.isActive = true;
    selectionState.style = request.style;
    
    createSelectionElements();
    selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    sendResponse({ success: true, message: "Selection initiated" });
    return true;
});