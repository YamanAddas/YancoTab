/**
 * MailApp — the Mail hub.
 *
 * A launcher, not a client. YancoTab declares only the `storage` permission
 * and holds no accounts, so reading mail is impossible by construction:
 * Gmail and Outlook both require OAuth (plus a server for the client secret),
 * and iCloud Mail exposes no public API at any permission level. See the
 * header of os/apps/mail/providerTable.js.
 *
 * What it buys is the thing that actually costs time every day: landing in the
 * *right destination of the right account* in one click — inbox, compose,
 * sent, drafts, starred, or straight into a search result.
 *
 * Shell responsibilities only: load state, wire callbacks, apply updates. All
 * state transitions live in mail/persistence.js, all URL construction in
 * mail/providers.js, all key decisions in mail/keys.js, all ordering in
 * mail/reorder.js, all DOM in mail/view/*.
 *
 * SURGICAL UPDATES
 * ----------------
 * `_render()` runs on init and on a *remote* storage change only. Starring,
 * removing, adding and reordering each touch the one card involved — the old
 * version rebuilt the entire view, every chip in it, for a star toggle.
 */

import { App } from '../core/App.js';
import { el, cssLink } from '../utils/dom.js';
import { isSafeUrl } from '../utils/url.js';
import { showConfirm, showPrompt } from '../ui/components/YancoModal.js';
import {
    buildUrl, searchUrl, supports, getProvider,
    normalizeAccountIndex, MAX_ACCOUNT_INDEX,
} from './mail/providers.js';
import {
    loadState, saveState, addAccount, removeAccount, setDefault,
    reorderAccounts, getDefaultAccount,
} from './mail/persistence.js';
import { buildBoard, buildAccountCard, buildFootnote } from './mail/view/board.js';
import { buildDirectory } from './mail/view/directory.js';
import { buildSearchBar } from './mail/view/searchBar.js';
import { resolveKey } from './mail/keys.js';
import { DragRail } from './mail/dragRail.js';

const LEAVE_MS = 200;

export class MailApp extends App {
    constructor(kernel, pid) {
        super(kernel, pid);
        this.metadata = { name: 'Mail', id: 'mail' };
        this._state = null;
        this._styleLinks = [];
        this._picking = false;
        this._searchAccountId = null;
        this._onKeyDown = null;
        this._drag = null;
        this._searchInput = null;
        this._grid = null;
        this._leaveTimers = new Set();
    }

    async init() {
        this._styleLinks = [cssLink('css/mail.css')];
        this._styleLinks.forEach(l => document.head.appendChild(l));

        this._state = loadState(this.kernel);
        // With nothing pinned there is no board to show, so open straight on
        // the directory: "just get me to Gmail" stays one click, no setup.
        this._picking = this._state.accounts.length === 0;

        this.root = el('div', { class: 'app-window app-mail', tabindex: '0' });
        this._render();

        this._onKeyDown = (e) => this._handleKey(e);
        this.root.addEventListener('keydown', this._onKeyDown);
        requestAnimationFrame(() => this.root?.focus?.());
    }

    /* ── rendering ──────────────────────────────────────────── */

    _render() {
        if (!this.root) return;
        this._teardownDrag();
        this.root.replaceChildren();
        this._searchInput = null;
        this._grid = null;

        const frame = el('div', { class: 'mail-frame' });

        const search = buildSearchBar(this._state.accounts, this._searchAccountId, {
            onSubmit: (account, q) => this._search(account, q),
            onSelect: (id) => { this._searchAccountId = id; this._render(); },
        });
        if (search) {
            frame.appendChild(search.node);
            this._searchInput = search.input;
        }

        if (this._picking) {
            frame.appendChild(buildDirectory({
                onOpen: (provider) => this._openProvider(provider),
                onAdd: (provider) => this._addProvider(provider),
                onCancel: () => this._disarmPicking(),
                // With no accounts there is nothing to go back to, so the
                // directory is the whole app rather than a modal over a board.
                canCancel: this._state.accounts.length > 0,
            }));
        } else {
            const { section, grid } = buildBoard(this._state, this._handlers());
            frame.appendChild(section);
            this._grid = grid;
            this._armDrag();
        }

        frame.appendChild(buildFootnote());
        this.root.appendChild(frame);
    }

