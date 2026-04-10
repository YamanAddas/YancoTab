
import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { Deck } from './cardEngine/Deck.js';
import { Card } from './cardEngine/Card.js';

export class SolitaireApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Solitaire',
            id: 'solitaire',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#064e3b'/><stop offset='1' stop-color='#22c55e'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><rect x='34' y='38' width='38' height='56' rx='10'/><rect x='56' y='34' width='38' height='56' rx='10'/><path d='M48 56l4-8 4 8'/><path d='M46 56h8'/><path d='M68 52l8 6-8 6'/><path d='M68 52v24'/><path d='M78 60c-3-5-9-4-9 2 0 6 9 11 9 11s9-5 9-11c0-6-6-7-9-2z' fill='rgba(255,255,255,0.92)' stroke='none'/></g></svg>`
        };

        this.deck = new Deck();
        this.tableau = [[], [], [], [], [], [], []]; // 7 piles
        this.foundation = [[], [], [], []]; // 4 suit piles
        this.stock = [];
        this.waste = [];

        this.draggedCards = null;
        this.sourcePile = null;
    
        this.uiSettings = { cardScale: 1, highContrast: false };
        this._pendingFit = false;

        this.history = [];
        this.maxHistory = 200;
        this._hintClearTimer = null;
}


    async init() {
        this.root = el('div', { class: 'app-window app-solitaire' });

        const link = el('link', { rel: 'stylesheet', href: 'css/solitaire.css' });
        this.root.appendChild(link);

        this.setupUI();

        this._roHandler = () => this.requestFitLayout();
        this.windowResizeHandler = () => this.requestFitLayout();
        this.visualViewportHandler = () => this.requestFitLayout();
        this.startNewGame();

        this.setupSettingsUI();

        // Dynamic Layout Engine
        // Keep layout resilient on older mobile browsers (iOS Chrome uses WebKit too)
        try { this.requestFitLayout(); } catch (e) {}

        // ResizeObserver is not guaranteed in every iOS WebView mode
        try {
            if (typeof ResizeObserver !== 'undefined') {
                this.resizeObserver = new ResizeObserver(this._roHandler);
                this.resizeObserver.observe(this.root);
            } else {
                this.resizeObserver = null;
            }
        } catch (e) {
            this.resizeObserver = null;
        }

        // Also listen to viewport/window resize as backup
        try { window.addEventListener('resize', this.windowResizeHandler); } catch (e) {}

        // visualViewport can exist but have partial event support on some iOS versions
        try {
            if (window.visualViewport && typeof window.visualViewport.addEventListener === 'function') {
                window.visualViewport.addEventListener('resize', this.visualViewportHandler);
                window.visualViewport.addEventListener('scroll', this.visualViewportHandler);
            }
        } catch (e) {}

    }

    destroy() {
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.windowResizeHandler) {
            window.removeEventListener('resize', this.windowResizeHandler);
        }
        try {
            if (this.visualViewportHandler && window.visualViewport && typeof window.visualViewport.removeEventListener === 'function') {
                window.visualViewport.removeEventListener('resize', this.visualViewportHandler);
                window.visualViewport.removeEventListener('scroll', this.visualViewportHandler);
            }
        } catch (e) {}
        super.destroy();
    }

    
requestFitLayout() {
    if (this._pendingFit) return;
    this._pendingFit = true;
    requestAnimationFrame(() => {
        this._pendingFit = false;
        this.fitLayout();
    });
}

setupSettingsUI() {
    this.settingsOverlay = el('div', { class: 'sol-settings-overlay hidden' });
    this.settingsPopover = el('div', { class: 'sol-settings-popover' }, [
        el('div', { class: 'sol-settings-title' }, 'Settings'),
        el('button', {
            class: 'sol-settings-item',
            onclick: () => this.toggleBiggerCards()
        }, 'Bigger cards'),
        el('button', {
            class: 'sol-settings-item',
            onclick: () => this.toggleHighContrast()
        }, 'High contrast cards'),
        el('button', {
            class: 'sol-settings-item secondary',
            onclick: () => this.toggleSettings(false)
        }, 'Close')
    ]);
    this.settingsOverlay.appendChild(this.settingsPopover);
    this.settingsOverlay.addEventListener('click', (e) => {
        if (e.target === this.settingsOverlay) this.toggleSettings(false);
    });
    this.root.appendChild(this.settingsOverlay);

    this.loadSettings();
    this.applySettings();
}

