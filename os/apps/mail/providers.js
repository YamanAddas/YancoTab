/**
 * providers.js — the webmail registry.
 *
 * WHAT THIS CAN AND CANNOT DO
 * ---------------------------
 * These are deep links, not inbox connections. YancoTab declares only the
 * `storage` permission and holds no accounts, so unread counts and message
 * previews are off the table by construction:
 *
 *   • Gmail  — needs OAuth2 + the `identity` permission + a client secret,
 *              which means a server. The old /mail/feed/atom unread feed
 *              needed host permissions and is long gone.
 *   • Outlook— needs Microsoft Graph OAuth, same problem.
 *   • iCloud — has no public mail API at all, at any permission level.
 *
 * So the value here is speed of access, not inbox sync: one keystroke to the
 * right inbox of the right account, and one to a blank compose window.
 *
 * ACCOUNT INDEXES
 * ---------------
 * Gmail multiplexes accounts by path segment — /mail/u/0/, /mail/u/1/ — in the
 * order you signed in. Anyone juggling work + personal + a project address
 * pays a two-click account-switcher tax on every visit; addressing the index
 * directly removes it. Outlook does the same with /mail/0/. Providers without
 * that scheme set `accountIndex: false` and the UI hides the control.
 *
 * Every URL here is a literal in this file. Nothing is ever built from user
 * input, and buildUrl() re-validates against this table before returning, so
 * a tampered storage entry cannot turn into an arbitrary navigation.
 */

/**
 * @typedef {Object} Provider
 * @property {string}  id           stable key, used in storage
 * @property {string}  name         display name
 * @property {string}  short        1-2 char mark for the tile
 * @property {string}  brand        brand colour, for the tile tint only
 * @property {string}  inbox        inbox URL template; {i} = account index
 * @property {string}  compose      compose URL template; {i} = account index
 * @property {boolean} accountIndex whether {i} is meaningful
 * @property {string}  [hint]       shown in the picker when a provider needs a caveat
 */

/** @type {Provider[]} */
export const PROVIDERS = [
    {
        id: 'gmail',
        name: 'Gmail',
        short: 'M',
        brand: '#ea4335',
        inbox: 'https://mail.google.com/mail/u/{i}/',
        compose: 'https://mail.google.com/mail/u/{i}/#inbox?compose=new',
        accountIndex: true,
    },
    {
        id: 'outlook',
        name: 'Outlook',
        short: 'O',
        brand: '#0078d4',
        inbox: 'https://outlook.live.com/mail/{i}/',
        compose: 'https://outlook.live.com/mail/{i}/0/deeplink/compose',
        accountIndex: true,
        hint: 'Personal accounts (outlook.com, hotmail.com, live.com)',
    },
    {
        id: 'outlook365',
        name: 'Outlook 365',
        short: 'O',
        brand: '#0f6cbd',
        inbox: 'https://outlook.office.com/mail/',
        compose: 'https://outlook.office.com/mail/deeplink/compose',
        accountIndex: false,
        hint: 'Work or school accounts',
    },
    {
        id: 'icloud',
        name: 'iCloud Mail',
        short: '',
        brand: '#3693f3',
        inbox: 'https://www.icloud.com/mail',
        compose: 'https://www.icloud.com/mail',
        accountIndex: false,
        hint: 'Opens the iCloud web app — Apple exposes no compose deep link',
    },
    {
        id: 'proton',
        name: 'Proton Mail',
        short: 'P',
        brand: '#6d4aff',
        inbox: 'https://mail.proton.me/u/{i}/inbox',
        compose: 'https://mail.proton.me/u/{i}/inbox#compose',
        accountIndex: true,
    },
    {
        id: 'yahoo',
        name: 'Yahoo Mail',
        short: 'Y',
        brand: '#6001d2',
        inbox: 'https://mail.yahoo.com/d/folders/1',
        compose: 'https://mail.yahoo.com/d/compose',
        accountIndex: false,
    },
    {
        id: 'zoho',
        name: 'Zoho Mail',
        short: 'Z',
        brand: '#e42527',
        inbox: 'https://mail.zoho.com/zm/',
        compose: 'https://mail.zoho.com/zm/#compose',
        accountIndex: false,
    },
    {
        id: 'fastmail',
        name: 'Fastmail',
        short: 'F',
        brand: '#0067b9',
        inbox: 'https://app.fastmail.com/mail/Inbox',
        compose: 'https://app.fastmail.com/mail/compose',
        accountIndex: false,
    },
    {
        id: 'yandex',
        name: 'Yandex Mail',
        short: 'Я',
        brand: '#fc3f1d',
        inbox: 'https://mail.yandex.com/',
        compose: 'https://mail.yandex.com/compose',
        accountIndex: false,
    },
    {
        id: 'gmx',
        name: 'GMX',
        short: 'G',
        brand: '#1c449b',
        inbox: 'https://navigator-bs.gmx.com/mail',
        compose: 'https://navigator-bs.gmx.com/mail?mailAction=compose',
        accountIndex: false,
    },
    {
        id: 'aol',
        name: 'AOL Mail',
        short: 'A',
        brand: '#1e1e1e',
        inbox: 'https://mail.aol.com/d/folders/1',
        compose: 'https://mail.aol.com/d/compose',
        accountIndex: false,
    },
    {
        id: 'tuta',
        name: 'Tuta',
        short: 'T',
        brand: '#840010',
        inbox: 'https://app.tuta.com/mail',
        compose: 'https://app.tuta.com/mail/new',
        accountIndex: false,
    },
];

const BY_ID = new Map(PROVIDERS.map(p => [p.id, p]));

/** @returns {Provider|null} */
export function getProvider(id) {
    return BY_ID.get(id) || null;
}

/** Providers that support /u/{i} style account addressing. */
export function supportsAccountIndex(id) {
    return !!getProvider(id)?.accountIndex;
}

/**
 * Resolve a provider + account index to a real URL.
 *
 * @param {string} providerId
 * @param {number} accountIndex
 * @param {'inbox'|'compose'} kind
 * @returns {string|null} null when the provider is unknown — callers must
 *   treat null as "do not navigate" rather than falling back to a guess.
 */
export function buildUrl(providerId, accountIndex = 0, kind = 'inbox') {
    const provider = getProvider(providerId);
    if (!provider) return null;

    const template = kind === 'compose' ? provider.compose : provider.inbox;
    const index = provider.accountIndex ? normalizeAccountIndex(accountIndex) : 0;
    const url = template.replace('{i}', String(index));

    // The templates above are literals, but this function is the single exit
    // point to window.open — so it re-checks rather than trusting that no
    // future edit ever introduces a non-https target.
    return url.startsWith('https://') ? url : null;
}

/**
 * Coerce anything to a usable account index.
 *
 * Guards the real failure modes: a hand-edited storage blob, a NaN from
 * parseInt on an empty field, a float, a negative, or an absurd value. Gmail
 * itself tops out well below 10 signed-in accounts.
 */
export const MAX_ACCOUNT_INDEX = 9;

export function normalizeAccountIndex(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(MAX_ACCOUNT_INDEX, Math.max(0, Math.trunc(n)));
}
