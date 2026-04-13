/**
 * Toast.js — Notification toast system
 * Glass-effect pills at bottom-center. Auto-dismiss. Stackable up to 3.
 *
 * Usage: kernel.emit('toast', { message: 'Saved', type: 'success' })
 * Types: success (green), error (red), info (teal), warning (orange)
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

const MAX_VISIBLE = 3;
const AUTO_DISMISS_MS = 3000;

const TYPE_COLORS = {
    success: 'var(--success, #34c759)',
    error:   'var(--danger, #ff3b30)',
    info:    'var(--accent, #00e5c1)',
    warning: 'var(--warning, #ff9500)',
};

export class ToastManager {
    constructor() {
        this.container = null;
        this._toasts = [];
    }

    init() {
        this.container = el('div', { class: 'toast-container' });
        Object.assign(this.container.style, {
            position: 'fixed',
            bottom: '24px',
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            flexDirection: 'column-reverse',
            gap: '8px',
            alignItems: 'center',
            zIndex: 'var(--z-toast, 800)',
            pointerEvents: 'none',
        });
        document.body.appendChild(this.container);

        kernel.on('toast', (detail) => this.show(detail));
    }

    show({ message, type = 'info' }) {
        if (!message) return;

        // Remove oldest if at limit
        while (this._toasts.length >= MAX_VISIBLE) {
            this._dismiss(this._toasts[0]);
        }

        const color = TYPE_COLORS[type] || TYPE_COLORS.info;

        const toast = el('div', { class: 'toast-pill' });
        Object.assign(toast.style, {
            background: 'var(--bg-panel)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderLeft: `3px solid ${color}`,
            borderRadius: '12px',
            padding: '10px 18px',
            fontSize: '14px',
            color: 'var(--text-bright)',
            boxShadow: 'var(--shadow-md)',
            pointerEvents: 'auto',
            opacity: '0',
            transform: 'translateY(20px)',
            transition: 'opacity 200ms ease-out, transform 200ms ease-out',
            cursor: 'pointer',
            maxWidth: '90vw',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
        });
        toast.textContent = message;
        toast.addEventListener('click', () => this._dismiss(toast));

        this.container.appendChild(toast);
        this._toasts.push(toast);

        // Trigger enter animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateY(0)';
            });
        });

        // Auto-dismiss
        toast._timer = setTimeout(() => this._dismiss(toast), AUTO_DISMISS_MS);
    }

    _dismiss(toast) {
        if (!toast || !toast.parentNode) return;
        if (toast._timer) clearTimeout(toast._timer);

        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => {
            toast.remove();
            this._toasts = this._toasts.filter(t => t !== toast);
        }, 150);
    }
}
