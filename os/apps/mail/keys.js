/**
 * keys.js — the Mail keyboard map, as a pure function.
 *
 * No DOM, no events, no side effects: MailApp reads the event, builds a
 * context object, and does what the returned intent says. That split is what
 * makes the whole matrix testable, and it also makes one specific ordering bug
 * structurally impossible (below).
 *
 * THE ESCAPE CONTRACT (v1.10.6)
 * -----------------------------
 * The shell resolves Escape in one place: `escapeAction` in
 * os/ui/shellShortcuts.js, as ignore → blur → close.
 *
 *   1. defaultPrevented already → the app handled it, shell does nothing
 *   2. focus is in a text field → blur it (a second Escape then closes)
 *   3. otherwise                → close the focused window
 *
 * So an app says "mine" by calling preventDefault() and **nothing else**.
 * MailApp used to also call stopPropagation(), which predates that contract;
 * keeping both would leave one app relying on the old mechanism, which is how
 * the next divergence starts. `bubble` below is the deliberate opposite: do
 * nothing *and let the event reach the shell*, so Mail inherits stages 2 and 3
 * by declining to handle rather than by reimplementing them.
 *
 * THE ORDERING BUG THIS DESIGN PREVENTS
 * -------------------------------------
 * The old handler bailed on INPUT/TEXTAREA *before* looking at Escape. The
 * moment a search field exists, "Escape clears the search" becomes dead code
 * under that ordering. Here `editable` is an input to the decision rather than
 * an early return, so the two rules cannot get out of order.
 */

/**
 * @typedef {Object} KeyContext
 * @property {string}  key             KeyboardEvent.key
 * @property {boolean} [ctrl]          ctrlKey || metaKey
 * @property {boolean} [alt]
 * @property {boolean} [isComposing]   IME mid-composition
 * @property {boolean} [editable]      focus is in an input/textarea/contenteditable
 * @property {boolean} [searchFocused] focus is specifically the Mail search field
 * @property {boolean} [searchHasText]
 * @property {boolean} [picking]       the provider directory is armed for "add"
 * @property {number}  [accountCount]
 * @property {boolean} [canCompose]    the default account declares a compose dest
 * @property {boolean} [canSearch]     any account declares a search dest
 */

/**
 * @typedef {{type:'none'}
 *   | {type:'bubble'}
 *   | {type:'clearSearch'}
 *   | {type:'cancelPick'}
 *   | {type:'focusSearch'}
 *   | {type:'openAccount', index:number}
 *   | {type:'openDefault'}
 *   | {type:'compose'}} KeyIntent
 */

const NONE = { type: 'none' };
const BUBBLE = { type: 'bubble' };

/**
 * @param {KeyContext} ctx
 * @returns {KeyIntent}
 */
export function resolveKey(ctx = {}) {
    const {
        key, ctrl = false, alt = false, isComposing = false,
        editable = false, searchFocused = false, searchHasText = false,
        picking = false, accountCount = 0, canCompose = false, canSearch = false,
    } = ctx;

    if (typeof key !== 'string' || !key) return NONE;
    // Mid-composition every keystroke belongs to the IME, Escape included.
    if (isComposing) return NONE;
    // Modified keys belong to the browser or the shell, and this has to sit
    // ABOVE the Escape branch: with it below, Ctrl+Escape reached the search
    // field and cleared it — a modified key doing an unmodified key's job.
    if (ctrl || alt) return NONE;

    if (key === 'Escape') {
        // Clearing a typed query is a real cancel, so Mail claims it.
        if (searchFocused && searchHasText) return { type: 'clearSearch' };
        // An *empty* focused search is deliberately not handled: letting it
        // bubble gives the shell's stage-2 blur, so the key that dismisses a
        // typo is not also the key that tears the window down.
        if (searchFocused) return BUBBLE;
        // Cancelling the picker before closing the window — otherwise arming
        // the directory would trap the user with no way back.
        if (picking) return { type: 'cancelPick' };
        return BUBBLE;
    }

    // Typing always wins. Below this line nothing fires inside a text field.
    if (editable) return NONE;

    if (key === '/' && canSearch) return { type: 'focusSearch' };

    if (key.length === 1 && key >= '1' && key <= '9') {
        const index = key.charCodeAt(0) - 49; // '1' → 0
        // Number, not just a comparison: `0 < Infinity` is true, so a bare
        // `index < accountCount` would happily open accounts[0] of a list
        // whose length was reported as Infinity.
        const count = Number.isInteger(accountCount) ? accountCount : 0;
        // Past the end is deliberately inert rather than wrapping: a silent
        // jump to account 1 reads as the key having done something else.
        return index < count ? { type: 'openAccount', index } : NONE;
    }

    if ((key === 'c' || key === 'C') && canCompose) return { type: 'compose' };
    if (key === 'Enter') return { type: 'openDefault' };

    return NONE;
}
