/**
 * MobileInteractionV2.js — v0.7.1 (Cache Bust)
 *
 * Unified gesture controller for the grid.
 * States: IDLE → PRESSED → { TAP | LONG_PRESS | DRAGGING | SWIPING }
 *
 * v0.7: drag+swipe flips pages (horizontal swipe gesture while dragging icon)
 */

export class MobileInteraction {
    constructor(root, layoutEngine, gridState, debug) {
        this.root = root;
        this.engine = layoutEngine;
        this.state = gridState;
        this.debug = debug || { log() { }, update() { }, error() { } };

        this.cfg = {
            longPressMs: 350,
            moveThreshold: 6,
            swipeCommitPx: 34,
            dragFromLongPressPx: 20,
            dragFromLongPressMs: 120,
            pageFlipDelayMs: 460,
            dragSwipeThresholdPx: 38,
            dragSwipeCooldownMs: 260,
            pageFlipCooldownMs: 520,
            folderDwellMs: 250,
        };

        this.layout = null;
        this.currentPage = 0;

        // Edge flip lock (prevents multi-page skipping while holding at the edge)
        this._edgeFlipState = {
            locked: false,
            lockDir: 0,
            inSafeZone: false,
            lastFlipTime: 0
        };


        // Pointer tracking (multi-touch safety)
        this._activePointers = new Set();
        this._assist = null;
        this._raf = null;
        this._rafX = 0;
        this._rafY = 0;

        this.isEditMode = false;

        this._ptr = null;
        this._mode = 'IDLE';
        this._editDragTimer = null;
        this._lpTimer = null;
        this._lpAt = 0;
        this._folderDwellTimer = null;
        this._hoverTargetId = null;
        this._ghost = null;
        this._draggedEl = null; // Stable reference to the dragged element (survives _ptr reset)
        this._dragOffset = { x: 0, y: 0 };
        this._pageFlipTimer = null;
        this._dragSwipeLastFlipTime = 0;

        this._onDown = this._onDown.bind(this);
        this._onMove = this._onMove.bind(this);
        this._onUp = this._onUp.bind(this);
        this._onCancel = this._onCancel.bind(this);
        this._onTouchGate = this._onTouchGate.bind(this);
        this._onContextMenu = (e) => {
            // Unify desktop right-click and mobile long-press: always route to OS menus
            try { if (e && e.cancelable) e.preventDefault(); } catch (err) { }
            try { if (e) e.stopPropagation(); } catch (err) { }

            const x = (e && typeof e.clientX === 'number') ? e.clientX : 0;
            const y = (e && typeof e.clientY === 'number') ? e.clientY : 0;
            const target = (e && e.target && e.target.closest) ? e.target : null;

            // Folder overlay item (children inside a folder)
            const folderItem = target ? target.closest('.folder-item-wrapper') : null;
            if (folderItem && folderItem.dataset && folderItem.dataset.id) {
                const id = folderItem.dataset.id;
                this._dispatch('item:context-menu', { type: 'desktop', id: id, x: x, y: y });
                return;
            }

            // Dock item (desktop right click)
            const dockItem = target ? (target.closest('.m-dock-item') || target.closest('.dock-icon')) : null;
            if (dockItem && dockItem.dataset && dockItem.dataset.id) {
                const id = dockItem.dataset.id;
                this._dispatch('item:context-menu', { type: 'dock', id: id, x: x, y: y });
                return;
            }

            // Desktop/grid icon
            const itemEl = target ? target.closest('.app-icon') : null;
            if (itemEl && itemEl.dataset && itemEl.dataset.id) {
                const id = itemEl.dataset.id;
                const labelEl = itemEl.querySelector ? itemEl.querySelector('.app-label') : null;
                const title = labelEl ? (labelEl.innerText || labelEl.textContent || '').trim() : '';
                const inner = itemEl.querySelector ? itemEl.querySelector('.app-icon-inner') : null;
                let icon = '';
                if (inner && inner.querySelector) {
                    const img = inner.querySelector('img');
                    if (img && img.src) icon = img.src;
                }
                if (!icon && inner) icon = (inner.innerText || inner.textContent || '').trim();
                this._dispatch('item:context-menu', { type: 'desktop', id: id, title: title, icon: icon, x: x, y: y });
                return;
            }

            // Background
            this._dispatch('grid:context-menu', { type: 'grid', x: x, y: y });
        };
        this._onWindowPointerUp = (e) => {
            if (this._mode !== 'IDLE' && this._ptr && e.pointerId === this._ptr.id) this._onUp(e);
        };
        this._attach();
    }

