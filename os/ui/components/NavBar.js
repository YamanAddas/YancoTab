/**
 * NavBar.js — Bottom navigation bar (replaces Dock)
 *
 * Provides Home, Files, Games, AI, Settings navigation.
 * Fires 'nav:action' events for the shell to handle.
 */

import { el } from '../../utils/dom.js';

const NAV_ITEMS = [
    {
        id: 'home',
        label: 'Home',
        icon: '<svg viewBox="0 0 256 256"><path d="M219.31,108.68l-80-80a16,16,0,0,0-22.62,0l-80,80A15.87,15.87,0,0,0,32,120v96a8,8,0,0,0,8,8H96a8,8,0,0,0,8-8V160h48v56a8,8,0,0,0,8,8h56a8,8,0,0,0,8-8V120A15.87,15.87,0,0,0,219.31,108.68Z"/></svg>',
    },
    {
        id: 'files',
        label: 'Files',
        icon: '<svg viewBox="0 0 256 256"><path d="M216,72H131.31L104,44.69A15.86,15.86,0,0,0,92.69,40H40A16,16,0,0,0,24,56V200.62A15.4,15.4,0,0,0,39.38,216H216.89A15.13,15.13,0,0,0,232,200.89V88A16,16,0,0,0,216,72Z"/></svg>',
    },
    {
        id: 'games',
        label: 'Games',
        icon: '<svg viewBox="0 0 256 256"><path d="M176,112H152a8,8,0,0,1,0-16h24a8,8,0,0,1,0,16Zm-72-16H80a8,8,0,0,0,0,16h24a8,8,0,0,0,0-16ZM232,56V200a24,24,0,0,1-24,24H48a24,24,0,0,1-24-24V56A24,24,0,0,1,48,32H208A24,24,0,0,1,232,56Z"/></svg>',
    },
    {
        id: 'ai',
        label: 'AI',
        icon: '<svg viewBox="0 0 256 256"><path d="M200,48H136V16a8,8,0,0,0-16,0V48H56A32,32,0,0,0,24,80V192a32,32,0,0,0,32,32H200a32,32,0,0,0,32-32V80A32,32,0,0,0,200,48Zm16,144a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V80A16,16,0,0,1,56,64H200a16,16,0,0,1,16,16Zm-56-48a12,12,0,1,1-12-12A12,12,0,0,1,160,144Zm-52,0a12,12,0,1,1-12-12A12,12,0,0,1,108,144Zm2-40H88a8,8,0,0,1,0-16h22a8,8,0,0,1,0,16Zm56,0H146a8,8,0,0,1,0-16h20a8,8,0,0,1,0,16Z"/></svg>',
    },
    {
        id: 'settings',
        label: 'Settings',
        icon: '<svg viewBox="0 0 256 256"><path d="M128,80a48,48,0,1,0,48,48A48.05,48.05,0,0,0,128,80Zm0,80a32,32,0,1,1,32-32A32,32,0,0,1,128,160Zm109.94-52.79a8,8,0,0,0-3.89-5.4l-29.83-17-.12-33.62a8,8,0,0,0-2.83-6.08,111.91,111.91,0,0,0-36.72-20.67,8,8,0,0,0-6.46.59L128,42.89,97.88,25a8,8,0,0,0-6.47-.6A112.1,112.1,0,0,0,54.73,45.13a8,8,0,0,0-2.83,6.07l-.15,33.65-29.83,17a8,8,0,0,0-3.89,5.4,106.47,106.47,0,0,0,0,41.56,8,8,0,0,0,3.89,5.4l29.83,17,.12,33.63a8,8,0,0,0,2.83,6.08,111.91,111.91,0,0,0,36.72,20.67,8,8,0,0,0,6.46-.59L128,213.11,158.12,231a7.91,7.91,0,0,0,3.9,1,8.09,8.09,0,0,0,2.57-.42,112.1,112.1,0,0,0,36.68-20.73,8,8,0,0,0,2.83-6.07l.15-33.65,29.83-17a8,8,0,0,0,3.89-5.4A106.47,106.47,0,0,0,237.94,107.21Z"/></svg>',
    },
];

export class NavBar {
    constructor() {
        this.root = el('nav', { class: 'nav-bar', 'aria-label': 'Navigation' });
        this._active = 'home';
        this._items = new Map();
    }

    render() {
        this.root.innerHTML = '';

        for (const item of NAV_ITEMS) {
            const navItem = el('div', {
                class: `nav-item${item.id === this._active ? ' active' : ''}`,
                tabindex: '0',
                'data-nav': item.id,
                'aria-label': item.label,
            });

            const iconWrap = el('span', { class: 'nav-icon' });
            iconWrap.innerHTML = item.icon;

            const label = el('span', { class: 'nav-label' }, item.label);

            navItem.append(iconWrap, label);

            navItem.addEventListener('click', () => this._onTap(item.id));
            navItem.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') this._onTap(item.id);
            });

            this._items.set(item.id, navItem);
            this.root.appendChild(navItem);
        }

        return this.root;
    }

    setActive(id) {
        this._active = id;
        for (const [itemId, node] of this._items) {
            node.classList.toggle('active', itemId === id);
        }
    }

    _onTap(id) {
        this.setActive(id);
        window.dispatchEvent(new CustomEvent('nav:action', { detail: { id } }));
    }
}
