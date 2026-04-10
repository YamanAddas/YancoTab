/**
 * SmartSearch Component
 * Universal search bar for Apps and Web.
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

export class SmartSearch {
    constructor() {
        this.root = el('div', {
            id: 'smart-search-bar',
            class: 'm-search-container'
        });
        this.input = el('input', {
            class: 'm-search-input',
            type: 'text',
            placeholder: 'Smart Search...'
        });

        this.root.appendChild(this.input);
        this.bindEvents();
    }

    bindEvents() {
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.execute(this.input.value);
            }
        });

        // Prevent keyboard collapse loop
        this.input.addEventListener('focus', () => {
            kernel.emit('search:focus', true);
        });

        this.input.addEventListener('blur', () => {
            kernel.emit('search:focus', false);
        });
    }

    execute(query) {
        if (!query.trim()) return;

        // 1. Check for App Launch (e.g. "clock")
        const apps = kernel.getApps();
        const match = apps.find(a => a.name.toLowerCase() === query.toLowerCase());

        if (match) {
            kernel.emit('app:open', match.id);
            this.clear();
            return;
        }

        // 2. Global File Search
        const fs = kernel.getService('fs');
        if (fs) {
            const files = fs.search(query);
            if (files.length > 0) {
                // Current behavior: open first matched file path.
                const first = files[0];
                window.dispatchEvent(new CustomEvent('yancotab:open-file', {
                    detail: {
                        filePath: first.path,
                        content: first.content,
                        fileType: first.type
                    }
                }));
                this.clear();
                return;
            }
        }

        // 3. Web Fallback
        const url = query.startsWith('http')
            ? query
            : `https://www.google.com/search?q=${encodeURIComponent(query)}`;

        window.open(url, '_blank');
        this.clear();
    }

    clear() {
        this.input.value = '';
        this.input.blur();
    }

    render() {
        return this.root;
    }
}