    _attach() {
        const opts = { passive: false, capture: true };
        this.root.addEventListener('pointerdown', this._onDown, opts);
        this.root.addEventListener('pointermove', this._onMove, opts);
        this.root.addEventListener('pointerup', this._onUp, { capture: true });
        this.root.addEventListener('pointercancel', this._onCancel, { capture: true });
        this.root.addEventListener('lostpointercapture', this._onCancel, { capture: true });
        this.root.addEventListener('touchstart', this._onTouchGate, opts);
        this.root.addEventListener('touchmove', this._onTouchGate, opts);
        this.root.addEventListener('contextmenu', this._onContextMenu, { capture: true });
        this.root.style.touchAction = 'none';
        this.root.style.userSelect = 'none';
        this.root.style.webkitUserSelect = 'none';
        window.addEventListener('pointerup', this._onWindowPointerUp);
    }

    _onTouchGate(e) {
        const t = e.target;
        if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
        if (e.cancelable) e.preventDefault();
    }

    _onDown(e) {
        // Desktop mouse: ignore non-left buttons here (right-click handled by contextmenu)
        try {
            if (e && e.pointerType === 'mouse' && typeof e.button === 'number' && e.button !== 0) return;
        } catch (err) { }
        // Track all pointers for multi-touch stability
        this._activePointers.add(e.pointerId);
        // If the interaction starts inside the dock OR folder overlay, let them own the gesture.
        if (e.target?.closest?.('.m-dock, .dock, .m-dock-item, .folder-overlay')) return;

        // We only run a single primary gesture at a time.
        // However, while DRAGGING, allow a secondary finger to request page flips.
        if (this._ptr || this._mode !== 'IDLE') {
            if (this._mode === 'DRAGGING' && this._ptr && e.pointerId !== this._ptr.id) {
                if (!this._assist) {
                    this._assist = { id: e.pointerId, startX: e.clientX, lastX: e.clientX, startTime: performance.now() };
                    try { this.root.setPointerCapture(e.pointerId); } catch { }
                }
                if (e.cancelable) e.preventDefault();
            }
            return;
        }
        const itemEl = e.target.closest('.app-icon');
        const itemId = itemEl?.dataset?.id ?? null;
        this._ptr = {
            id: e.pointerId, startX: e.clientX, startY: e.clientY,
            lastX: e.clientX, lastY: e.clientY,
            startTime: performance.now(),
            targetId: itemId, targetEl: itemEl, initialPage: this.currentPage,
        };
        this._mode = 'PRESSED';
        try { this.root.setPointerCapture(e.pointerId); } catch { }
        if (itemId) this._animatePress(itemEl, true);
        // Long-press is touch-first. On desktop mouse, use right-click for context menu.
        if (e.pointerType !== 'mouse') {
            this._lpTimer = setTimeout(() => this._onLongPress(), this.cfg.longPressMs);
        }
        // In edit mode, dragging should feel immediate (no long-press required).
        if (itemId && this.isEditMode) {
            this._editDragTimer = setTimeout(() => {
                if (this._mode === 'PRESSED' && this._ptr && this._ptr.targetId) {
                    this._clearLPTimer();
                    // synthetic event-like object
                    this._startDrag({ clientX: this._ptr.lastX, clientY: this._ptr.lastY });
                }
            }, 80);
        }
    }