toggleSettings(force) {
    if (!this.settingsOverlay) return;
    const shouldOpen = typeof force === 'boolean' ? force : this.settingsOverlay.classList.contains('hidden');
    this.settingsOverlay.classList.toggle('hidden', !shouldOpen);
}

toggleBiggerCards() {
    this.uiSettings.cardScale = this.uiSettings.cardScale > 1 ? 1 : 1.15;
    this.saveSettings();
    this.applySettings();
    this.requestFitLayout();
}

toggleHighContrast() {
    this.uiSettings.highContrast = !this.uiSettings.highContrast;
    this.saveSettings();
    this.applySettings();
}

applySettings() {
    this.root.classList.toggle('cards-contrast', !!this.uiSettings.highContrast);
    this.root.classList.toggle('cards-bigger', this.uiSettings.cardScale > 1);
}

loadSettings() {
    try {
        const raw = localStorage.getItem('yancotab_card_settings');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
            if (typeof parsed.cardScale === 'number') this.uiSettings.cardScale = parsed.cardScale;
            if (typeof parsed.highContrast === 'boolean') this.uiSettings.highContrast = parsed.highContrast;
        }
    } catch (e) {}
}

saveSettings() {
    try {
        localStorage.setItem('yancotab_card_settings', JSON.stringify(this.uiSettings));
    } catch (e) {}
}

fitLayout() {
        const rect = this.root.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Available area for the board (minus header and safe areas)
        const headerH = 46;
        const padding = 10;
        const gap = 4;

        const availW = rect.width - (padding * 2);

        // CRITICAL: Account for safe areas at bottom
        // Add generous buffer (60px) to prevent card clipping
        const bottomBuffer = isPortrait ? 60 : 30;
        const availH = rect.height - headerH - (padding * 2) - bottomBuffer;

        // Width constraint: 7 columns + 6 gaps
        const maxW_byWidth = (availW - (6 * gap)) / 7;

        // Height constraint: We need to fit:
        // - Top row (1 card height)
        // - Gap (15px)
        // - Tableau with ~4-5 card overlaps visible
        // Total height budget: topCardH + gap + (3.5 * cardH for stacked cards)
        // More conservative: availH / 5.5 for portrait (was 4.5)
        const aspect = 1.45;
        const isPortrait = rect.height > rect.width;
        const heightDivisor = isPortrait ? 5.5 : 3.9; // More conservative in portrait
        const maxH_byHeight = availH / heightDivisor;
        const maxW_byHeight = maxH_byHeight / aspect;

        // Use the smaller (more constrained) dimension
        let cardW = Math.min(maxW_byWidth, maxW_byHeight);

        // Clamp to reasonable bounds
        cardW = Math.floor(Math.max(25, Math.min(cardW, 100)));
        const cardH = Math.floor(cardW * aspect);

        // Dynamic stack offset: 20-25% of card height
        this.stackOffset = Math.floor(cardH * 0.23);
        this.stackOffset = Math.max(15, Math.min(this.stackOffset, 35));

        // Update CSS Variables
        this.root.style.setProperty('--card-w', `${cardW}px`);
        this.root.style.setProperty('--card-h', `${cardH}px`);
        this.root.style.setProperty('--gap', `${gap}px`);

        // Store layout state for compression logic in render()
        this.layout = {
            availH: availH,
            cardH: cardH,
            headerH: headerH
        };

        // Update existing stack positions if game is active
        if (this.tableau && this.tableau[0].length >= 0) {
            this.renderTableauPositions();
        }
    }

    // New: specialized render update for positions only (smoother resize)
    renderTableauPositions() {
        const tCols = this.tableauEl.children;
        for (let i = 0; i < 7; i++) {
            const pile = this.tableau[i];
            const colEl = tCols[i];
            // Ensure DOM sync? Assuming render() built the DOM correctly.
            // Just update styles.
            if (colEl.children.length !== pile.length) {
                // Fallback if mismatch
                return;
            }

            Array.from(colEl.children).forEach((cardEl, index) => {
                cardEl.style.top = `${index * this.stackOffset}px`;
            });
        }
    }

    
