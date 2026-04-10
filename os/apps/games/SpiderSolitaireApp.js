import { App } from '../../core/App.js';
import { el } from '../../utils/dom.js';
import { Deck } from './cardEngine/Deck.js';

export class SpiderSolitaireApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = {
            name: 'Spider Solitaire',
            id: 'spider-solitaire',
            icon: `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#111827'/><stop offset='1' stop-color='#ef4444'/></linearGradient></defs><rect x='12' y='12' width='104' height='104' rx='28' fill='url(#g)'/><rect x='14' y='14' width='100' height='100' rx='26' fill='rgba(255,255,255,0.06)'/><g fill='none' stroke='rgba(255,255,255,0.92)' stroke-width='7' stroke-linecap='round' stroke-linejoin='round'><circle cx='64' cy='70' r='14'/><circle cx='64' cy='52' r='8'/><path d='M50 64l-14-8M50 70h-16M50 76l-14 8'/><path d='M78 64l14-8M78 70h16M78 76l14 8'/></g></svg>`
        };

        // 2 Decks for Spider
        this.deck1 = new Deck();
        this.deck2 = new Deck();
        this.cards = [];

        this.tableau = Array(10).fill().map(() => []); // 10 piles
        this.stock = [];
        this.completedSuits = 0; // Win if 8

        this.draggedCards = null;
    
        this.uiSettings = { cardScale: 1, highContrast: false };
        this._pendingFit = false;
}

    async init() {
        this.root = el('div', { class: 'app-window app-solitaire app-spider' });

        // Reuse Solitaire styles + spider overrides
        const link = el('link', { rel: 'stylesheet', href: 'css/solitaire.css' });
        this.root.appendChild(link);

        this.setupUI();

        this._roHandler = () => this.requestFitLayout();
        this.windowResizeHandler = () => this.requestFitLayout();
        this.visualViewportHandler = () => this.requestFitLayout();
        this.fitLayout();
        this.startNewGame();

        this.setupSettingsUI();

                // Layout wiring: keep resilient across iOS/Android browsers
        try { this.requestFitLayout(); } catch (e) {}

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

        try { window.addEventListener('resize', this.windowResizeHandler); } catch (e) {}

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
    this.uiSettings.cardScale = this.uiSettings.cardScale > 1 ? 1 : 1.12;
    this.saveSettings();
    this.applySettings();
    this.requestFitLayout();
    this.render();
}

