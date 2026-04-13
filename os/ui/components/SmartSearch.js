/**
 * SmartSearch Component — v2.2
 * Universal search bar with fuzzy app matching, dropdown results,
 * search engine preference, and URL safety.
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

const SAFE_SCHEMES = ['https:', 'http:', 'tel:', 'mailto:', 'sms:'];
const MAX_RESULTS = 5;

function scoreMatch(appName, query) {
    const name = appName.toLowerCase();
    const q = query.toLowerCase();
    if (name === q) return 100;              // exact
    if (name.startsWith(q)) return 80;       // prefix
    if (name.includes(q)) return 50;         // substring
    // Initials match (e.g. "ss" → "Spider Solitaire")
    const initials = appName.split(/\s+/).map(w => w[0]?.toLowerCase()).join('');
    if (initials.startsWith(q)) return 40;
    return 0;
}

function isUrlSafe(urlStr) {
    try {
        const parsed = new URL(urlStr);
        return SAFE_SCHEMES.includes(parsed.protocol);
    } catch {
        return false;
    }
}

function getSearchUrl(query) {
    const engine = kernel.storage?.load('yancotabSearchEngine') || 'google';
    const q = encodeURIComponent(query);
    const urls = {
        google: `https://www.google.com/search?q=${q}`,
        duck:   `https://duckduckgo.com/?q=${q}`,
        bing:   `https://www.bing.com/search?q=${q}`,
    };
    return urls[engine] || urls.google;
}

export class SmartSearch {
    constructor() {
        this.root = el('div', {
            id: 'smart-search-bar',
            class: 'm-search-container'
        });
        this.input = el('input', {
            class: 'm-search-input',
            type: 'text',
            placeholder: 'Search, > commands, ! quick notes...',
            autocomplete: 'off',
        });

        this.dropdown = el('div', { class: 'm-search-dropdown' });
        this.dropdown.style.cssText = `
            display:none; position:absolute; top:100%; left:0; right:0;
            max-height:320px; overflow-y:auto; z-index:var(--z-search,700);
            background:var(--bg-panel); border:1px solid var(--border);
            border-radius:0 0 12px 12px; margin-top:-1px;
            backdrop-filter:var(--glass-blur);
        `;

        this.root.style.position = 'relative';
        this.root.appendChild(this.input);
        this.root.appendChild(this.dropdown);

        this._selectedIndex = -1;
        this._results = [];
        this.bindEvents();
    }

    bindEvents() {
        this.input.addEventListener('input', () => this._onInput());

        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                if (this._selectedIndex >= 0 && this._results[this._selectedIndex]) {
                    this._activateResult(this._results[this._selectedIndex]);
                } else {
                    this.execute(this.input.value);
                }
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this._navigate(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this._navigate(-1);
            } else if (e.key === 'Escape') {
                this._hideDropdown();
                this.input.blur();
            }
        });

        this.input.addEventListener('focus', () => {
            kernel.emit('search:focus', true);
            if (this.input.value.trim()) this._onInput();
        });

        this.input.addEventListener('blur', () => {
            kernel.emit('search:focus', false);
            // Delay hide so click on dropdown item registers
            setTimeout(() => this._hideDropdown(), 200);
        });
    }

    _onInput() {
        const raw = this.input.value.trim();
        if (!raw) { this._hideDropdown(); return; }

        // Command mode: > prefix
        if (raw.startsWith('>')) {
            this._buildCommandResults(raw.slice(1).trim());
            return;
        }

        // Quick capture mode: ! prefix
        if (raw.startsWith('!')) {
            const text = raw.slice(1).trim();
            this._results = text
                ? [{ type: 'capture', text, label: `Save "${text}" as a note` }]
                : [{ type: 'capture', text: '', label: 'Type a quick note...' }];
            this._selectedIndex = 0;
            this._renderDropdown();
            return;
        }

        // Normal search mode
        const query = raw;
        const apps = kernel.getApps();
        const scored = apps
            .map(a => ({ app: a, score: scoreMatch(a.name, query) }))
            .filter(s => s.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, MAX_RESULTS);

        this._results = scored.map(s => ({ type: 'app', app: s.app, score: s.score }));

        // File search results
        const fs = kernel.getService('fs');
        if (fs && this._results.length < MAX_RESULTS) {
            const files = fs.search(query);
            for (const f of files.slice(0, MAX_RESULTS - this._results.length)) {
                this._results.push({ type: 'file', file: f });
            }
        }

        // Web search fallback is always last
        this._results.push({ type: 'web', query });

        this._selectedIndex = -1;
        this._renderDropdown();
    }

    _buildCommandResults(cmd) {
        const COMMANDS = [
            { match: ['new note', 'note'], label: 'New note', action: 'new-note', arg: cmd.replace(/^(new\s+)?note\s*/i, '') },
            { match: ['add todo', 'todo'], label: 'Add todo', action: 'add-todo', arg: cmd.replace(/^(add\s+)?todo\s*/i, '') },
            { match: ['dark'], label: 'Switch to dark mode', action: 'theme-dark' },
            { match: ['light'], label: 'Switch to light mode', action: 'theme-light' },
            { match: ['export'], label: 'Export all data', action: 'export' },
        ];

        const q = cmd.toLowerCase();
        this._results = COMMANDS
            .filter(c => !q || c.match.some(m => m.startsWith(q) || q.startsWith(m)))
            .map(c => ({ type: 'command', label: c.label, action: c.action, arg: c.arg || '' }));

        if (this._results.length === 0) {
            this._results = [{ type: 'command', label: 'No matching command', action: null }];
        }

        this._selectedIndex = 0;
        this._renderDropdown();
    }

    _renderDropdown() {
        this.dropdown.innerHTML = '';
        if (this._results.length === 0) { this._hideDropdown(); return; }

        this._results.forEach((result, i) => {
            const row = el('div', { class: 'm-search-result' });
            row.style.cssText = `
                display:flex; align-items:center; gap:10px; padding:10px 14px;
                cursor:pointer; height:48px; box-sizing:border-box;
                color:var(--text-bright); font-size:14px;
                transition:background 0.1s;
            `;

            if (result.type === 'app') {
                const icon = el('span', { style: 'font-size:20px;flex-shrink:0;width:24px;text-align:center;' },
                    result.app.icon || '');
                const name = el('span', {}, result.app.name);
                const badge = el('span', {
                    style: 'margin-left:auto;font-size:11px;color:var(--text-dim);padding:2px 6px;background:var(--accent-bg);border-radius:4px;'
                }, 'App');
                row.append(icon, name, badge);
            } else if (result.type === 'file') {
                const icon = el('span', { style: 'font-size:20px;flex-shrink:0;width:24px;text-align:center;' }, '');
                const name = el('span', {}, result.file.path.split('/').pop());
                const badge = el('span', {
                    style: 'margin-left:auto;font-size:11px;color:var(--text-dim);padding:2px 6px;background:var(--accent-bg);border-radius:4px;'
                }, 'File');
                row.append(icon, name, badge);
            } else if (result.type === 'command') {
                const icon = el('span', { style: 'font-size:20px;flex-shrink:0;width:24px;text-align:center;' }, '>');
                const name = el('span', {}, result.label);
                const badge = el('span', {
                    style: 'margin-left:auto;font-size:11px;color:var(--text-dim);padding:2px 6px;background:var(--accent-bg);border-radius:4px;'
                }, 'Cmd');
                row.append(icon, name, badge);
            } else if (result.type === 'capture') {
                const icon = el('span', { style: 'font-size:20px;flex-shrink:0;width:24px;text-align:center;' }, '!');
                const name = el('span', {}, result.label);
                const badge = el('span', {
                    style: 'margin-left:auto;font-size:11px;color:var(--text-dim);padding:2px 6px;background:var(--accent-bg);border-radius:4px;'
                }, 'Note');
                row.append(icon, name, badge);
            } else {
                const icon = el('span', { style: 'font-size:20px;flex-shrink:0;width:24px;text-align:center;' }, '');
                const engineName = kernel.storage?.load('yancotabSearchEngine') || 'google';
                const label = { google: 'Google', duck: 'DuckDuckGo', bing: 'Bing' }[engineName] || 'Google';
                const name = el('span', {}, `Search "${result.query}" on ${label}`);
                const badge = el('span', {
                    style: 'margin-left:auto;font-size:11px;color:var(--text-dim);padding:2px 6px;background:var(--accent-bg);border-radius:4px;'
                }, 'Web');
                row.append(icon, name, badge);
            }

            if (i === this._selectedIndex) {
                row.style.background = 'var(--accent-bg)';
            }

            row.addEventListener('mouseenter', () => {
                this._selectedIndex = i;
                this._highlightSelected();
            });
            row.addEventListener('click', () => this._activateResult(result));

            this.dropdown.appendChild(row);
        });

        this.dropdown.style.display = 'block';
    }

    _hideDropdown() {
        this.dropdown.style.display = 'none';
        this._results = [];
        this._selectedIndex = -1;
    }

    _navigate(dir) {
        if (this._results.length === 0) return;
        this._selectedIndex = Math.max(-1, Math.min(this._results.length - 1, this._selectedIndex + dir));
        this._highlightSelected();
    }

    _highlightSelected() {
        const rows = this.dropdown.querySelectorAll('.m-search-result');
        rows.forEach((row, i) => {
            row.style.background = i === this._selectedIndex ? 'var(--accent-bg)' : '';
        });
    }

    _activateResult(result) {
        if (result.type === 'app') {
            kernel.emit('app:open', result.app.id);
        } else if (result.type === 'file') {
            window.dispatchEvent(new CustomEvent('yancotab:open-file', {
                detail: { filePath: result.file.path, content: result.file.content, fileType: result.file.type }
            }));
        } else if (result.type === 'command') {
            this._executeCommand(result);
        } else if (result.type === 'capture') {
            this._quickCapture(result.text);
        } else {
            const url = getSearchUrl(result.query);
            window.open(url, '_blank', 'noopener,noreferrer');
        }
        this.clear();
    }

    _executeCommand(cmd) {
        if (!cmd.action) return;
        const { applyThemeMode } = (() => { try { return { applyThemeMode: null }; } catch { return {}; } })();

        switch (cmd.action) {
            case 'new-note': {
                const title = cmd.arg || 'Untitled';
                const fs = kernel.getService('fs');
                if (fs) {
                    const path = `/home/documents/${title}.txt`;
                    if (!fs.exists(path)) fs.write(path, '');
                }
                kernel.emit('app:open', 'notes');
                kernel.emit('toast', { message: `Note "${title}" created`, type: 'success' });
                break;
            }
            case 'add-todo': {
                if (!cmd.arg) { kernel.emit('app:open', 'todo'); break; }
                const data = kernel.storage?.load('yancotab_todo_v1');
                if (data?.lists?.[0]) {
                    data.lists[0].tasks.push({ text: cmd.arg, done: false, dueDate: null, position: Date.now() });
                    kernel.storage.save('yancotab_todo_v1', data);
                    kernel.emit('toast', { message: `Todo added: ${cmd.arg}`, type: 'success' });
                } else {
                    kernel.emit('app:open', 'todo');
                }
                break;
            }
            case 'theme-dark':
                import('../../theme/theme.js').then(m => m.applyThemeMode('dark'));
                kernel.emit('toast', { message: 'Switched to dark mode', type: 'info' });
                break;
            case 'theme-light':
                import('../../theme/theme.js').then(m => m.applyThemeMode('light'));
                kernel.emit('toast', { message: 'Switched to light mode', type: 'info' });
                break;
            case 'export':
                kernel.emit('app:open', 'settings');
                kernel.emit('toast', { message: 'Open Settings → Data to export', type: 'info' });
                break;
        }
    }

    _quickCapture(text) {
        if (!text) return;
        const fs = kernel.getService('fs');
        if (fs) {
            const ts = new Date().toISOString().slice(0, 16).replace('T', ' ');
            const path = `/home/documents/Quick Note ${ts}.txt`;
            fs.write(path, text);
            kernel.emit('toast', { message: 'Note captured', type: 'success' });
        }
    }

    execute(query) {
        if (!query.trim()) return;

        // Check if it looks like a URL
        if (/^https?:\/\//i.test(query)) {
            if (isUrlSafe(query)) {
                window.open(query, '_blank', 'noopener,noreferrer');
            }
            this.clear();
            return;
        }

        // Find best app match
        const apps = kernel.getApps();
        const best = apps
            .map(a => ({ app: a, score: scoreMatch(a.name, query) }))
            .filter(s => s.score >= 80)
            .sort((a, b) => b.score - a.score)[0];

        if (best) {
            kernel.emit('app:open', best.app.id);
            this.clear();
            return;
        }

        // File search
        const fs = kernel.getService('fs');
        if (fs) {
            const files = fs.search(query);
            if (files.length > 0) {
                window.dispatchEvent(new CustomEvent('yancotab:open-file', {
                    detail: { filePath: files[0].path, content: files[0].content, fileType: files[0].type }
                }));
                this.clear();
                return;
            }
        }

        // Web fallback
        const url = getSearchUrl(query);
        window.open(url, '_blank', 'noopener,noreferrer');
        this.clear();
    }

    clear() {
        this.input.value = '';
        this._hideDropdown();
        this.input.blur();
    }

    render() {
        return this.root;
    }
}
