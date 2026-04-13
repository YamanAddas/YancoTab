/**
 * Onboarding.js — First-run experience
 * 3-step modal: Welcome → Personalize → Done
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';
import { applyThemeMode } from '../../theme/theme.js';

export class Onboarding {
    constructor() {
        this.overlay = null;
        this._step = 1;
        this._name = '';
        this._theme = 'dark';
        this._engine = 'google';
    }

    shouldShow() {
        return !kernel.storage?.load('yancotab_onboarding_done');
    }

    show() {
        this.overlay = el('div', { class: 'onboarding-overlay' });
        Object.assign(this.overlay.style, {
            position: 'fixed', inset: '0', zIndex: '950',
            background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: '0', transition: 'opacity 300ms ease-out',
        });

        document.body.appendChild(this.overlay);
        requestAnimationFrame(() => { this.overlay.style.opacity = '1'; });
        this._render();
    }

    _render() {
        const modal = el('div', { class: 'onboarding-modal' });
        Object.assign(modal.style, {
            background: 'var(--bg-panel)', borderRadius: '20px',
            padding: '40px 32px', maxWidth: '400px', width: '90%',
            textAlign: 'center', border: '1px solid var(--border)',
            boxShadow: 'var(--shadow-lg)',
        });

        if (this._step === 1) this._renderWelcome(modal);
        else if (this._step === 2) this._renderPersonalize(modal);
        else this._renderDone(modal);

        this.overlay.innerHTML = '';
        this.overlay.appendChild(modal);
    }

    _renderWelcome(modal) {
        modal.append(
            el('div', { style: 'font-size:48px;margin-bottom:16px;' }, 'Y'),
            el('h2', { style: 'font-size:28px;font-weight:700;color:var(--text-bright);margin:0 0 12px;' }, 'Welcome to YancoTab'),
            el('p', { style: 'font-size:16px;color:var(--text-dim);margin:0 0 32px;line-height:1.5;' },
                'Your personal desktop in every new tab. Let\'s get you set up.'),
            this._primaryBtn('Get Started', () => { this._step = 2; this._render(); }),
            this._skipLink(),
        );
    }

    _renderPersonalize(modal) {
        const nameInput = el('input', {
            type: 'text', placeholder: 'Your name (optional)',
            value: this._name,
            style: 'width:100%;padding:12px 16px;border-radius:12px;border:1px solid var(--border);background:var(--bg-surface);color:var(--text-bright);font-size:16px;box-sizing:border-box;outline:none;margin-bottom:24px;',
        });
        nameInput.addEventListener('input', (e) => { this._name = e.target.value; });

        modal.append(
            el('h2', { style: 'font-size:20px;font-weight:600;color:var(--text-bright);margin:0 0 20px;' }, 'What should we call you?'),
            nameInput,
            el('div', { style: 'font-size:16px;color:var(--text-bright);margin-bottom:12px;text-align:left;' }, 'Choose your theme'),
            this._radioGroup('theme', [
                { value: 'dark', label: 'Dark' },
                { value: 'light', label: 'Light' },
                { value: 'auto', label: 'Auto' },
            ], this._theme, (v) => { this._theme = v; }),
            el('div', { style: 'font-size:16px;color:var(--text-bright);margin:20px 0 12px;text-align:left;' }, 'Search engine'),
            this._radioGroup('engine', [
                { value: 'google', label: 'Google' },
                { value: 'duck', label: 'DuckDuckGo' },
                { value: 'bing', label: 'Bing' },
            ], this._engine, (v) => { this._engine = v; }),
            el('div', { style: 'margin-top:24px;' }),
            this._primaryBtn('Continue', () => { this._applySettings(); this._step = 3; this._render(); }),
            this._skipLink(),
        );

        // Auto-focus name input
        requestAnimationFrame(() => nameInput.focus());
    }

    _renderDone(modal) {
        modal.append(
            el('div', { style: 'font-size:40px;color:var(--accent);margin-bottom:16px;' }, '\u2713'),
            el('h2', { style: 'font-size:24px;font-weight:600;color:var(--text-bright);margin:0 0 16px;' }, 'You\'re all set!'),
            el('p', { style: 'font-size:14px;color:var(--text-dim);margin:0 0 8px;' }, 'Tap apps to open them.'),
            el('p', { style: 'font-size:14px;color:var(--text-dim);margin:0 0 8px;' }, 'Long-press to rearrange.'),
            el('p', { style: 'font-size:14px;color:var(--text-dim);margin:0 0 24px;' }, 'Search does everything.'),
            this._primaryBtn('Start Using YancoTab', () => this._finish()),
        );

        // Auto-dismiss after 5s
        setTimeout(() => { if (this._step === 3) this._finish(); }, 5000);
    }

    _applySettings() {
        if (this._name) {
            kernel.storage?.save('yancotab_user_name', this._name);
        }
        if (this._theme === 'auto') {
            localStorage.removeItem('yancotab_theme_mode');
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            applyThemeMode(prefersDark ? 'dark' : 'light');
        } else {
            applyThemeMode(this._theme);
        }
        kernel.storage?.save('yancotabSearchEngine', this._engine);
    }

    _finish() {
        kernel.storage?.save('yancotab_onboarding_done', true);
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            setTimeout(() => this.overlay.remove(), 300);
        }
    }

    _primaryBtn(text, onclick) {
        const btn = el('button', {
            type: 'button',
            style: 'display:block;width:100%;padding:14px;background:var(--accent);color:#000;border:none;border-radius:12px;font-size:16px;font-weight:600;cursor:pointer;margin-bottom:12px;',
        }, text);
        btn.addEventListener('click', onclick);
        return btn;
    }

    _skipLink() {
        const link = el('button', {
            type: 'button',
            style: 'background:none;border:none;color:var(--text-dim);font-size:14px;cursor:pointer;padding:8px;',
        }, 'Skip');
        link.addEventListener('click', () => this._finish());
        return link;
    }

    _radioGroup(name, options, current, onChange) {
        const group = el('div', { style: 'display:flex;gap:8px;' });
        for (const opt of options) {
            const btn = el('button', {
                type: 'button',
                style: `flex:1;padding:10px;border-radius:10px;border:1.5px solid ${opt.value === current ? 'var(--accent)' : 'var(--border)'};background:${opt.value === current ? 'var(--accent-bg)' : 'transparent'};color:var(--text-bright);font-size:14px;cursor:pointer;transition:all 0.15s;`,
            }, opt.label);
            btn.addEventListener('click', () => {
                onChange(opt.value);
                // Re-render the group visually
                group.querySelectorAll('button').forEach(b => {
                    b.style.borderColor = 'var(--border)';
                    b.style.background = 'transparent';
                });
                btn.style.borderColor = 'var(--accent)';
                btn.style.background = 'var(--accent-bg)';
            });
            group.appendChild(btn);
        }
        return group;
    }
}
