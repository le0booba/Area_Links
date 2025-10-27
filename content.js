const svgCursor = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><line x1="16" y1="0" x2="16" y2="32" stroke="black" stroke-width="1.5"/><line x1="0" y1="16" x2="32" y2="16" stroke="black" stroke-width="1.5"/><rect x="20" y="20" width="10" height="10" fill="white" /><line x1="25" y1="21" x2="25" y2="29" stroke="black" stroke-width="2"/><line x1="21" y1="25" x2="29" y2="25" stroke="black" stroke-width="2"/></svg>`;
const customCopyCursor = `url('data:image/svg+xml;utf8,${encodeURIComponent(svgCursor)}') 16 16, copy`;
const HIGHLIGHT_CLASS = 'link-opener-highlighted-link';
const PREPARE_ANIMATION_CLASS = 'link-opener-prepare-animation';

const selectionState = {
    isActive: false,
    isSelecting: false,
    isCopyMode: false,
    isUpdateScheduled: false,
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
let linkObserver = null;
let visibleLinks = new Set();
let selectionCandidateLinks = new Set();

function getClientRectsForLink(element) {
    // Используем getBoundingClientRect вместо getClientRects для более точного определения границ
    // getClientRects возвращает множество rect'ов для разбитых inline-элементов,
    // что вызывает ложные срабатывания на сложных сайтах (YouTube, Twitch)
    const rect = element.getBoundingClientRect();
    return [rect]; // Возвращаем массив для совместимости с существующим кодом
}

function handleLinkIntersection(entries) {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            visibleLinks.add(entry.target);
        } else {
            visibleLinks.delete(entry.target);
        }
    });
}

function initializeObserver() {
    if (!linkObserver) {
        linkObserver = new IntersectionObserver(handleLinkIntersection, {
            rootMargin: '200px 0px 200px 0px'
        });
    }
}

function findAllLinks(rootNode, links) {
    const newLinks = links || [];

    const linkElements = rootNode.querySelectorAll('a[href], [role="link"]');
    linkElements.forEach(el => {
        let href = el.href;
        if (el.matches('[role="link"]') && !href) {
            const nestedLink = el.querySelector('a[href]');
            href = nestedLink ? nestedLink.href : null;
        }
        if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
            if (!el.href) el.href = href;
            newLinks.push(el);
        }
    });

    const allElements = rootNode.querySelectorAll('*');
    allElements.forEach(element => {
        if (element.shadowRoot) {
            findAllLinks(element.shadowRoot, newLinks);
        }
    });

    return newLinks;
}


function startLinkObserver() {
    initializeObserver();
    linkObserver.disconnect();
    visibleLinks.clear();
    
    const allLinksOnPage = findAllLinks(document.body);
    allLinksOnPage.forEach(link => {
        linkObserver.observe(link);
    });
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

function getIntersectingLinks(selectionRect) {
    visibleLinks.forEach(link => selectionCandidateLinks.add(link));
    
    const intersecting = [];
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    for (const link of selectionCandidateLinks) {
        const clientRects = getClientRectsForLink(link);
        for (let i = 0; i < clientRects.length; i++) {
            const rect = clientRects[i];
            const linkDocRect = {
                left: rect.left + scrollX,
                right: rect.right + scrollX,
                top: rect.top + scrollY,
                bottom: rect.bottom + scrollY,
            };

            if (linkDocRect.left < selectionRect.right &&
                linkDocRect.right > selectionRect.left &&
                linkDocRect.top < selectionRect.bottom &&
                linkDocRect.bottom > selectionRect.top) {
                intersecting.push(link);
                break;
            }
        }
    }
    return intersecting;
}

function updateLinkHighlights(docRect) {
    const intersectingLinks = getIntersectingLinks(docRect);
    const newHighlightedElements = new Set();
    const seenInSelection = new Set();

    intersectingLinks.forEach(element => {
        const { href } = element;
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
    const wasActive = selectionState.isActive;

    if (linkObserver) {
        linkObserver.disconnect();
    }
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
        historySet: new Set(),
    });
    
    visibleLinks.clear();
    highlightedElements.clear();
    selectionCandidateLinks.clear();

    if (wasActive) {
        chrome.runtime.sendMessage({ type: 'selectionDeactivated' });
    }
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
    
    selectionCandidateLinks.clear();
    
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
    selectionState.checkDuplicatesOnCopy = request.checkDuplicatesOnCopy;
    selectionState.useHistory = request.useHistory;
    selectionState.linkHistory = request.linkHistory || [];
    selectionState.historySet = new Set(selectionState.linkHistory);
    selectionState.highlightStyle = request.highlightStyle;
    
    document.body.dataset.linkOpenerHighlightStyle = selectionState.highlightStyle;
    document.body.classList.add(PREPARE_ANIMATION_CLASS);
    document.body.style.cursor = selectionState.isCopyMode ? customCopyCursor : 'crosshair';
    
    selectionState.isActive = true;
    selectionState.style = request.style;
    
    startLinkObserver();
    createSelectionElements();
    selectionOverlay.style.display = 'block';

    selectionOverlay.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    
    sendResponse({ success: true, message: "Selection initiated" });
    return true;
});