_mkActionBtn(label, iconKey, onClick, opts = {}) {
    const compact = !!opts.compact;
    const icons = {
        new: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5a7 7 0 1 1-6.32 4H3l3.5-3.5L10 9H7.82A5 5 0 1 0 12 7V5Z"/></svg>',
        undo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7V4L2 9l5 5v-3h7a4 4 0 0 1 0 8h-1v2h1a6 6 0 0 0 0-12H7Z"/></svg>',
        hint: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21h6v-1a3 3 0 0 0-1-2.2c-.6-.6-1-1.3-1-2.1v-1.2a4.5 4.5 0 1 0-2 0v1.2c0 .8-.4 1.5-1 2.1A3 3 0 0 0 9 20v1Zm3-19a3 3 0 0 1 1.8 5.4c-.5.4-.8 1-.8 1.6V10h-2V9c0-.6-.3-1.2-.8-1.6A3 3 0 0 1 12 2Z"/></svg>',
        settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.5-2-3.5-2.4 1a8 8 0 0 0-1.7-1L15 2H9L8.7 6a8 8 0 0 0-1.7 1L4.6 6 2.6 9.5 4.6 11a7.6 7.6 0 0 0 0 2l-2 1.5 2 3.5 2.4-1a8 8 0 0 0 1.7 1L9 22h6l.3-4a8 8 0 0 0 1.7-1l2.4 1 2-3.5-2-1.5ZM12 15.5A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7Z"/></svg>',
        close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>',
    };
    const btn = el('button', {
        class: `sol-action-btn${compact ? ' is-compact' : ''}`,
        onclick: (e) => { e?.preventDefault?.(); onClick?.(); },
        'aria-label': label,
        title: label
    });
    btn.innerHTML = `${icons[iconKey] || ''}<span class="sol-action-label">${label}</span>`;
    return btn;
}

