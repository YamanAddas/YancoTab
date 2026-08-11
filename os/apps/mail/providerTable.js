/**
 * providerTable.js — the webmail registry. Pure data, zero logic.
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
 * right destination of the right account.
 *
 * CAPABILITY IS DECLARED, NOT INFERRED
 * ------------------------------------
 * Each provider carries a `dest` map. **The presence of a key IS the
 * capability.** iCloud has no `compose` key, so `supports('icloud','compose')`
 * is false by construction and the UI never draws the chip.
 *
 * This replaces the old `composeUrl !== inboxUrl` string comparison, which was
 * a capability test written as an equality check — and which forced iCloud's
 * compose entry to be a *copy of its inbox URL*, i.e. a button that claimed to
 * compose and reopened the inbox instead.
 *
 * EVERY URL HERE IS A LITERAL
 * ---------------------------
 * Nothing is built from user input. Exactly two placeholders are substituted,
 * both by providers.js and both constrained there:
 *
 *   {i}  account index — an integer clamped to [0, 9]
 *   {q}  search query  — encodeURIComponent'd
 *
 * Every row must also appear in DESTINATIONS.md with a shippable status;
 * tests/mail-destinations-ledger.test.js fails the suite otherwise. That
 * ledger exists because deep links are **not verifiable by probing**: every
 * provider 302s all unknown paths to its login page (Gmail even echoes the
 * nonsense path back in `continue=`), and the most valuable destinations are
 * hash fragments, which never reach a server at all. Only a signed-in human
 * watching what renders can confirm one.
 *
 * ACCOUNT INDEXES
 * ---------------
 * Gmail multiplexes accounts by path segment — /mail/u/0/, /mail/u/1/ — in the
 * order you signed in. Anyone juggling work + personal + a project address
 * pays a two-click account-switcher tax on every visit; addressing the index
 * directly removes it. Outlook does the same with /mail/0/. Providers without
 * that scheme set `accountIndex: false` and the UI hides the control.
 *
 * BRAND COLOURS
 * -------------
 * `brand` is the one documented exception to "no hardcoded hex" (CLAUDE.md
 * non-negotiable #8): a brand mark that is not the brand's colour is not the
 * brand's mark. It is never the sole carrier of meaning — every plate is
 * accompanied by a text label — so a colourblind or high-contrast user loses
 * nothing. See marks.js for the plate/contrast treatment.
 */

/**
 * @typedef {Object} Provider
 * @property {string}  id            stable key, used in storage
 * @property {string}  name          display name
 * @property {string}  short         1-2 char fallback when no SVG mark exists
 * @property {string}  brand         brand colour — literal, see header
 * @property {'brand'|'light'} plate  plate treatment; see marks.js §plates
 * @property {boolean} accountIndex  whether {i} is meaningful
 * @property {string}  [hint]        rendered as a second line, not a tooltip
 * @property {Object<string,string>} dest  capability map — presence IS support
 */

/**
 * Destination kinds, in the order chips render.
 *
 * Frozen and exported so chip order is a property of this list rather than of
 * each provider's authoring order — otherwise Gmail and Proton would show the
 * same chips in different places purely because of how the table was typed.
 */
export const KINDS = Object.freeze(['inbox', 'compose', 'search', 'starred', 'sent', 'drafts']);

/** Human labels for the chips. */
export const KIND_LABELS = Object.freeze({
    inbox: 'Inbox',
    compose: 'Compose',
    search: 'Search',
    starred: 'Starred',
    sent: 'Sent',
    drafts: 'Drafts',
});

