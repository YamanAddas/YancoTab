/**
 * pdf/library/LibraryStorageGauge.js — footer pill showing IDB usage.
 *
 * Reads navigator.storage.estimate() via pdfStore.estimateQuota(). Shows
 * "12.4 GB free of 18.2 GB · Persistent storage on" or "(usage unknown)"
 * when the API is unavailable. A click expands a small breakdown panel.
 */

import { el } from '../../../utils/dom.js';
import { formatBytes } from './libraryReducer.js';

export function buildLibraryStorageGauge({ pdfStore, onManage } = {}) {
    const root = el('div', { class: 'pdf-lib-gauge', role: 'status' });
    const text = el('span', { class: 'pdf-lib-gauge-text' }, '…');
    const dot = el('span', { class: 'pdf-lib-gauge-dot' });
    const action = el('button', {
        type: 'button',
        class: 'pdf-lib-gauge-manage',
        title: 'Manage storage',
        onclick: () => onManage?.(),
    }, 'Manage');

    root.append(dot, text, action);

    let lastQuota = { usage: null, quota: null, persistent: false };

    async function refresh() {
        if (!pdfStore?.estimateQuota) return;
        try {
            const q = await pdfStore.estimateQuota();
            lastQuota = q;
            renderQuota(q);
        } catch {
            text.textContent = 'Storage usage unavailable';
        }
    }

    function renderQuota({ usage, quota, persistent }) {
        if (!Number.isFinite(usage) || !Number.isFinite(quota) || quota <= 0) {
            text.textContent = persistent
                ? 'Persistent storage on · usage unknown'
                : 'Best-effort storage · usage unknown';
            dot.dataset.level = 'unknown';
            return;
        }
        const free = Math.max(0, quota - usage);
        const pct = (usage / quota) * 100;
        let level = 'ok';
        if (pct >= 95) level = 'critical';
        else if (pct >= 80) level = 'warn';
        dot.dataset.level = level;

        const persistentLabel = persistent ? 'Persistent storage on' : 'Best-effort storage';
        text.textContent = `${formatBytes(free)} free of ${formatBytes(quota)} · ${persistentLabel}`;
    }

    return {
        root,
        refresh,
        get lastQuota() { return lastQuota; },
    };
}