    _onMove(e) {
        // Secondary pointer: allow page flips while dragging (does not affect drag).
        if (this._assist && e.pointerId === this._assist.id) {
            if (this._mode === 'DRAGGING') {
                if (e.cancelable) e.preventDefault();
                const dx = e.clientX - this._assist.startX;
                this._assist.lastX = e.clientX;

                const now = performance.now();
                const sinceLast = now - this._dragSwipeLastFlipTime;

                if (sinceLast > this.cfg.dragSwipeCooldownMs && Math.abs(dx) > this.cfg.dragSwipeThresholdPx) {
                    const dir = dx < 0 ? 1 : -1;
                    const maxPage = Math.max(0, (this.state.pageCount || 1) - 1);
                    const newPage = this.currentPage + dir;
                    if (newPage >= 0 && newPage <= maxPage) {
                        this.currentPage = newPage;
                        this._animateToPage(newPage);
                        this._dispatch('page:change', newPage);
                        this._edgeFlipState.lastFlipTime = Date.now();
                        if (navigator.vibrate) navigator.vibrate(10);
                    }
                    this._assist.startX = e.clientX;
                    this._dragSwipeLastFlipTime = now;
                }
            }
            return;
        }

        if (!this._ptr || this._ptr.id !== e.pointerId) return;
        if (e.cancelable && this._mode !== 'IDLE') e.preventDefault();
        const dx = e.clientX - this._ptr.startX;
        const dy = e.clientY - this._ptr.startY;
        const dist = Math.hypot(dx, dy);
        this._ptr.lastX = e.clientX;
        this._ptr.lastY = e.clientY;

        if (this._editDragTimer && (this._mode !== 'PRESSED' || dist > 2)) { clearTimeout(this._editDragTimer); this._editDragTimer = null; }

        switch (this._mode) {
            case 'PRESSED':
                if (dist > this.cfg.moveThreshold) {
                    this._clearLPTimer();
                    this._animatePress(this._ptr.targetEl, false);
                    if (this._ptr.targetId) { this._startDrag(e); }
                    else if (Math.abs(dx) > Math.abs(dy)) { this._mode = 'SWIPING'; this._dispatch('menu:hide'); }
                    else { this._reset(); }
                }
                break;
            case 'LONG_PRESS':
                if (this._ptr.targetId && dist > this.cfg.dragFromLongPressPx && (performance.now() - this._lpAt) > this.cfg.dragFromLongPressMs) {
                    this._startDrag(e);
                }
                break;
            case 'SWIPING': this._updateSwipe(dx); break;
            case 'DRAGGING': this._updateDrag(e); break;
        }
    }

    _onUp(e) {
        this._activePointers?.delete(e.pointerId);
        if (this._assist && e.pointerId === this._assist.id) {
            this._assist = null;
            return;
        }
        if (!this._ptr || this._ptr.id !== e.pointerId) return;
        if (this._editDragTimer) { clearTimeout(this._editDragTimer); this._editDragTimer = null; }
        const dx = e.clientX - this._ptr.startX;
        switch (this._mode) {
            case 'PRESSED':
                this._clearLPTimer();
                this._animatePress(this._ptr.targetEl, false);
                if (this._ptr.targetId) { if (this.isEditMode) this.stopEditMode(); else this._dispatch('item:click', this._ptr.targetId); }
                else { if (this.isEditMode) this.stopEditMode(); }
                break;
            case 'LONG_PRESS': this._animatePress(this._ptr.targetEl, false); break;
            case 'SWIPING': this._endSwipe(dx); break;
            case 'DRAGGING': this._endDrag(e); break;
        }
        this._reset();
    }

    _onCancel(e) {
        this._activePointers?.delete(e.pointerId);
        if (this._assist && e.pointerId === this._assist.id) {
            this._assist = null;
            return;
        }
        if (!this._ptr || this._ptr.id !== e.pointerId) return;
        if (this._editDragTimer) { clearTimeout(this._editDragTimer); this._editDragTimer = null; }
        this._clearLPTimer();
        this._animatePress(this._ptr.targetEl, false);
        if (this._mode === 'DRAGGING') this._cancelDrag();
        else if (this._mode === 'SWIPING') this._animateToPage(this.currentPage);
        this._reset();
    }

    _onLongPress() {
        if (this._mode !== 'PRESSED') return;
        this._mode = 'LONG_PRESS';
        this._lpAt = performance.now();
        this._lpTimer = null;
        if (navigator.vibrate) navigator.vibrate(50);
        const { targetId, targetEl, startX, startY } = this._ptr;
        if (targetId) {
            this._dispatch('item:context-menu', {
                id: targetId,
                title: targetEl?.innerText ?? '',
                icon: targetEl?.querySelector('img')?.src || targetEl?.querySelector('.app-icon-inner')?.innerText,
                x: startX, y: startY,
            });
        } else {
            this._dispatch('grid:context-menu', { type: 'grid', x: startX, y: startY });
        }
    }

    // ─── Swipe ──────────────────────────────────────────────────

