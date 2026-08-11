/**
 * dragRail.js — pointer glue for reordering account cards.
 *
 * Every *decision* lives in reorder.js (pure, tested). This file only measures
 * the DOM, moves a node, and reports the new order. Keeping it that thin is
 * what stops the ordering rules from being re-derived slightly differently
 * here than in the tests.
 *
 * POINTER EVENTS ONLY — no mouse/touch split, no document-level globals.
 *
 * Three failure modes this handles that the naive version does not:
 *
 *   • **A click must stay a click.** 6px of movement or 150ms of hold before
 *     anything drags, so tapping a card still opens its inbox.
 *   • **pointercancel strands state.** A tab switch or a system gesture mid
 *     drag fires cancel, not up. Without teardown the card keeps `.is-dragging`
 *     — which means `transition: none` and dead pointer events, permanently.
 *     v1.10.0 shipped this exact fix for window drags.
 *   • **setPointerCapture can throw.** An already-released or synthetic
 *     pointer rejects capture, and an exception mid-handler leaves the drag
 *     half-armed — the stranding path again. Guarded.
 *
 * ONE WRITE, ON DROP. Not per pointermove: AppStorage's sync scheduler is a
 * single trailing 2s debounce, and a per-move write starves it so that *no*
 * key syncs while the gesture is in flight (v1.7.0 established this the hard
 * way with the Pomodoro tick).
 */

import { dropIndexFor, isDragGesture } from './reorder.js';

const COMMIT_DEBOUNCE_MS = 250;

export class DragRail {
    /**
     * @param {HTMLElement} grid    the container holding .mail-card nodes
     * @param {(orderedIds: string[]) => void} onCommit
     */
    constructor(grid, onCommit) {
        this.grid = grid;
        this.onCommit = onCommit;

        this._drag = null;
        this._timer = null;
        this._pendingIds = null;

        this._onDown = (e) => this._down(e);
        this._onMove = (e) => this._move(e);
        this._onUp = (e) => this._end(e, true);
        this._onCancel = (e) => this._end(e, false);

        grid.addEventListener('pointerdown', this._onDown);
        grid.addEventListener('pointermove', this._onMove);
        grid.addEventListener('pointerup', this._onUp);
        grid.addEventListener('pointercancel', this._onCancel);
    }

    /** Cards in current DOM order. The add tile is not a card and is skipped. */
    _cards() {
        return Array.from(this.grid.querySelectorAll('.mail-card'));
    }

    _down(e) {
        // Primary button only, and never from a control inside the card —
        // starring or removing must not begin a drag.
        if (e.button !== 0) return;
        if (e.target.closest('button, select, input, a')
            && !e.target.closest('.mail-card-head')) return;

        const card = e.target.closest('.mail-card');
        if (!card || !this.grid.contains(card)) return;
        if (this._cards().length < 2) return;

        this._drag = {
            card,
            id: card.dataset.accountId,
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            startedAt: Date.now(),
            active: false,
        };
    }

    _move(e) {
        const d = this._drag;
        if (!d || e.pointerId !== d.pointerId) return;

        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;

        if (!d.active) {
            if (!isDragGesture({ dx, dy, heldMs: Date.now() - d.startedAt })) return;
            d.active = true;
            d.card.classList.add('is-dragging');
            this.grid.classList.add('is-reordering');
            // May legitimately throw for a pointer that is already gone; an
            // uncaptured drag still works, a thrown one strands state.
            try { d.card.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        }

        e.preventDefault();
        d.card.style.transform = `translate(${dx}px, ${dy}px)`;

        // Measure live rather than caching: the grid reflows as cards move.
        const cards = this._cards();
        const rects = cards.map(c => (c === d.card ? null : c.getBoundingClientRect()));
        const visible = [];
        const nodes = [];
        rects.forEach((r, i) => { if (r) { visible.push(r); nodes.push(cards[i]); } });

        const at = dropIndexFor(visible, e.clientX, e.clientY);
        const before = nodes[at] || null;
        // insertBefore with the node already in place is a no-op in the DOM,
        // so this does not thrash on every move event.
        if (before !== d.card.nextSibling) this.grid.insertBefore(d.card, before);
    }

    _end(e, commit) {
        const d = this._drag;
        if (!d || (e && e.pointerId !== d.pointerId)) return;
        this._drag = null;

        d.card.style.transform = '';
        d.card.classList.remove('is-dragging');
        this.grid.classList.remove('is-reordering');
        try { d.card.releasePointerCapture(d.pointerId); } catch { /* already gone */ }

        // A gesture that never became a drag is a click; the card's own
        // handler opens it. Nothing to commit.
        if (!d.active) return;
        // A cancel already restored nothing to persist — but the DOM may have
        // moved during the gesture, so re-commit the order either way and let
        // the caller's re-render settle it.
        if (!commit) return;

        this._pendingIds = this._cards().map(c => c.dataset.accountId).filter(Boolean);
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._flush(), COMMIT_DEBOUNCE_MS);
    }

    _flush() {
        clearTimeout(this._timer);
        this._timer = null;
        const ids = this._pendingIds;
        this._pendingIds = null;
        if (ids) this.onCommit(ids);
    }

    destroy() {
        // Flush before tearing down — a window closed inside the debounce
        // window must not silently lose the reorder.
        if (this._pendingIds) this._flush();
        clearTimeout(this._timer);
        this._timer = null;
        this._drag = null;
        this.grid.removeEventListener('pointerdown', this._onDown);
        this.grid.removeEventListener('pointermove', this._onMove);
        this.grid.removeEventListener('pointerup', this._onUp);
        this.grid.removeEventListener('pointercancel', this._onCancel);
    }
}
