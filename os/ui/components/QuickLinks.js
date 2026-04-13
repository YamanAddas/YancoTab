/**
 * QuickLinks.js — Favorites row
 * Horizontal row of favicon circles for frequently visited sites.
 * Editable: long-press to remove, click + to add new URL.
 * Styles defined in css/home.css
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

const MAX_VISIBLE = 8;
const FAVICON_URL = (domain) => `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

export class QuickLinks {
    constructor() {
        this.root = null;
    }

    render() {
        this.root = el('div', { class: 'quick-links-bar' });
        this._build();
        return this.root;
    }

    _build() {
        this.root.innerHTML = '';

        const links = kernel.storage?.load('yancotab_quick_links') || [];
        const visible = links.slice(0, MAX_VISIBLE);

        for (const link of visible) {
            const domain = (() => {
                try { return new URL(link.url).hostname; } catch { return ''; }
            })();

            const item = el('div', { class: 'quick-link-item' });

            const circle = el('div', { class: 'quick-link-circle' });
            const img = el('img', {
                src: FAVICON_URL(domain),
                draggable: false,
                alt: link.label || domain,
            });
            img.onerror = () => { img.style.display = 'none'; circle.textContent = (link.label || '?')[0].toUpperCase(); };
            circle.appendChild(img);

            const label = el('div', { class: 'quick-link-label' }, link.label || domain);

            item.addEventListener('click', () => {
                window.open(link.url, '_blank', 'noopener,noreferrer');
            });

            let pressTimer;
            item.addEventListener('pointerdown', () => {
                pressTimer = setTimeout(() => {
                    if (confirm(`Remove "${link.label || domain}" from quick links?`)) {
                        const all = kernel.storage?.load('yancotab_quick_links') || [];
                        const filtered = all.filter(l => l.url !== link.url);
                        kernel.storage?.save('yancotab_quick_links', filtered);
                        this._build();
                        kernel.emit('toast', { message: 'Link removed', type: 'info' });
                    }
                }, 600);
            });
            item.addEventListener('pointerup', () => clearTimeout(pressTimer));
            item.addEventListener('pointerleave', () => clearTimeout(pressTimer));

            item.append(circle, label);
            this.root.appendChild(item);
        }

        if (visible.length < MAX_VISIBLE) {
            const addItem = el('div', { class: 'quick-link-item' });
            const addCircle = el('div', { class: 'quick-link-circle quick-link-add' }, '+');
            const addLabel = el('div', { class: 'quick-link-label' }, 'Add');
            addItem.addEventListener('click', () => this._addLink());
            addItem.append(addCircle, addLabel);
            this.root.appendChild(addItem);
        }

        if (links.length > MAX_VISIBLE) {
            const more = el('div', { class: 'quick-link-item' });
            const moreCircle = el('div', { class: 'quick-link-circle' }, `+${links.length - MAX_VISIBLE}`);
            more.appendChild(moreCircle);
            this.root.appendChild(more);
        }
    }

    _addLink() {
        const url = prompt('Enter URL (e.g. https://example.com):');
        if (!url) return;
        try {
            const parsed = new URL(url);
            if (!['https:', 'http:'].includes(parsed.protocol)) {
                kernel.emit('toast', { message: 'Only https/http URLs allowed', type: 'error' });
                return;
            }
            const label = prompt('Label (optional):', parsed.hostname.replace('www.', '')) || parsed.hostname.replace('www.', '');
            const links = kernel.storage?.load('yancotab_quick_links') || [];
            links.push({ label, url: parsed.href });
            kernel.storage?.save('yancotab_quick_links', links);
            this._build();
            kernel.emit('toast', { message: `Added ${label}`, type: 'success' });
        } catch {
            kernel.emit('toast', { message: 'Invalid URL', type: 'error' });
        }
    }

    destroy() {
        if (this.root) this.root.remove();
    }
}