setupUI() {
        
// Header
const header = el('div', { class: 'sol-header' }, [
    el('div', { class: 'sol-title' }, 'Solitaire'),
    el('div', { class: 'sol-actions' }, [
        this._mkActionBtn('New Game', 'new', () => this.startNewGame()),
        this._mkActionBtn('Undo', 'undo', () => this.undo()),
        this._mkActionBtn('Hint', 'hint', () => this.showHint()),
        this._mkActionBtn('Settings', 'settings', () => this.toggleSettings(), { compact: true }),
        this._mkActionBtn('Close', 'close', () => this.close(), { compact: true }),
    ])
]);

        // Game Board
        this.board = el('div', { class: 'sol-board' });

        // Top Section (Stock, Waste, Foundation)
        this.topSection = el('div', { class: 'sol-top' });

        // Stock & Waste
        this.stockEl = el('div', { class: 'sol-pile stock', onclick: () => this.drawCard() });
        this.wasteEl = el('div', { class: 'sol-pile waste' });

        // Foundations
        this.foundationsEl = el('div', { class: 'sol-foundations' });
        for (let i = 0; i < 4; i++) {
            const pile = el('div', { class: 'sol-pile foundation', 'data-fid': i });
            this.setupDropZone(pile, 'foundation', i);
            this.foundationsEl.appendChild(pile);
        }

        this.topSection.append(this.stockEl, this.wasteEl, this.foundationsEl);

        // Tableau (7 columns)
        this.tableauEl = el('div', { class: 'sol-tableau' });
        for (let i = 0; i < 7; i++) {
            const col = el('div', { class: 'sol-column', 'data-col': i });
            this.setupDropZone(col, 'tableau', i);
            this.tableauEl.appendChild(col);
        }

        this.board.append(this.topSection, this.tableauEl);
        this.root.append(header, this.board);
    }

    startNewGame() {
        this.deck.reset();
        this.deck.shuffle();

        // Clear State
        this.tableau = [[], [], [], [], [], [], []];
        this.foundation = [[], [], [], []];
        this.stock = [];
        this.waste = [];

        

        this.history = [];
// Deal logic
        // Col 0: 1 card, Col 1: 2 cards... Col 6: 7 cards
        for (let i = 0; i < 7; i++) {
            for (let j = 0; j <= i; j++) {
                const card = this.deck.deal();
                if (j === i) card.flip(true); // Top card face up
                this.tableau[i].push(card);
            }
        }

        // Rest to Stock
        while (this.deck.remaining > 0) {
            this.stock.push(this.deck.deal());
        }

        this.render();
    }

    render() {
        if (!this.layout) return; // Wait for layout

        // Render Stock
        this.stockEl.innerHTML = '';
        if (this.stock.length > 0) {
            const back = el('div', { class: 'card-back-visual' });
            this.stockEl.appendChild(back);
        } else {
            this.stockEl.classList.add('empty');
        }

        // Render Waste
        this.wasteEl.innerHTML = '';
        if (this.waste.length > 0) {
            const card = this.waste[this.waste.length - 1];
            card.flip(true);
            this.setupDrag(card.element, card, 'waste');
            this.wasteEl.appendChild(card.element);
        }

        // Render Foundations
        const fPiles = this.foundationsEl.children;
        for (let i = 0; i < 4; i++) {
            fPiles[i].innerHTML = '';
            if (this.foundation[i].length > 0) {
                const card = this.foundation[i][this.foundation[i].length - 1];
                this.setupDrag(card.element, card, 'foundation', i);
                fPiles[i].appendChild(card.element);
            }
        }

        // Render Tableau with Compression Logic
        const tCols = this.tableauEl.children;
        const availableHeight = this.layout.availH;
        const cHeight = this.layout.cardH;
        const topRowHeight = cHeight + 15; // Top section + gap
        const tableauAvailH = availableHeight - topRowHeight;

        for (let i = 0; i < 7; i++) {
            tCols[i].innerHTML = '';
            const pile = this.tableau[i];

            if (pile.length === 0) continue;

            // Calculate dynamic offset with compression
            let offset = this.stackOffset || 20;

            // Check if cards would overflow
            const lastCardTop = (pile.length - 1) * offset;
            const lastCardBottom = lastCardTop + cHeight;

            if (lastCardBottom > tableauAvailH) {
                // Compress: calculate max offset to fit within bounds
                const maxOffset = (tableauAvailH - cHeight) / (pile.length - 1);
                offset = Math.max(8, Math.floor(maxOffset * 0.90)); // 90% safety margin
            }

            pile.forEach((card, index) => {
                // Use dynamic stack offset with compression
                card.element.style.top = `${index * offset}px`;
                card.element.style.zIndex = index;

                if (card.faceUp) {
                    this.setupDrag(card.element, card, 'tableau', i, index);
                }

                tCols[i].appendChild(card.element);
            });
        }
    }