/** @type {Provider[]} */
export const PROVIDERS = [
    {
        id: 'gmail',
        name: 'Gmail',
        short: 'M',
        brand: '#ea4335',
        plate: 'light',
        accountIndex: true,
        dest: {
            inbox: 'https://mail.google.com/mail/u/{i}/',
            compose: 'https://mail.google.com/mail/u/{i}/#inbox?compose=new',
            search: 'https://mail.google.com/mail/u/{i}/#search/{q}',
            starred: 'https://mail.google.com/mail/u/{i}/#starred',
            sent: 'https://mail.google.com/mail/u/{i}/#sent',
            drafts: 'https://mail.google.com/mail/u/{i}/#drafts',
        },
    },
    {
        id: 'outlook',
        name: 'Outlook',
        short: 'O',
        brand: '#0078d4',
        plate: 'light',
        accountIndex: true,
        hint: 'Personal accounts',
        dest: {
            inbox: 'https://outlook.live.com/mail/{i}/',
            // Was 'https://outlook.live.com/mail/{i}/0/deeplink/compose', which
            // substituted to /mail/0/0/deeplink/compose — the account index
            // appeared twice. The second segment was the literal index in the
            // form this was copied from.
            compose: 'https://outlook.live.com/mail/{i}/deeplink/compose',
            sent: 'https://outlook.live.com/mail/{i}/sentitems',
            drafts: 'https://outlook.live.com/mail/{i}/drafts',
        },
    },
    {
        id: 'outlook365',
        name: 'Outlook 365',
        short: 'O',
        brand: '#0f6cbd',
        plate: 'light',
        accountIndex: false,
        hint: 'Work or school accounts',
        dest: {
            inbox: 'https://outlook.office.com/mail/',
            compose: 'https://outlook.office.com/mail/deeplink/compose',
            sent: 'https://outlook.office.com/mail/sentitems',
            drafts: 'https://outlook.office.com/mail/drafts',
        },
    },
    {
        id: 'icloud',
        name: 'iCloud Mail',
        short: '',
        brand: '#3693f3',
        plate: 'light',
        accountIndex: false,
        hint: 'No compose link',
        // Deliberately inbox-only. Absence is the answer — see header.
        dest: {
            inbox: 'https://www.icloud.com/mail',
        },
    },
    {
        id: 'proton',
        name: 'Proton Mail',
        short: 'P',
        brand: '#6d4aff',
        plate: 'brand',
        accountIndex: true,
        dest: {
            inbox: 'https://mail.proton.me/u/{i}/inbox',
            compose: 'https://mail.proton.me/u/{i}/inbox#compose',
            starred: 'https://mail.proton.me/u/{i}/starred',
            sent: 'https://mail.proton.me/u/{i}/sent',
            drafts: 'https://mail.proton.me/u/{i}/drafts',
        },
    },
    {
        id: 'yahoo',
        name: 'Yahoo Mail',
        short: 'Y',
        brand: '#6001d2',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://mail.yahoo.com/d/folders/1',
            compose: 'https://mail.yahoo.com/d/compose',
        },
    },
    {
        id: 'zoho',
        name: 'Zoho Mail',
        short: 'Z',
        brand: '#e42527',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://mail.zoho.com/zm/',
            compose: 'https://mail.zoho.com/zm/#compose',
        },
    },
    {
        id: 'fastmail',
        name: 'Fastmail',
        short: 'F',
        brand: '#0067b9',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://app.fastmail.com/mail/Inbox',
            compose: 'https://app.fastmail.com/mail/compose',
            sent: 'https://app.fastmail.com/mail/Sent',
            drafts: 'https://app.fastmail.com/mail/Drafts',
        },
    },
    {
        id: 'yandex',
        name: 'Yandex Mail',
        short: 'Я',
        brand: '#fc3f1d',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://mail.yandex.com/',
            compose: 'https://mail.yandex.com/compose',
        },
    },
    {
        id: 'gmx',
        name: 'GMX',
        short: 'G',
        brand: '#1c449b',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://navigator-bs.gmx.com/mail',
            compose: 'https://navigator-bs.gmx.com/mail?mailAction=compose',
        },
    },
    {
        id: 'aol',
        name: 'AOL Mail',
        short: 'A',
        brand: '#1e1e1e',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://mail.aol.com/d/folders/1',
            compose: 'https://mail.aol.com/d/compose',
        },
    },
    {
        id: 'tuta',
        name: 'Tuta',
        short: 'T',
        brand: '#840010',
        plate: 'brand',
        accountIndex: false,
        dest: {
            inbox: 'https://app.tuta.com/mail',
            compose: 'https://app.tuta.com/mail/new',
        },
    },
];
