/**
 * pdf/library/LibraryCard.js — single doc card for the Library grid.
 *
 * Renders a thumbnail + name + last-read page + progress bar + relative
 * "Resume — 2h ago" footer. Click → open. Right-click → contextmenu
 * delegated to caller.
 *
 * Stateless DOM builder. Caller manages state, passes a fresh doc record
 * on every render and re-renders the card on data change.
 */

import { el } from '../../../utils/dom.js';
import { formatBytes, formatRelativeTime, progressFraction } from './libraryReducer.js';

export function buildLibraryCard({ doc, onOpen, onContextMenu, onRequestThumbnail } = {}) {
    const root = el('article', {
        class: 'pdf-lib-card',
        'data-doc-id': doc.id,
        tabindex: '0',
        role: 'button',
        'aria-label': `Open ${doc.name}`,
    });

    const thumb = el('div', { class: 'pdf-lib-card-thumb' });
    if (doc.thumbnailDataUrl) {
        const img = el('img', {
            class: 'pdf-lib-card-thumb-img',
            src: doc.thumbnailDataUrl,
            alt: '',
        });
        thumb.appendChild(img);
    } else {
        thumb.appendChild(el('div', { class: 'pdf-lib-card-thumb-empty' }, '📕'));
        // Ask caller to render & cache a thumbnail in the background.
        if (typeof onRequestThumbnail === 'function') {
            requestAnimationFrame(() => onRequestThumbnail(doc));
        }
    }

    const progress = progressFraction(doc.currentPage, doc.pageCount);
    const progressBar = el('div', { class: 'pdf-lib-card-progress' });
    const progressFill = el('div', {
        class: 'pdf-lib-card-progress-fill',
        style: { width: `${Math.round(progress * 100)}%` },
    });
    progressBar.appendChild(progressFill);

    const name = el('div', { class: 'pdf-lib-card-name', title: doc.name }, doc.name);
    const meta = el('div', { class: 'pdf-lib-card-meta' });
    if (Number.isFinite(doc.pageCount) && doc.pageCount > 0) {
        const cur = Math.max(1, Math.min(doc.currentPage || 1, doc.pageCount));
        meta.appendChild(el('span', { class: 'pdf-lib-card-page' }, `p.${cur} / ${doc.pageCount}`));
    } else {
        meta.appendChild(el('span', { class: 'pdf-lib-card-page' }, formatBytes(doc.sizeBytes)));
    }

    const footer = el('div', { class: 'pdf-lib-card-footer' });
    const resumeLabel = doc.lastOpenedAt && doc.currentPage > 1 ? 'Resume' : 'Open';
    footer.appendChild(el('span', { class: 'pdf-lib-card-cta' }, resumeLabel));
    footer.appendChild(el('span', { class: 'pdf-lib-card-time' }, formatRelativeTime(doc.lastOpenedAt)));

    root.append(thumb, progressBar, name, meta, footer);

    root.addEventListener('click', () => onOpen?.(doc));
    root.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onOpen?.(doc);
        }
    });
    if (onContextMenu) {
        root.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onContextMenu(doc, e);
        });
    }

    return { root };
}