drawCard() {
    // Stock -> Waste, or recycle Waste -> Stock when empty.
    if (this.stock.length === 0) {
        if (this.waste.length > 0) {
            const prevWaste = [...this.waste];
            const prevWasteStates = prevWaste.map(c => c.faceUp);

            this.stock = [...this.waste].reverse();
            this.waste = [];
            this.stock.forEach(c => c.flip(false));

            this._pushHistory({
                type: 'recycle',
                prevWaste,
                prevWasteStates,
            });
        }
    } else {
        const card = this.stock.pop();
        this.waste.push(card);
        this._pushHistory({ type: 'draw', card });
    }
    this.render();
}

    // Drag and Drop Logic
    setupDrag(el, card, source, pileIdx, cardIdx) {
        // Double Click / Tap to Auto-Move
        let lastTap = 0;
        const handleTap = (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                // Double Tap detected
                this.tryAutoMove(card, source, pileIdx, cardIdx);
            }
            lastTap = now;
        };

        el.addEventListener('touchend', handleTap);
        el.addEventListener('dblclick', (e) => this.tryAutoMove(card, source, pileIdx, cardIdx));

        el.onmousedown = (e) => this.dragStart(e, card, source, pileIdx, cardIdx);
        el.ontouchstart = (e) => this.dragStart(e, card, source, pileIdx, cardIdx);
    }

    tryAutoMove(card, source, pileIdx, cardIdx) {
        // Only top cards can move
        if (source === 'tableau') {
            const pile = this.tableau[pileIdx];
            if (cardIdx !== pile.length - 1) return; // Not top card
        }

        // Check Foundations
        for (let i = 0; i < 4; i++) {
            // Create a temp stack of 1
            const stack = [card];
            if (this.isValidMove(stack, 'foundation', i)) {
                this.moveCards(stack, source, pileIdx, cardIdx, 'foundation', i);
                this.render();
                return; // Moved
            }
        }
    }

    dragStart(e, card, source, pileIdx, cardIdx) {
        if (e.target.classList.contains('sol-btn')) return;
        // Do not prevent default immediately if we want scrolling, but for drag usually yes
        if (e.cancelable) e.preventDefault();

        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;

        // Calculate offset from the card's top-left to the mouse/touch point
        // This prevents the "jump" when dragging starts
        const cardRect = card.element.getBoundingClientRect();
        const offsetX = clientX - cardRect.left;
        const offsetY = clientY - cardRect.top;

        // Identify what is being dragged
        // If tableau, can drag stack
        let draggingStack = [card];
        if (source === 'tableau') {
            const pile = this.tableau[pileIdx];
            if (cardIdx < pile.length - 1) {
                draggingStack = pile.slice(cardIdx);
            }
        }

        this.dragContext = {
            card,
            stack: draggingStack,
            source,
            pileIdx,
            cardIdx,
            offsetX,
            offsetY,
            clone: this.createGhost(draggingStack)
        };

        // CRITICAL: Hide the original cards during drag
        draggingStack.forEach(c => {
            c.element.style.visibility = 'hidden';
            c.element.classList.add('is-dragging');
        });

        // Append ghost to BODY to avoid clipping
        this.dragContext.clone.style.zIndex = '9999';
        document.body.appendChild(this.dragContext.clone);

        this.updateGhostPos(clientX, clientY);

        // Attach global move/up
        document.onmousemove = (ev) => this.dragMove(ev);
        document.ontouchmove = (ev) => this.dragMove(ev);
        document.onmouseup = (ev) => this.dragEnd(ev);
        document.ontouchend = (ev) => this.dragEnd(ev);
    }

    createGhost(stack) {
        const wrapper = el('div', { class: 'drag-ghost' });

        // Get computed card dimensions from CSS variables
        const computedStyle = getComputedStyle(this.root);
        const cardW = computedStyle.getPropertyValue('--card-w').trim();
        const cardH = computedStyle.getPropertyValue('--card-h').trim();

        stack.forEach((c, i) => {
            const clone = c.element.cloneNode(true);
            clone.style.position = 'absolute';
            clone.style.left = '0px';
            clone.style.top = `${i * (this.stackOffset || 20)}px`;
            clone.style.width = cardW;
            clone.style.height = cardH;
            clone.style.transform = 'none';
            clone.style.visibility = 'visible'; // Ensure clone is visible
            clone.style.opacity = '0.95';
            clone.style.boxShadow = '0 10px 25px rgba(0,0,0,0.6)';
            wrapper.appendChild(clone);
        });
        return wrapper;
    }

    updateGhostPos(x, y) {
        if (this.dragContext && this.dragContext.clone) {
            const { offsetX, offsetY } = this.dragContext;
            this.dragContext.clone.style.left = `${x - offsetX}px`;
            this.dragContext.clone.style.top = `${y - offsetY}px`;
        }
    }

    dragMove(e) {
        if (!this.dragContext) return;
        // e.preventDefault(); // Prevent scrolling while dragging?
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        if (x && y) this.updateGhostPos(x, y);
    }

    dragEnd(e) {
        if (!this.dragContext) return;

        // Hit Test
        // Rough logic: find drop zone under mouse
        const x = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const y = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);

        document.onmousemove = null;
        document.ontouchmove = null;
        document.onmouseup = null;
        document.ontouchend = null;

        // Hide ghost to peek underneath
        this.dragContext.clone.style.display = 'none';
        const elUnder = document.elementFromPoint(x, y);
        this.dragContext.clone.remove();

        // CRITICAL: Restore visibility of original cards
        this.dragContext.stack.forEach(c => {
            c.element.style.visibility = 'visible';
            c.element.classList.remove('is-dragging');
        });

        const dropZone = (elUnder && elUnder.closest) ? elUnder.closest('.sol-column, .sol-foundation') : null;

        if (dropZone) {
            this.handleDrop(dropZone);
        }

        this.dragContext = null;
    }

    handleDrop(zone) {
        const { stack, source, pileIdx, cardIdx } = this.dragContext;
        const targetType = zone.classList.contains('sol-foundation') ? 'foundation' : 'tableau';
        const targetIdx = parseInt(zone.dataset.fid || zone.dataset.col);

        // Validate Move
        if (this.isValidMove(stack, targetType, targetIdx)) {
            // Execute Move
            this.moveCards(stack, source, pileIdx, cardIdx, targetType, targetIdx);
            this.render();
            // Check Win condition?
        }
    }

    isValidMove(stack, targetType, targetIdx) {
        const card = stack[0];

        if (targetType === 'foundation') {
            if (stack.length > 1) return false; // Can only move 1 to foundation
            const pile = this.foundation[targetIdx];
            if (pile.length === 0) {
                return card.rank === 1; // Must be Ace
            }
            const top = pile[pile.length - 1];
            return card.suit === top.suit && card.rank === top.rank + 1;
        }

        if (targetType === 'tableau') {
            const pile = this.tableau[targetIdx];
            if (pile.length === 0) {
                return card.rank === 13; // King only on empty
            }
            const top = pile[pile.length - 1];
            // Descending, Alternate Color
            return top.color !== card.color && top.rank === card.rank + 1;
        }
        return false;
    }