toggleHighContrast() {
    this.uiSettings.highContrast = !this.uiSettings.highContrast;
    this.saveSettings();
    this.applySettings();
    this.render();
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

        const isLandscape = rect.width > rect.height;
        if (isLandscape) {
            this.root.classList.add('landscape');
        } else {
            this.root.classList.remove('landscape');
        }

        // Modern Layout Constants
        const headerH = 46;

        // CRITICAL: Reserve generous space for footer + safe areas in portrait
        // Footer is now 110px base + env(safe-area-inset-bottom)
        // We add extra buffer to ensure cards never touch footer
        const footerH = isLandscape ? 0 : 150; // Increased from 110 to 150 for safety
        const sidebarW = isLandscape ? 140 : 0; // Match CSS width

        const padding = 10;
        const gap = isLandscape ? 4 : 2;

        // Safe Available Width
        const availW = rect.width - sidebarW - (padding * 2);

        // Safe Available Height (Critical for portrait cut-off)
        // Increased buffer from 20px to 50px for extra safety
        const availH = rect.height - headerH - footerH - padding - 50;

        // 10 cols + 9 gaps
        const maxW_byWidth = (availW - (9 * gap)) / 10;

        // Height: Top + Tableau depth
        const aspect = 1.45;

        // We want at least a few cards visible, but let the width drive mainly.
        let cardW = maxW_byWidth;

        // Apply user scale (layout-only)
        cardW *= ((this.uiSettings && this.uiSettings.cardScale) || 1);

        // Clamp
        cardW = Math.floor(Math.max(26, Math.min(cardW, isLandscape ? 85 : 65)));
        const cardH = Math.floor(cardW * aspect);

        // Base stack offset
        this.baseStackOffset = Math.floor(cardH * 0.24);
        this.baseStackOffset = Math.max(14, Math.min(this.baseStackOffset, 28));

        this.root.style.setProperty('--card-w', `${cardW}px`);
        this.root.style.setProperty('--card-h', `${cardH}px`);
        this.root.style.setProperty('--gap', `${gap}px`);

        // Update layout state
        this.layout = {
            availH: availH, // This is the safe height used for squashing
            cardH: cardH,
            headerH: headerH
        };

        if (this.tableau && this.tableau[0].length >= 0) this.render();
    }

    setupUI() {
        // Modern Header
        const header = el('div', { class: 'sol-header' }, [
            el('div', { class: 'sol-title' }, 'Spider'),
            el('div', { class: 'sol-actions' }, [
                el('button', { class: 'sol-icon-btn', onclick: () => this.showOptions() }, '⚙️'),
                el('button', { class: 'sol-icon-btn', onclick: () => this.close() }, '×')
            ])
        ]);

        this.board = el('div', { class: 'sol-board' });

        // Tableau Container
        this.tableauEl = el('div', { class: 'sol-tableau spider-tableau' });
        for (let i = 0; i < 10; i++) {
            const col = el('div', { class: 'sol-column', 'data-col': i });
            this.tableauEl.appendChild(col);
        }

        // Bottom Dock (Floating Glass)
        this.footer = el('div', { class: 'sol-footer' });

        // Left: Completed Piles
        this.completedEl = el('div', { class: 'sol-completed-area' });

        // Center: Info (Moves/Score)
        this.infoEl = el('div', { class: 'sol-info' }, [
            el('span', {}, 'Moves: 0')
        ]);

        // Right: Stock
        this.stockEl = el('div', { class: 'sol-stock-area', onclick: () => this.dealRow() });
        // Stock visual
        this.stockCountEl = el('div', { class: 'stock-counter' }, '50');
        this.stockEl.appendChild(this.stockCountEl);

        this.footer.append(this.completedEl, this.infoEl, this.stockEl);

        this.board.append(this.tableauEl); // Tableau takes main space
        this.root.append(header, this.board, this.footer); // Header Top, Board Middle, Footer Bottom
    }

    startNewGame() {
        // Reset State
        this.stock = [];
        this.completedSuits = 0;
        this.cards = [];

        // Difficulty Logic (1, 2, or 4 Suits)
        // Standard Spider is 104 cards (2 decks)
        // 1 Suit: 8 sets of Spades (13 * 8 = 104)
        // 2 Suits: 4 sets of Spades, 4 sets of Hearts
        // 4 Suits: 2 full decks

        const difficulty = this.difficulty || 1; // Default to 1 suit (Easy/Modern standard)

        let pool = [];
        const ranks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

        const createSuite = (suit, count) => {
            for (let i = 0; i < count; i++) {
                ranks.forEach(r => {
                    // Create card manually since Deck class generates full deck
                    // We need specific suits
                    // Reusing Card class? We can just use deck.cards[i] and mutate?
                    // Safer to instantiate new Card if possible, or filter.
                    // Let's rely on Deck class to give us base cards and we'll "paint" them
                    // Actually, Deck class likely has fixed suits.
                    // Hack: Create 2 full decks, then mutate suits based on difficulty.
                });
            }
        };

        // Easier approach: Get 2 full decks, then override suits
        this.deck1.reset();
        this.deck2.reset();
        let rawCards = [...this.deck1.cards, ...this.deck2.cards]; // 104 cards

        // Sort by rank to easily assign suits? No, just map them 
        if (difficulty === 1) {
            // All Spades
            rawCards.forEach(c => { c.suit = 'spades'; c.color = 'black'; });
        } else if (difficulty === 2) {
            // Half Spades, Half Hearts
            rawCards.forEach((c, i) => {
                c.suit = (i < 52) ? 'spades' : 'hearts';
                c.color = (i < 52) ? 'black' : 'red';
            });
        } else {
            // 4 Suits - Leave as is (Standard 2 decks)
        }

        this.cards = rawCards;

        // Shuffle
        this.shuffle(this.cards);

        this.tableau = Array(10).fill().map(() => []);

        // Deal: 6,6,6,6, 5,5,5,5,5,5
        let dealIdx = 0;
        for (let col = 0; col < 10; col++) {
            const count = col < 4 ? 6 : 5;
            for (let i = 0; i < count; i++) {
                const card = this.cards[dealIdx++];
                if (i === count - 1) card.flip(true);
                else card.flip(false);
                this.tableau[col].push(card);
            }
        }

        // Rest to Stock
        while (dealIdx < this.cards.length) {
            const c = this.cards[dealIdx++];
            c.flip(false);
            this.stock.push(c);
        }

        this.render();
    }

    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    dealRow() {
        if (this.stock.length === 0) return;

        // Rule: Usually cannot deal if empty columns exist, but simplified: allow it or warn?
        // Let's implement robust rule later. For now, just deal.

        // We deal 1 card to each of 10 columns
        if (this.stock.length < 10) return; // Should likely be multiple of 10

        for (let i = 0; i < 10; i++) {
            const card = this.stock.pop();
            card.flip(true);
            this.tableau[i].push(card);

            // Animate?
        }

        this.checkCompletedSuits();
        this.render();
    }

    checkCompletedSuits() {
        // Check for K...A runs of SAME SUIT in all columns
        // Try to remove them
        this.tableau.forEach((pile, colIdx) => {
            if (pile.length < 13) return;

            // Check top 13 cards?
            // A run must be at the END of the pile
            const run = pile.slice(-13);
            if (this.isCompleteRun(run)) {
                // Remove run
                pile.splice(pile.length - 13, 13);
                this.completedSuits++;

                // Flip new top card
                if (pile.length > 0) pile[pile.length - 1].flip(true);
            }
        });

        if (this.completedSuits === 8) {
            setTimeout(() => alert("You Win!"), 100);
        }
    }

    showOptions() {
        this.toggleSettings();
    }

    isCompleteRun(arr) {
        if (arr.length !== 13) return false;
        // Verify King down to Ace
        // Rank 13 down to 1
        const suit = arr[0].suit;
        for (let i = 0; i < 13; i++) {
            if (arr[i].suit !== suit) return false;
            // Expected rank: 13 (K) - i
            if (arr[i].rank !== (13 - i)) return false;
        }
        return true;
    }

    render() {
        if (!this.layout) return; // Wait for layout calculation

        // Render Stock
        const roundsLeft = Math.floor(this.stock.length / 10);
        this.stockCountEl.textContent = this.stock.length;
        this.stockEl.className = `sol-stock-area ${this.stock.length === 0 ? 'empty' : ''}`;

        // Visual stack for stock
        this.stockEl.innerHTML = ''; // Clear
        if (this.stock.length > 0) {
            // Stack effect
            for (let k = 0; k < Math.min(3, roundsLeft); k++) {
                const layer = el('div', { class: 'stock-layer', style: `bottom: ${k * 2}px; right: ${k * 2}px;` });
                this.stockEl.appendChild(layer);
            }
            this.stockEl.appendChild(this.stockCountEl);
        }

        // Render Completed
        this.completedEl.innerHTML = '';
        for (let i = 0; i < this.completedSuits; i++) {
            const s = el('div', { class: 'sol-pile ended' }, '👑');
            // Stack them slightly
            s.style.marginLeft = i > 0 ? '-20px' : '0';
            this.completedEl.appendChild(s);
        }

        // Render Tableau with Compression
        const tCols = this.tableauEl.children;
        const availableHeight = this.layout.availH; // Total pixel height for column
        const cHeight = this.layout.cardH;

        for (let i = 0; i < 10; i++) {
            tCols[i].innerHTML = '';
            const pile = this.tableau[i];

            if (pile.length === 0) continue;

            // Calculate offset to ensure last card's BOTTOM stays within bounds
            // Last card top position: (pile.length - 1) * offset
            // Last card bottom position: (pile.length - 1) * offset + cardH
            // Constraint: (pile.length - 1) * offset + cardH <= availableHeight

            let offset = this.baseStackOffset || 20;

            // Check if we need to squash
            const lastCardTop = (pile.length - 1) * offset;
            const lastCardBottom = lastCardTop + cHeight;

            if (lastCardBottom > availableHeight) {
                // SQUASH: Calculate maximum offset that keeps last card visible
                // (pile.length - 1) * offset + cardH = availableHeight
                // offset = (availableHeight - cardH) / (pile.length - 1)
                const maxOffset = (availableHeight - cHeight) / (pile.length - 1);
                // Use 90% safety margin instead of 95% for more room
                offset = Math.max(6, Math.floor(maxOffset * 0.90));
            }

            pile.forEach((card, index) => {
                card.element.style.top = `${index * offset}px`;
                card.element.style.zIndex = index;

                if (card.faceUp) {
                    this.setupDrag(card.element, card, 'tableau', i, index);
                }
                tCols[i].appendChild(card.element);
            });
        }
    }

    setupDrag(el, card, source, pileIdx, cardIdx) {
        // Simplified drag setup reusing logic
        el.onmousedown = (e) => this.dragStart(e, card, source, pileIdx, cardIdx);
        el.ontouchstart = (e) => this.dragStart(e, card, source, pileIdx, cardIdx);
    }

    dragStart(e, card, source, pileIdx, cardIdx) {
        if (e.cancelable) e.preventDefault();

        // Check if dragging stack is valid (Must be run of same suit)
        const pile = this.tableau[pileIdx];
        const draggingStack = pile.slice(cardIdx);

        if (!this.isValidDragStack(draggingStack)) return;

        const clientX = e.clientX || e.touches[0].clientX;
        const clientY = e.clientY || e.touches[0].clientY;
        const cardRect = card.element.getBoundingClientRect();
        const offsetX = clientX - cardRect.left;
        const offsetY = clientY - cardRect.top;

        this.dragContext = {
            card, stack: draggingStack, source, pileIdx, cardIdx,
            offsetX, offsetY,
            clone: this.createGhost(draggingStack)
        };

        // Hide originals
        draggingStack.forEach(c => {
            c.element.style.visibility = 'hidden';
            c.element.classList.add('is-dragging');
        });

        this.dragContext.clone.style.zIndex = '9999';
        document.body.appendChild(this.dragContext.clone);
        this.updateGhostPos(clientX, clientY);

        document.onmousemove = (ev) => this.dragMove(ev);
        document.ontouchmove = (ev) => this.dragMove(ev);
        document.onmouseup = (ev) => this.dragEnd(ev);
        document.ontouchend = (ev) => this.dragEnd(ev);
    }

    isValidDragStack(stack) {
        if (stack.length === 1) return true;
        // Must be same suit and descending rank
        for (let i = 0; i < stack.length - 1; i++) {
            const current = stack[i];
            const next = stack[i + 1];
            if (current.suit !== next.suit) return false;
            if (current.rank !== next.rank + 1) return false;
        }
        return true;
    }

    createGhost(stack) {
        // ... Reusing ghost logic ...
        const wrapper = el('div', { class: 'drag-ghost' });
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
            clone.style.visibility = 'visible';
            clone.style.transform = 'none';
            clone.style.opacity = '0.95';
            clone.style.boxShadow = '0 14px 28px rgba(0, 0, 0, 0.65)';
            wrapper.appendChild(clone);
        });
        wrapper.style.pointerEvents = 'none';
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
        const x = e.clientX || (e.touches && e.touches[0].clientX);
        const y = e.clientY || (e.touches && e.touches[0].clientY);
        if (x && y) this.updateGhostPos(x, y);
    }

    dragEnd(e) {
        if (!this.dragContext) return;

        const x = e.clientX || (e.changedTouches && e.changedTouches[0].clientX);
        const y = e.clientY || (e.changedTouches && e.changedTouches[0].clientY);

        document.onmousemove = null;
        document.ontouchmove = null;
        document.onmouseup = null;
        document.ontouchend = null;

        this.dragContext.clone.remove();
        this.dragContext.stack.forEach(c => {
            c.element.style.visibility = 'visible';
            c.element.classList.remove('is-dragging');
        });

        const elUnder = document.elementFromPoint(x, y);
        const dropZone = (elUnder && elUnder.closest) ? elUnder.closest('.sol-column') : null;

        if (dropZone) {
            this.handleDrop(dropZone);
        }
        this.dragContext = null;
    }

    handleDrop(zone) {
        const { stack, source, pileIdx, cardIdx } = this.dragContext;
        const targetIdx = parseInt(zone.dataset.col);

        // Cannot drop on same pile
        if (targetIdx === pileIdx) return;

        if (this.isValidMove(stack[0], targetIdx)) {
            // Move
            this.tableau[pileIdx].splice(cardIdx, stack.length);
            if (this.tableau[pileIdx].length > 0) {
                this.tableau[pileIdx][this.tableau[pileIdx].length - 1].flip(true);
            }
            this.tableau[targetIdx].push(...stack);

            this.checkCompletedSuits();
            this.render();
        }
    }

    isValidMove(card, targetIdx) {
        const pile = this.tableau[targetIdx];
        if (pile.length === 0) return true; // Can place anything on empty

        const top = pile[pile.length - 1];
        // Spider Rule: Can place on card of Rank + 1 (Suit doesn't matter for placement, only for drag)
        return top.rank === card.rank + 1;
    }
}
