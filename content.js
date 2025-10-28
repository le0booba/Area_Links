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

function getClientRectsForLink(element) {
    return element.getClientRects();
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

function isElementActuallyVisible(element) {
    const style = window.getComputedStyle(element);
    if (style.opacity === '0' || style.visibility === 'hidden' || style.display === 'none') {
        return false;
    }
    return true;
}

function getVisibleContentRect(element) {
    const elementRect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const hasOverflowHidden = style.overflow === 'hidden' || style.overflowX === 'hidden' || style.overflowY === 'hidden';
    
    const range = document.createRange();
    const textNodes = [];
    
    function collectTextNodes(node) {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
            textNodes.push(node);
        } else {
            for (let child of node.childNodes) {
                collectTextNodes(child);
            }
        }
    }
    
    collectTextNodes(element);
    
    function isRectWithinBounds(rect) {
        if (!hasOverflowHidden) {
            const margin = 5;
            return (
                rect.left >= elementRect.left - margin &&
                rect.right <= elementRect.right + margin &&
                rect.top >= elementRect.top - margin &&
                rect.bottom <= elementRect.bottom + margin
            );
        }
        return true;
    }
    
    if (textNodes.length === 0) {
        const children = element.querySelectorAll('img, svg, [role="img"], video');
        if (children.length > 0) {
            const rects = [];
            children.forEach(child => {
                const childStyle = window.getComputedStyle(child);
                if (childStyle.position === 'absolute' || childStyle.position === 'fixed') {
                    return;
                }
                const rect = child.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0 && isRectWithinBounds(rect)) {
                    rects.push(rect);
                }
            });
            return rects.length > 0 ? rects : null;
        }
        return null;
    }
    
    const rects = [];
    textNodes.forEach(textNode => {
        try {
            const parent = textNode.parentElement;
            if (parent) {
                const parentStyle = window.getComputedStyle(parent);
                if (parentStyle.position === 'absolute' || parentStyle.position === 'fixed') {
                    const parentRect = parent.getBoundingClientRect();
                    if (!isRectWithinBounds(parentRect)) {
                        return;
                    }
                }
            }
            
            range.selectNodeContents(textNode);
            const textRects = range.getClientRects();
            for (let i = 0; i < textRects.length; i++) {
                const rect = textRects[i];
                if (rect.width > 0 && rect.height > 0 && isRectWithinBounds(rect)) {
                    rects.push(rect);
                }
            }
        } catch (e) {}
    });
    
    return rects.length > 0 ? rects : null;
}

function getIntersectingLinks(selectionRect) {
    const intersecting = [];
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const viewport = {
        left: 0,
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight
    };

    for (const link of visibleLinks) {
        if (!isElementActuallyVisible(link)) continue;
        
        const contentRects = getVisibleContentRect(link);
        const rectsToCheck = contentRects || getClientRectsForLink(link);
        
        if (!rectsToCheck || rectsToCheck.length === 0) continue;
        
        for (let i = 0; i < rectsToCheck.length; i++) {
            const rect = rectsToCheck[i];
            if (rect.width <= 0 || rect.height <= 0) continue;

            const isVisibleInViewport =
                rect.right > viewport.left &&
                rect.left < viewport.right &&
                rect.bottom > viewport.top &&
                rect.top < viewport.bottom;
            
            if (!isVisibleInViewport) {
                continue;
            }

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

function updateLinkHighlights(selectionRect) {
    const intersectingLinks = getIntersectingLinks(selectionRect);
    const newHighlighted = new Set(intersectingLinks);

    highlightedElements.forEach(el => {
        if (!newHighlighted.has(el)) {
            el.classList.remove(HIGHLIGHT_CLASS);
            highlightedElements.delete(el);
        }
    });

    newHighlighted.forEach(el => {
        if (!highlightedElements.has(el)) {
            el.classList.add(HIGHLIGHT_CLASS);
            highlightedElements.add(el);
        }
    });
}

function resetSelection(wasActive = selectionState.isActive) {
    if (selectionBox) {
        selectionBox.style.display = 'none';
    }
    if (selectionOverlay) {
        selectionOverlay.style.display = 'none';
        selectionOverlay.removeEventListener('mousedown', handleMouseDown, true);
        selectionOverlay.removeEventListener('mousemove', handleMouseMove, true);
        selectionOverlay.removeEventListener('mouseup', handleMouseUp, true);
    }
    document.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('scroll', handleScroll, true);
    document.removeEventListener('visibilitychange', handleVisibilityChange, true);
    document.body.style.cursor = '';

    Object.assign(selectionState, {
        isActive: false,
        isSelecting: false,
        isUpdateScheduled: false,
        startCoords: { x: 0, y: 0 },
        currentCoords: { x: 0, y: 0 },
        historySet: new Set(),
    });
    
    highlightedElements.forEach(el => el.classList.remove(HIGHLIGHT_CLASS));
    highlightedElements.clear();
    
    visibleLinks.clear();

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

function handleVisibilityChange() {
    if (document.hidden && selectionState.isActive) {
        resetSelection();
    }
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
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    
    sendResponse({ success: true, message: "Selection initiated" });
    return true;
});