    _handlers() {
        return {
            onOpen: (account, kind) => this._open(account, kind),
            onSetDefault: (account) => this._setDefault(account),
            onRemove: (account) => this._removeAccount(account),
            onAdd: () => this._armPicking(),
        };
    }

    _armDrag() {
        if (!this._grid) return;
        this._drag = new DragRail(this._grid, (ids) => this._commitOrder(ids));
    }

    _teardownDrag() {
        // destroy() flushes a pending reorder, so a re-render mid-debounce
        // cannot silently drop it.
        this._drag?.destroy();
        this._drag = null;
    }

    _card(id) {
        return this._grid?.querySelector(`.mail-card[data-account-id="${CSS.escape(id)}"]`) || null;
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
            this.kernel?.emit?.('toast', { message: 'Could not open that destination', type: 'error' });
            return false;
        }
        window.open(url, '_blank', 'noopener,noreferrer');
        return true;
    }

    _open(account, kind = 'inbox') {
        if (!account) return;
        const url = buildUrl(account.providerId, kind, { accountIndex: account.accountIndex });
        if (!this._navigate(url)) return;
        this.kernel?.emit?.('yancotab:activity', {
            label: `Opened *${account.label || account.providerId}*`,
        });
    }

    _openProvider(provider) {
        this._navigate(buildUrl(provider.id, 'inbox', { accountIndex: 0 }));
    }

    /**
     * Search inside a provider.
     *
     * The activity label carries the PROVIDER, never the query. Activity
     * events are persisted to `yancotab_activity_v1`, which is user-data with
     * conditional sync — interpolating the query here would write it to disk
     * and replicate it through chrome.storage.sync. tests/mail-privacy.test.js
     * pins that.
     */
    _search(account, query) {
        if (!account || !query) return;
        const url = searchUrl(account.providerId, query, account.accountIndex);
        if (!url) {
            this.kernel?.emit?.('toast', {
                message: `${getProvider(account.providerId)?.name || 'That provider'} has no search link`,
                type: 'warning',
            });
            return;
        }
        if (!this._navigate(url)) return;
        this.kernel?.emit?.('yancotab:activity', {
            label: `Searched *${getProvider(account.providerId)?.name || 'mail'}*`,
        });
    }

    /* ── account management ─────────────────────────────────── */

    _armPicking() {
        this._picking = true;
        this._render();
    }

    _disarmPicking() {
        if (!this._picking) return false;
        // With nothing pinned the directory IS the app; cancelling would leave
        // an empty window.
        if (!this._state.accounts.length) return false;
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
            if (raw === null) return;
            index = normalizeAccountIndex(raw);
            if (index > MAX_ACCOUNT_INDEX) index = MAX_ACCOUNT_INDEX;
        }

        const label = await showPrompt(
            'Name this account',
            'Something you will recognise at a glance — "work", "personal".',
            provider.name,
            { placeholder: provider.name },
        );
        if (label === null) return;

        const before = this._state.accounts.length;
        const next = addAccount(this._state, {
            providerId: provider.id,
            accountIndex: index,
            label: label || provider.name,
        });

        // addAccount silently refuses past the cap; say so rather than
        // appearing to succeed.
        if (next.accounts.length === before
            && !this._state.accounts.some(a => a.id === `${provider.id}:${index}`)) {
            this.kernel?.emit?.('toast', { message: 'Account list is full', type: 'warning' });
            return;
        }

        this._state = saveState(this.kernel, next);
        this._picking = false;
        this._render();
        this.kernel?.emit?.('toast', { message: `Added ${label || provider.name}`, type: 'success' });
    }

    /**
     * Promote to default — two cards change, so two cards are touched.
     *
     * Rebuilding only the affected cards keeps the drag rail's nodes and the
     * search field's focus intact, which a full re-render would both destroy.
     */
    _setDefault(account) {
        const prevId = this._state.defaultId;
        if (prevId === account.id) return;

        this._state = saveState(this.kernel, setDefault(this._state, account.id));

        for (const id of [prevId, account.id]) {
            if (!id) continue;
            const node = this._card(id);
            const data = this._state.accounts.find(a => a.id === id);
            if (!node || !data) continue;
            const fresh = buildAccountCard(data, this._state, this._handlers());
            if (fresh) node.replaceWith(fresh);
        }
    }

    async _removeAccount(account) {
        const name = account.label || account.providerId;
        const ok = await showConfirm('Remove account', `Remove "${name}" from Mail?`);
        if (!ok) return;

        const wasDefault = this._state.defaultId === account.id;
        // Commit BEFORE animating. A window closed mid-fade must not lose the
        // write; the animation is cosmetic and the state is already gone.
        this._state = saveState(this.kernel, removeAccount(this._state, account.id));

        const node = this._card(account.id);
        if (node) {
            node.classList.add('is-leaving');
            const done = () => {
                node.remove();
                // Removing the default promotes another card, which has to
                // restyle; and an emptied board must fall back to the
                // directory or the window is left blank.
                if (!this._state.accounts.length) { this._picking = true; this._render(); }
                else if (wasDefault) this._render();
            };
            const t = setTimeout(() => { this._leaveTimers.delete(t); done(); }, LEAVE_MS);
            this._leaveTimers.add(t);
        } else {
            this._render();
        }

        this.kernel?.emit?.('toast', { message: 'Account removed', type: 'info' });
    }

    _commitOrder(ids) {
        const next = reorderAccounts(this._state, ids);
        this._state = saveState(this.kernel, next);
    }

    /* ── keyboard ───────────────────────────────────────────── */

    _handleKey(e) {
        const target = e.target;
        const tag = target?.tagName;
        const editable = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
            || target?.isContentEditable === true;

        const accounts = this._state?.accounts || [];
        const def = getDefaultAccount(this._state);

        const intent = resolveKey({
            key: e.key,
            ctrl: e.ctrlKey || e.metaKey,
            alt: e.altKey,
            isComposing: e.isComposing,
            editable,
            searchFocused: !!this._searchInput && target === this._searchInput,
            searchHasText: !!this._searchInput?.value?.trim(),
            picking: this._picking,
            accountCount: accounts.length,
            canCompose: !!def && supports(def.providerId, 'compose'),
            canSearch: accounts.some(a => supports(a.providerId, 'search')),
        });

        switch (intent.type) {
            // `bubble` is not `none`: it means deliberately let the shell see
            // this. That is how the v1.10.6 Escape ladder (blur, then close)
            // reaches Mail without Mail reimplementing it.
            case 'none':
            case 'bubble':
                return;
            case 'clearSearch':
                e.preventDefault();
                if (this._searchInput) this._searchInput.value = '';
                return;
            case 'cancelPick':
                if (this._disarmPicking()) e.preventDefault();
                return;
            case 'focusSearch':
                e.preventDefault();
                this._searchInput?.focus();
                this._searchInput?.select?.();
                return;
            case 'openAccount':
                e.preventDefault();
                this._open(accounts[intent.index], 'inbox');
                return;
            case 'openDefault':
                if (!def) return;
                e.preventDefault();
                this._open(def, 'inbox');
                return;
            case 'compose':
                if (!def) return;
                e.preventDefault();
                this._open(def, 'compose');
                return;
            default:
        }
    }

    /* ── lifecycle ──────────────────────────────────────────── */

    destroy() {
        this._teardownDrag();
        this._leaveTimers.forEach(t => clearTimeout(t));
        this._leaveTimers.clear();
        if (this._onKeyDown && this.root) {
            this.root.removeEventListener('keydown', this._onKeyDown);
        }
        this._onKeyDown = null;
        this._searchInput = null;
        this._grid = null;
        this._styleLinks.forEach(l => l.remove());
        this._styleLinks = [];
        this._state = null;
        super.destroy();
    }
}