    _updateSwipe(dx) {
        if (!this.layout) return;
        const w = this.layout.gridArea.width;
        const maxPage = this.state.pageCount - 1;
        let eff = dx;
        if (this.currentPage === 0 && dx > 0) eff *= 0.3;
        if (this.currentPage >= maxPage && dx < 0) eff *= 0.3;
        this._dispatch('scroll:update', -(this.currentPage * w) + eff);
    }

    _endSwipe(dx) {
        if (Math.abs(dx) > this.cfg.swipeCommitPx) {
            const dir = dx > 0 ? -1 : 1;
            const newPage = this.currentPage + dir;
            const maxPage = this.state.pageCount - 1;
            if (newPage >= 0 && newPage <= maxPage) { this.currentPage = newPage; this._dispatch('page:change', newPage); }
        }
        this._animateToPage(this.currentPage);
    }

    animateToPage(page) { this._animateToPage(page); this.currentPage = page; this._dispatch('page:change', page); }

    _animateToPage(page) {
        if (!this.layout) return;
        this._dispatch('scroll:animate', -(page * this.layout.gridArea.width));
    }

    // ─── Drag ───────────────────────────────────────────────────

    _startDrag(e) {
        if (!this.layout || !this._ptr?.targetEl) return;
        this._mode = 'DRAGGING';
        this._dispatch('menu:hide');
        const el = this._ptr.targetEl;
        // Stable reference that survives _ptr being nulled by _reset()
        this._draggedEl = el;
        const rect = el.getBoundingClientRect();
        this._ghost = el.cloneNode(true);
        Object.assign(this._ghost.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
            zIndex: '99999', pointerEvents: 'none', opacity: '0.9',
            transform: 'scale(1.1)', transition: 'transform 0.1s',
        });
        this._ghost.classList.add('ghost');
        document.body.appendChild(this._ghost);
        el.style.opacity = '0';
        this._dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        this._dragSwipeLastFlipTime = 0;