moveCards(stack, source, sourceIdx, cardIdx, targetType, targetIdx) {
    const cards = (targetType === 'foundation') ? [stack[0]] : [...stack];

    let flippedCard = null;
    let flippedPrev = null;

    // Remove from Source
    if (source === 'waste') {
        this.waste.pop();
    } else if (source === 'foundation') {
        this.foundation[sourceIdx].pop();
    } else if (source === 'tableau') {
        this.tableau[sourceIdx].splice(cardIdx, cards.length);
        // Reveal new top card
        if (this.tableau[sourceIdx].length > 0) {
            const top = this.tableau[sourceIdx][this.tableau[sourceIdx].length - 1];
            if (!top.faceUp) {
                flippedCard = top;
                flippedPrev = top.faceUp;
                top.flip(true);
            }
        }
    }

    // Add to Target
    if (targetType === 'foundation') {
        this.foundation[targetIdx].push(cards[0]);
    } else {
        this.tableau[targetIdx].push(...cards);
    }

    this._pushHistory({
        type: 'move',
        source, sourceIdx, cardIdx,
        targetType, targetIdx,
        cards,
        flippedCard,
        flippedPrev,
    });
}

_pushHistory(entry) {
    if (!entry) return;
    this.history.push(entry);
    if (this.history.length > this.maxHistory) this.history.shift();
}

