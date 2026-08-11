/**
 * mail-privacy.test.js
 *
 * "The search query is never stored" has to be enforced, not promised, because
 * the realistic leak is not the URL — it is the activity feed.
 *
 * `kernel.emit('yancotab:activity', …)` events are persisted to
 * `yancotab_activity_v1`, which is registered as `user-data` with
 * `syncPolicy: 'conditional'` — i.e. **replicated through
 * chrome.storage.sync**. An emit that interpolated the query would write what
 * the user searched for to disk AND push it to Google's sync servers. That is
 * the exact mechanism by which the promise quietly becomes false, and it would
 * look completely innocuous in review.
 *
 * So: source-scan. Crude, but it fails on the thing that actually goes wrong.
 * Every check is paired with an anti-vacuity assertion, because a scanner that
 * silently matches nothing passes forever.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const raw = (p) => readFileSync(join(ROOT, p), 'utf8');

const SEARCH_BAR = 'os/apps/mail/view/searchBar.js';
const MAIL_APP = 'os/apps/MailApp.js';

/**
 * Strip comments before scanning.
 *
 * Not optional. The first version of this test scanned the raw source and
 * failed five ways — every hit was its own docblock explaining the rule it was
 * checking for. A comment saying "never store the query" read as storing the
 * query. Same shape as the v1.2.4 scanner that had to blank strings first.
 *
 * String-aware, so `'https://mail.google.com'` is not mistaken for a comment,
 * and `//` preceded by a backslash (an escaped slash inside a regex literal)
 * does not start one either.
 */
function stripComments(src) {
    let out = '';
    let mode = 'code';
    for (let i = 0; i < src.length; i++) {
        const c = src[i];
        const d = src[i + 1];
        if (mode === 'code') {
            if (c === '/' && d === '*') { mode = 'block'; i++; continue; }
            if (c === '/' && d === '/' && src[i - 1] !== '\\') { mode = 'line'; i++; continue; }
            if (c === "'") mode = 'sq';
            else if (c === '"') mode = 'dq';
            else if (c === '`') mode = 'tpl';
            out += c;
            continue;
        }
        if (mode === 'line') { if (c === '\n') { mode = 'code'; out += c; } continue; }
        if (mode === 'block') { if (c === '*' && d === '/') { mode = 'code'; i++; } continue; }
        if (c === '\\') { out += c + (d ?? ''); i++; continue; }
        if ((mode === 'sq' && c === "'") || (mode === 'dq' && c === '"')
            || (mode === 'tpl' && c === '`')) mode = 'code';
        out += c;
    }
    return out;
}

const read = (p) => stripComments(raw(p));

describe('the scanner itself', () => {
    it('removes comments but keeps code and string contents', () => {
        // Anti-vacuity for the anti-vacuity: a stripper that returned '' would
        // make every check below pass forever.
        const src = read(SEARCH_BAR);
        assert.match(src, /export function buildSearchBar/, 'stripped the code away');
        assert.match(raw(SEARCH_BAR), /never stored/, 'fixture changed: no such comment');
        assert.ok(!/never stored/.test(src), 'did not strip the docblock');
    });

    it('does not mistake a URL inside a string for a comment', () => {
        const src = read('os/apps/mail/providerTable.js');
        assert.match(src, /https:\/\/mail\.google\.com/, 'ate a URL');
    });
});