        // Stability / polish
        this._raf = null;
        this._rafX = 0;
        this._rafY = 0;
        this._editDragTimer = null;
        if (navigator.vibrate) navigator.vibrate(30);
    }

    /**
     * Public API to start dragging an item that originated outside the standard grid touch handling
     * (e.g. dragging out of a folder overlay).
     */
    startDragFromExternal(id, pointerId, clientX, clientY) {
        if (!this.layout || !id) return;

        // Create a synthetic pointer record
        // We use a fake ID because the real pointer is likely consumed by the overlay's event loop
        this._ptr = {
            id: pointerId, // Use REAL pointer ID so _onUp catches it
            startX: clientX, startY: clientY,
            lastX: clientX, lastY: clientY,
            startTime: performance.now(),
            targetId: id,
            targetEl: document.querySelector(`[data-id="${CSS?.escape ? CSS.escape(id) : id}"]`),
            initialPage: this.currentPage,
        };

        this._mode = 'DRAGGING';
        this._dispatch('menu:hide');

        // If the element is currently hidden/removed (because it was in a folder), 
        // we might need to find it or wait for it to render?
        // Actually, removeChildFromFolder puts it at page=-1, and PlacePending puts it somewhere.
        // So it should be in the DOM after the state notify.
        // We'll rely on the caller to ensure the DOM is ready or we wait a tick.

        const el = this._ptr.targetEl;
        if (!el) {
            // If not found, maybe wait one frame? For now, abort if not found.
            console.warn('[MobileInteraction] startDragFromExternal: target element not found for id', id);
            this._reset();
            return;
        }

        this._draggedEl = el;
        const rect = el.getBoundingClientRect();

        this._ghost = el.cloneNode(true);
        Object.assign(this._ghost.style, {
            position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
            width: `${rect.width}px`, height: `${rect.height}px`,
            zIndex: '99999', pointerEvents: 'none', opacity: '0.9',
            transform: 'scale(1.1)', transition: 'transform 0.1s',
        });
        this._ghost.classList.add('ghost');
        document.body.appendChild(this._ghost);

        el.style.opacity = '0';

        // Center the drag on the pointer if possible, or keep offset
        this._dragOffset = { x: rect.width / 2, y: rect.height / 2 };
        // Adjust ghost to center on pointer
        const ghostLeft = clientX - this._dragOffset.x;
        const ghostTop = clientY - this._dragOffset.y;
        this._ghost.style.left = `${ghostLeft}px`;
        this._ghost.style.top = `${ghostTop}px`;

        this._dragSwipeLastFlipTime = 0;
        this._raf = null;
        this._rafX = 0;
        this._rafY = 0;

        if (navigator.vibrate) navigator.vibrate(30);
    }


    _queueGhostUpdate(x, y) {
        this._rafX = x;
        this._rafY = y;
        if (this._raf) return;
        this._raf = requestAnimationFrame(() => {
            this._raf = null;
            if (!this._ghost) return;
            this._ghost.style.left = `${this._rafX}px`;
            this._ghost.style.top = `${this._rafY}px`;
        });
    }
    _landGhostToId(id) {
        if (!this._ghost || !id) return;
        // After the drop, the real node will re-appear in either the grid or the dock.
        requestAnimationFrame(() => {
            const target = document.querySelector(`[data-id="${CSS?.escape ? CSS.escape(id) : id}"]`);
            if (!target || !this._ghost) { this._cleanupDrag(); return; }
            const tr = target.getBoundingClientRect();
            const gr = this._ghost.getBoundingClientRect();
            const dx = tr.left - gr.left;
            const dy = tr.top - gr.top;

            this._ghost.style.transition = 'transform 140ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 140ms';
            // Keep scale but translate to target
            this._ghost.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.02)`;
            this._ghost.style.opacity = '0.2';
            setTimeout(() => this._cleanupDrag(), 160);
        });
    }


    _updateDrag(e) {
        if (!this._ghost) return;
        this._queueGhostUpdate(e.clientX - this._dragOffset.x, e.clientY - this._dragOffset.y);

        // ── Folder hover & Dwell detection ───────────────────────────────
        const containerRect = this.root.getBoundingClientRect();
        const localX = e.clientX - containerRect.left;
        const localY = e.clientY - containerRect.top;
        const w = this.layout?.gridArea?.width || window.innerWidth;
        const loc = this.engine.getGridLocationFromPoint(localX, localY, -(this.currentPage * w), w, this.layout);

        if (loc) {
            const occupant = this.state.findItemAt(loc.page, loc.row, loc.col);
            const isTarget = occupant && occupant.id !== this._ptr.targetId;

            if (isTarget) {
                if (this._hoverTargetId !== occupant.id) {
                    this._clearFolderTimer();
                    this._hoverTargetId = occupant.id;
                    this._dispatch('item:folder-hover', { targetId: occupant.id });

                    this._folderDwellTimer = setTimeout(() => {
                        this._folderDwellTriggered = true;
                        this._dispatch('item:folder-dwell', { targetId: occupant.id });
                        if (navigator.vibrate) navigator.vibrate(20);
                    }, this.cfg.folderDwellMs);
                }
            } else {
                this._clearFolderHover();
            }
        } else {
            this._clearFolderHover();
        }

        // ── Edge-of-screen page flip ─────────────────────────────────────
        // If a secondary "assist" finger is active, do not also edge-flip.
        if (this._assist) {
            this._clearPageFlipTimer();
        } else {
            const ga = this.layout?.gridArea;
            const baseLeft = ga ? ga.left : 0;
            const areaWidth = ga ? ga.width : window.innerWidth;

            // Proportional edge zone: 10% of grid width, clamped 36–60px
            const edgeZone = Math.max(36, Math.min(60, areaWidth * 0.10));
            const leftEdge = baseLeft + edgeZone;
            const rightEdge = baseLeft + areaWidth - edgeZone;

            this._handleEdgeFlipZone(e.clientX, leftEdge, rightEdge, edgeZone);
        }

        // ── Dock hover highlight ────────────────────────────────
        const dockEl = document.querySelector('.mobile-dock.m-dock') || document.querySelector('.m-dock');
        if (dockEl) {
            const r = dockEl.getBoundingClientRect();
            dockEl.classList.toggle('is-drop-target', e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom);
        }
    }

    _endDrag(e) {
        if (!this._ghost) return;
        this._clearPageFlipTimer();

        // Capture current page BEFORE any coordinate calculations to avoid race conditions
        const dropPage = this.currentPage;

        // Check for folder creation/drop BEFORE standard grid drop
        // Check for folder creation/drop BEFORE standard grid drop
        // Relaxed: If we are hovering a valid target at drop time, treat as folder interaction
        if (this._hoverTargetId) {
            this._dispatch('item:drop-on-item', { sourceId: this._ptr.targetId, targetId: this._hoverTargetId });
            this._cleanupDrag();
            return;
        }

        // FALLBACK: Hit-test directly if grid location lookup failed / lagged
        const hitEl = document.elementFromPoint(e.clientX, e.clientY);
        const targetEl = hitEl?.closest('.app-icon');
        if (targetEl && targetEl !== this._ptr.targetEl) {
            const targetId = targetEl.dataset.id;
            if (targetId && targetId !== this._ptr.targetId) {
                this._dispatch('item:drop-on-item', { sourceId: this._ptr.targetId, targetId });
                this._cleanupDrag();
                return;
            }
        }

        const dockEl = document.querySelector('.mobile-dock.m-dock') || document.querySelector('.m-dock');
        if (dockEl) {
            const r = dockEl.getBoundingClientRect();
            const tol = 18;
            if (e.clientX >= (r.left - tol) && e.clientX <= (r.right + tol) && e.clientY >= (r.top - tol) && e.clientY <= (r.bottom + tol)) {
                this._dispatch('item:drop-on-dock', { id: this._ptr.targetId });
                this._landGhostToId(this._ptr.targetId);
                return;
            }
        }
        const containerRect = this.root.getBoundingClientRect();
        // Use the actual pointer position (more reliable than transformed ghost rect)
        const localX = e.clientX - containerRect.left;
        const localY = e.clientY - containerRect.top;
        const w = this.layout.gridArea.width;
        const gridLoc = this.engine.getGridLocationFromPoint(localX, localY, -(dropPage * w), w, this.layout);
        if (gridLoc) {
            // Force use of dropPage (captured earlier) to match visual state
            this._dispatch('item:drop', { id: this._ptr.targetId, page: dropPage, row: gridLoc.row, col: gridLoc.col });
        }
        this._cleanupDrag();
    }

    _cancelDrag() {
        this._cleanupDrag();
        if (this._ptr?.targetId) this._dispatch('item:drop-cancel', { id: this._ptr.targetId });
    }

    _cleanupDrag() {
        this._clearLPTimer();
        this._clearPageFlipTimer();
        this._clearFolderHover();

        if (this._ghost) { this._ghost.remove(); this._ghost = null; }
        // Use stable reference (_draggedEl) because _ptr may have been nulled by _reset()
        if (this._draggedEl) { this._draggedEl.style.opacity = ''; this._draggedEl = null; }
        else if (this._ptr?.targetEl) { this._ptr.targetEl.style.opacity = ''; }

        const dockEl = document.querySelector('.mobile-dock.m-dock') || document.querySelector('.m-dock');
        dockEl?.classList.remove('is-drop-target');
    }

    _clearFolderTimer() {
        if (this._folderDwellTimer) {
            clearTimeout(this._folderDwellTimer);
            this._folderDwellTimer = null;
        }
        this._folderDwellTriggered = false;
    }

    _clearFolderHover() {
        this._clearFolderTimer();
        if (this._hoverTargetId) {
            this._dispatch('item:folder-hover-cancel', { targetId: this._hoverTargetId });
            this._hoverTargetId = null;
        }
    }

    /**
     * Unified edge-flip zone handler. Implements hysteresis:
     * - Pointer must enter edge zone → timer starts
     * - If pointer leaves edge zone before timer fires → cancel
     * - After flip, pointer must return to safe zone before another flip is allowed
     */
    _handleEdgeFlipZone(pointerX, leftEdge, rightEdge, edgeZone) {
        const inLeft = pointerX < leftEdge;
        const inRight = pointerX > rightEdge;
        // Safe zone: well inside the edges (edge zone + 20px buffer)
        const safeBuffer = Math.min(20, edgeZone * 0.5);
        const inSafe = pointerX > (leftEdge + safeBuffer) && pointerX < (rightEdge - safeBuffer);

        if (inSafe) {
            // In safe zone: cancel any pending flip, unlock after cooldown
            this._clearPageFlipTimer();
            this._edgeFlipState.inSafeZone = true;
            const now = Date.now();
            if (this._edgeFlipState.locked && (now - this._edgeFlipState.lastFlipTime >= this.cfg.pageFlipCooldownMs)) {
                this._edgeFlipState.locked = false;
                this._edgeFlipState.lockDir = 0;
            }
        } else if (inLeft || inRight) {
            const dir = inLeft ? -1 : 1;
            // Only allow flip if: (a) we returned to safe zone since last flip, or (b) not locked
            if (!this._edgeFlipState.locked || (this._edgeFlipState.inSafeZone && this._edgeFlipState.lockDir !== dir)) {
                this._schedulePageFlip(dir);
            } else if (this._edgeFlipState.lockDir !== dir) {
                // Changed direction — allow after resetting
                this._clearPageFlipTimer();
                this._edgeFlipState.locked = false;
                this._schedulePageFlip(dir);
            }
            this._edgeFlipState.inSafeZone = false;
        } else {
            // In the buffer zone between edge and safe — cancel pending flip
            this._clearPageFlipTimer();
        }
    }

    _schedulePageFlip(dir) {
        if (this._pageFlipTimer) return;

        const maxPage = Math.max(0, (this.state.pageCount || 1) - 1);
        const newPage = this.currentPage + dir;

        if (dir === 1 && newPage > maxPage && this._mode === 'DRAGGING' && this._ptr?.targetId) {
            // Create page BEFORE scheduling timer to avoid race conditions
            this._dispatch('page:ensure', { minPages: newPage + 1 });
        }

        // Symmetric delay for both directions
        this._pageFlipTimer = setTimeout(() => this._executePageFlip(dir), this.cfg.pageFlipDelayMs);
    }

    _executePageFlip(dir) {
        const maxPage = Math.max(0, (this.state.pageCount || 1) - 1);
        const newPage = this.currentPage + dir;

        if (newPage >= 0 && newPage <= maxPage) {
            this.currentPage = newPage;
            this._animateToPage(newPage);
            this._dispatch('page:change', newPage);
            this._edgeFlipState.lastFlipTime = Date.now();
            this._edgeFlipState.locked = true;
            this._edgeFlipState.lockDir = dir;
            if (navigator.vibrate) navigator.vibrate(10);
        }

        this._pageFlipTimer = null;
    }
    _clearPageFlipTimer() { if (this._pageFlipTimer) { clearTimeout(this._pageFlipTimer); this._pageFlipTimer = null; } }

    startEditMode() { this.isEditMode = true; this._dispatch('edit:start'); if (navigator.vibrate) navigator.vibrate([30, 30]); }
    stopEditMode() { this.isEditMode = false; this._dispatch('edit:end'); }

    _animatePress(el, down) {
        if (!el) return;
        const inner = el.querySelector('.app-icon-inner');
        if (!inner) return;
        inner.style.transition = 'transform 0.2s ease-out';
        inner.style.transform = down ? 'scale(0.95)' : 'scale(1)';
        if (!down) setTimeout(() => { if (inner) inner.style.transform = ''; }, 200);
    }

    _clearLPTimer() { if (this._lpTimer) { clearTimeout(this._lpTimer); this._lpTimer = null; } }

    _reset() {
        if (this._ptr?.id != null) { try { this.root.releasePointerCapture(this._ptr.id); } catch { } }
        this._ptr = null;
        this._mode = 'IDLE';
        if (this._editDragTimer) { clearTimeout(this._editDragTimer); this._editDragTimer = null; }
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        this._clearLPTimer();
        if (this._ghost) this._cleanupDrag();
        // Note: _draggedEl is NOT cleared here — it's cleared by _cleanupDrag which may run async (via _landGhostToId)
    }

    _dispatch(name, detail) { this.root.dispatchEvent(new CustomEvent(name, { detail, bubbles: true })); }

    destroy() {
        this.root.removeEventListener('pointerdown', this._onDown, true);
        this.root.removeEventListener('pointermove', this._onMove, true);
        this.root.removeEventListener('pointerup', this._onUp, true);
        this.root.removeEventListener('pointercancel', this._onCancel, true);
        this.root.removeEventListener('lostpointercapture', this._onCancel, true);
        this.root.removeEventListener('touchstart', this._onTouchGate, true);
        this.root.removeEventListener('touchmove', this._onTouchGate, true);
        this.root.removeEventListener('contextmenu', this._onContextMenu, true);
        window.removeEventListener('pointerup', this._onWindowPointerUp);

        this._clearLPTimer();
        this._clearPageFlipTimer();
        this._clearFolderHover();
        if (this._editDragTimer) { clearTimeout(this._editDragTimer); this._editDragTimer = null; }
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = null; }
        if (this._ghost || this._draggedEl) this._cleanupDrag();

        this._assist = null;
        this._ptr = null;
        this._mode = 'IDLE';
    }
}