undo() {
    const entry = this.history.pop();
    if (!entry) return;

    if (entry.type === 'draw') {
        // Move card back from waste to stock
        const c = this.waste.pop();
        if (c) this.stock.push(c);
        this.render();
        return;
    }

    if (entry.type === 'recycle') {
        // Restore waste (stock was empty at time of recycle)
        this.stock = [];
        this.waste = [...entry.prevWaste];
        this.waste.forEach((c, i) => c.flip(entry.prevWasteStates[i]));
        this.render();
        return;
    }

    if (entry.type === 'move') {
        const { source, sourceIdx, cardIdx, targetType, targetIdx, cards, flippedCard, flippedPrev } = entry;

        // Remove from target
        if (targetType === 'foundation') {
            this.foundation[targetIdx].pop();
        } else {
            this.tableau[targetIdx].splice(this.tableau[targetIdx].length - cards.length, cards.length);
        }

        // Restore flipped card (if we revealed one)
        if (flippedCard) {
            flippedCard.flip(flippedPrev);
        }

        // Add back to source
        if (source === 'waste') {
            this.waste.push(cards[0]);
        } else if (source === 'foundation') {
            this.foundation[sourceIdx].push(cards[0]);
        } else if (source === 'tableau') {
            this.tableau[sourceIdx].splice(cardIdx, 0, ...cards);
        }

        this.render();
        return;
    }
}

showHint() {
    this._clearHint();

    // Priority: waste -> foundation, waste -> tableau
    if (this.waste.length > 0) {
        const card = this.waste[this.waste.length - 1];
        const stack = [card];

        for (let f = 0; f < 4; f++) {
            if (this.isValidMove(stack, 'foundation', f)) {
                this._hintHighlight(card.element, this.foundationsEl.children[f]);
                return;
            }
        }

        for (let t = 0; t < 7; t++) {
            if (this.isValidMove(stack, 'tableau', t)) {
                this._hintHighlight(card.element, this.tableauEl.children[t]);
                return;
            }
        }
    }

    // Tableau top cards -> foundation/tableau
    for (let s = 0; s < 7; s++) {
        const pile = this.tableau[s];
        if (!pile.length) continue;

        // Only suggest moving the top face-up card (matches auto-move logic and is never "weird")
        const card = pile[pile.length - 1];
        if (!card.faceUp) continue;
        const stack = [card];

        for (let f = 0; f < 4; f++) {
            if (this.isValidMove(stack, 'foundation', f)) {
                this._hintHighlight(card.element, this.foundationsEl.children[f]);
                return;
            }
        }
        for (let t = 0; t < 7; t++) {
            if (t === s) continue;
            if (this.isValidMove(stack, 'tableau', t)) {
                this._hintHighlight(card.element, this.tableauEl.children[t]);
                return;
            }
        }
    }

    // No hint found: gentle pulse on stock (draw suggestion)
    this._hintPulse(this.stockEl);
}

_hintHighlight(cardEl, targetEl) {
    if (cardEl) cardEl.classList.add('sol-hint-src');
    if (targetEl) targetEl.classList.add('sol-hint-dst');
    this._hintClearTimer = setTimeout(() => this._clearHint(), 900);
}

_hintPulse(el) {
    if (!el) return;
    el.classList.add('sol-hint-pulse');
    this._hintClearTimer = setTimeout(() => this._clearHint(), 900);
}

_clearHint() {
    if (this._hintClearTimer) {
        clearTimeout(this._hintClearTimer);
        this._hintClearTimer = null;
    }
    try {
        this.root?.querySelectorAll('.sol-hint-src,.sol-hint-dst,.sol-hint-pulse').forEach(n => {
            n.classList.remove('sol-hint-src', 'sol-hint-dst', 'sol-hint-pulse');
        });
    } catch {}
}

    setupDropZone(el, type, index) {
        // Just metadata or styling hints on dragover
    }
}