describe('search bar holds nothing', () => {
    const src = read(SEARCH_BAR);

    it('anti-vacuity: the file was actually read and builds the bar', () => {
        assert.ok(src.length > 500, 'searchBar.js is suspiciously small');
        assert.match(src, /export function buildSearchBar/);
    });

    it('imports no storage of any kind', () => {
        assert.ok(!/localStorage/.test(src), 'touches localStorage');
        assert.ok(!/sessionStorage/.test(src), 'touches sessionStorage');
        assert.ok(!/kernel\.storage/.test(src), 'touches kernel.storage');
        assert.ok(!/storage\.(save|load|set|get)/.test(src), 'calls a storage method');
        assert.ok(!/from ['"].*persistence\.js['"]/.test(src), 'imports persistence');
        assert.ok(!/from ['"].*appStorage/.test(src), 'imports appStorage');
    });

    it('names no storage key', () => {
        assert.ok(!/yancotab_/.test(src), 'mentions a yancotab_ storage key');
        assert.ok(!/MAIL_KEY/.test(src), 'imports MAIL_KEY');
    });

    it('keeps no history array of its own', () => {
        assert.ok(!/\brecent(s|Queries)?\b/i.test(src), 'looks like it keeps recents');
        assert.ok(!/\bhistory\b/i.test(src), 'looks like it keeps history');
    });

    it('turns off browser-level autocomplete on the field', () => {
        // The query is deliberately not remembered by us, so the browser must
        // not remember it either — otherwise it reappears in a dropdown.
        assert.match(src, /autocomplete:\s*['"]off['"]/);
    });

    it('does not autofocus — that would kill the 1-9 shortcuts on every open', () => {
        assert.ok(!/autofocus/i.test(src), 'autofocuses');
        assert.ok(!/\.focus\(\)/.test(src), 'focuses itself on build');
    });
});

describe('the activity feed never receives the query', () => {
    const src = read(MAIL_APP);

    it('anti-vacuity: the search path and its activity emit both exist', () => {
        assert.match(src, /_search\s*\(\s*account\s*,\s*query\s*\)/, 'no _search(account, query)');
        const emits = src.match(/yancotab:activity/g) || [];
        assert.ok(emits.length >= 2, `expected >= 2 activity emits, found ${emits.length}`);
    });

    it('no activity emit interpolates the query', () => {
        // Pull every emit call and check its payload for the query variable.
        const calls = src.match(/emit\?\.\(\s*'yancotab:activity'[\s\S]*?\}\);/g) || [];
        assert.ok(calls.length >= 2, `parser found only ${calls.length} emit calls`);
        for (const call of calls) {
            assert.ok(!/\bquery\b/.test(call), `an activity emit mentions query:\n${call}`);
            assert.ok(!/\bq\b/.test(call), `an activity emit mentions q:\n${call}`);
            assert.ok(!/input\.value/.test(call), `an activity emit reads the input:\n${call}`);
        }
    });

    it('the search emit names the provider, not the query', () => {
        const searchBody = src.slice(src.indexOf('_search(account, query)'));
        const emitAt = searchBody.indexOf('yancotab:activity');
        assert.ok(emitAt > -1, 'search path has no activity emit');
        const emit = searchBody.slice(emitAt, emitAt + 260);
        assert.match(emit, /Searched/, 'label does not say what happened');
        assert.match(emit, /getProvider/, 'label is not built from the provider');
        assert.ok(!/query/.test(emit), 'label mentions the query');
    });

    it('no storage write happens anywhere in the search path', () => {
        const start = src.indexOf('_search(account, query)');
        // A CODE marker, not a comment banner — comments are stripped above.
        const end = src.indexOf('_armPicking()', start);
        assert.ok(start > -1 && end > start, 'could not isolate the search path');
        const body = src.slice(start, end);
        assert.ok(!/saveState/.test(body), 'search path calls saveState');
        assert.ok(!/storage\.save/.test(body), 'search path calls storage.save');
        assert.ok(!/localStorage/.test(body), 'search path touches localStorage');
    });
});

describe('mail asks for no new network reach', () => {
    it('no mail module references a remote host', () => {
        // Provider URLs are navigations, not fetches — nothing in Mail may
        // fetch, XHR or open a socket, so no CSP connect-src/img-src change is
        // needed and neither manifest.json nor the index.html meta tag moves.
        const files = [
            MAIL_APP, SEARCH_BAR,
            'os/apps/mail/providers.js',
            'os/apps/mail/providerTable.js',
            'os/apps/mail/marks.js',
            'os/apps/mail/view/mark.js',
            'os/apps/mail/view/board.js',
            'os/apps/mail/view/directory.js',
            'os/apps/mail/dragRail.js',
        ];
        for (const f of files) {
            const src = read(f);
            assert.ok(!/\bfetch\s*\(/.test(src), `${f} calls fetch`);
            assert.ok(!/XMLHttpRequest/.test(src), `${f} uses XHR`);
            assert.ok(!/new WebSocket/.test(src), `${f} opens a socket`);
            assert.ok(!/EventSource/.test(src), `${f} opens an EventSource`);
        }
    });

    it('marks are inline, never fetched favicons', () => {
        const src = read('os/apps/mail/marks.js');
        assert.ok(!/googleusercontent|gstatic|favicon/i.test(src),
            'marks.js reaches for a remote favicon — that breaks offline');
        assert.match(src, /<svg viewBox="0 0 24 24"/, 'marks are not inline svg');
    });
});
