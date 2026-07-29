/**
 * MailApp — the Mail hub.
 *
 * A launcher, not a client. YancoTab declares only the `storage` permission
 * and holds no accounts, so reading mail is impossible by construction:
 * Gmail and Outlook both require OAuth (plus a server for the client secret),
 * and iCloud Mail exposes no public API at any permission level. See the
 * header of os/apps/mail/providers.js.
 *
 * What it does buy you is the thing that actually costs time every day:
 * landing in the *right inbox of the right account* in one click. Gmail
 * addresses accounts by path segment (/mail/u/0/, /mail/u/1/), so pinning
 * "work" and "personal" separately removes the account-switcher round trip.
 *
 * Shell responsibilities only: load state, wire callbacks, re-render. All
 * state transitions live in mail/persistence.js, all URL construction in
 * mail/providers.js, all DOM in mail/mailView.js.
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { isSafeUrl } from '../utils/url.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
import { buildUrl, normalizeAccountIndex, MAX_ACCOUNT_INDEX } from './mail/providers.js';
import {
    loadState, saveState, addAccount, removeAccount, setDefault, getDefaultAccount,
} from './mail/persistence.js';
import {
    buildFrame, buildHero, buildAccountList, buildProviderGrid, buildFootnote,
} from './mail/mailView.js';

export class MailApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Mail', id: 'mail' };
        this._state = null;
        this._styleLinks = [];
        this._picking = false;
        this._onKeyDown = null;
    }

    async init() {
        this._styleLinks = [cssLink('css/mail.css')];
        this._styleLinks.forEach(l => document.head.appendChild(l));

        this._state = loadState(this.kernel);

        this.root = el('div', { class: 'app-window app-mail', tabindex: '0' });
        this._render();

        this._onKeyDown = (e) => this._handleKey(e);
        this.root.addEventListener('keydown', this._onKeyDown);
        // Focus so the shortcuts work without a click first.
        requestAnimationFrame(() => this.root?.focus?.());
    }

    /* ── rendering ──────────────────────────────────────────── */

    _render() {
        if (!this.root) return;
        this.root.replaceChildren();

        const { frame, left, right } = buildFrame();

        const defaultAccount = getDefaultAccount(this._state);

        left.appendChild(buildHero(defaultAccount, {
            onOpen: () => this._open(defaultAccount, 'inbox'),
            onCompose: () => this._open(defaultAccount, 'compose'),
            onPickPrompt: () => this._armPicking(),
        }));

        left.appendChild(buildProviderGrid({
            picking: this._picking,
            // In pick mode the whole tile adds instead of opening, so the user
            // does not have to hunt for the small ⁺ after choosing "Add".
            onOpenProvider: (provider) => {
                if (this._picking) this._addProvider(provider);
                else this._openProvider(provider);
            },
            onAddProvider: (provider) => this._addProvider(provider),
        }));
        left.appendChild(buildFootnote());

        right.appendChild(buildAccountList(this._state, {
            onOpen: (account) => this._open(account, 'inbox'),
            onSetDefault: (account) => this._setDefault(account),
            onRemove: (account) => this._removeAccount(account),
            onAdd: () => this._armPicking(),
        }));

        this.root.appendChild(frame);
    }

    _commit(next) {
        this._state = saveState(this.kernel, next);
        this._render();
    }

    /* ── opening ────────────────────────────────────────────── */

    /**
     * Navigate to a provider URL in a new tab.
     *
     * buildUrl only ever returns an https URL built from a literal template,
     * but this re-checks with the shared allowlist anyway: it is the single
     * exit point to window.open, and a null here must mean "do nothing"
     * rather than "open something else".
     */
    _navigate(url) {
        if (!url || !isSafeUrl(url)) {
            this.kernel?.emit?.('toast', { message: 'Could not open that provider', type: 'error' });
            return;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
    }

    _open(account, kind) {
        if (!account) return;
        this._navigate(buildUrl(account.providerId, account.accountIndex, kind));
        this.kernel?.emit?.('yancotab:activity', {
            label: `Opened *${account.label || account.providerId}*`,
        });
    }

    _openProvider(provider) {
        this._navigate(buildUrl(provider.id, 0, 'inbox'));
    }

    /* ── account management ─────────────────────────────────── */

    _armPicking() {
        this._picking = true;
        this._render();
        this.kernel?.emit?.('toast', {
            message: 'Pick a provider to add — Esc to cancel',
            type: 'info',
        });
    }

    _disarmPicking() {
        if (!this._picking) return false;
        this._picking = false;
        this._render();
        return true;
    }

    /**
     * Add a provider as a pinned account.
     *
     * Asks for the account index only where the provider actually supports one
     * — prompting for "which account" on iCloud would be asking a question
     * with no answer.
     */
    async _addProvider(provider) {
        this._picking = false;

        let index = 0;
        if (provider.accountIndex) {
            const raw = await showPrompt(
                `Add ${provider.name}`,
                `Which signed-in account? ${provider.name} numbers them in the order you `
                + `signed in — 0 is the first. You can change this later.`,
                '0',
                { placeholder: '0' },
            );
            // Cancel (null) aborts; an empty string means "just use the first".
            if (raw === null) { this._render(); return; }
            index = normalizeAccountIndex(raw);
            if (index > MAX_ACCOUNT_INDEX) index = MAX_ACCOUNT_INDEX;
        }

        const label = await showPrompt(
            'Name this account',
            'Something you will recognise at a glance — "work", "personal".',
            provider.name,
            { placeholder: provider.name },
        );
        if (label === null) { this._render(); return; }

        const before = this._state.accounts.length;
        const next = addAccount(this._state, {
            providerId: provider.id,
            accountIndex: index,
            label: label || provider.name,
        });

        // addAccount silently refuses past the cap; say so rather than
        // appearing to succeed.
        if (next.accounts.length === before && before > 0
            && !this._state.accounts.some(a => a.id === `${provider.id}:${index}`)) {
            this.kernel?.emit?.('toast', { message: 'Account list is full', type: 'warning' });
            this._render();
            return;
        }

        this._commit(next);
        this.kernel?.emit?.('toast', { message: `Added ${label || provider.name}`, type: 'success' });
    }

    _setDefault(account) {
        this._commit(setDefault(this._state, account.id));
    }

    async _removeAccount(account) {
        const name = account.label || account.providerId;
        const ok = await showConfirm('Remove account', `Remove "${name}" from Mail?`);
        if (!ok) return;
        this._commit(removeAccount(this._state, account.id));
        this.kernel?.emit?.('toast', { message: 'Account removed', type: 'info' });
    }

    /* ── keyboard ───────────────────────────────────────────── */

    _handleKey(e) {
        if (e.isComposing) return;
        // Never swallow keys while a modal input has focus.
        const tag = e.target?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;

        if (e.key === 'Escape') {
            // Esc first cancels pick mode, and only closes the app if there is
            // nothing to cancel — otherwise arming the picker would trap the user.
            if (this._disarmPicking()) { e.stopPropagation(); e.preventDefault(); }
            return;
        }

        const account = getDefaultAccount(this._state);
        if (!account) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            this._open(account, 'inbox');
        } else if (e.key === 'c' || e.key === 'C') {
            const compose = buildUrl(account.providerId, account.accountIndex, 'compose');
            const inbox = buildUrl(account.providerId, account.accountIndex, 'inbox');
            if (compose && compose !== inbox) {
                e.preventDefault();
                this._open(account, 'compose');
            }
        }
    }

    /* ── lifecycle ──────────────────────────────────────────── */

    destroy() {
        if (this._onKeyDown && this.root) {
            this.root.removeEventListener('keydown', this._onKeyDown);
        }
        this._onKeyDown = null;
        this._styleLinks.forEach(l => l.remove());
        this._styleLinks = [];
        this._state = null;
        super.destroy();
    }
}
