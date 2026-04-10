import { el } from '../../utils/dom.js';

export class HomeBar {
    constructor(onHome) {
        this.onHome = onHome;
        this.root = null;
        this.enabled = this._isStandaloneWebApp();
    }

    render() {
        this.root = el('div', { class: 'home-bar-container' });
        this.root.classList.add(this.enabled ? 'is-enabled' : 'is-disabled');
        this.root.setAttribute('aria-hidden', this.enabled ? 'false' : 'true');

        const hit = el('button', {
            class: 'home-bar-hit',
            type: 'button',
            'aria-label': 'Go Home',
        });
        const bar = el('span', { class: 'home-bar-pill' });
        hit.appendChild(bar);
        this.root.appendChild(hit);

        if (!this.enabled) return this.root;

        // Tap and short upward swipe share the same home action.
        let startY = 0;
        hit.addEventListener('pointerdown', (e) => {
            startY = e.clientY;
        }, { passive: true });

        hit.addEventListener('pointerup', (e) => {
            const diff = startY - e.clientY;
            if (diff > 8 || Math.abs(diff) <= 8) {
                if (this.onHome) this.onHome();
            }
        }, { passive: true });

        return this.root;
    }

    isEnabled() {
        return this.enabled;
    }

    _isStandaloneWebApp() {
        try {
            if (window.matchMedia?.('(display-mode: standalone)').matches) return true;
            if (window.matchMedia?.('(display-mode: fullscreen)').matches) return true;
            if (window.matchMedia?.('(display-mode: minimal-ui)').matches) return true;
            if (typeof navigator.standalone === 'boolean' && navigator.standalone) return true;
        } catch (e) {
            // Best-effort detection only.
        }
        return false;
    }
}
