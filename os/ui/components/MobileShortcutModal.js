
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

export class MobileShortcutModal {
    constructor(grid) {
        this.grid = grid;
        this.selectedIcon = '🌍'; // Default
    }

    show() {
        const overlay = el('div', {
            style: {
                position: 'fixed',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                zIndex: 10001,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(15px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: 0,
                transition: 'opacity 0.3s'
            }
        });

        // iOS-style Card
        const card = el('div', {
            style: {
                background: 'rgba(30, 30, 30, 0.85)',
                width: '320px',
                padding: '24px',
                borderRadius: '24px',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '20px',
                transform: 'scale(0.95)',
                transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }
        });

        const title = el('h3', {
            style: 'margin: 0; font-size: 20px; text-align: center; font-weight: 600;'
        }, 'New Shortcut');

        // --- ICON PREVIEW ---
        const iconPreview = el('div', {
            style: {
                width: '80px',
                height: '80px',
                borderRadius: '20px',
                backgroundColor: 'rgba(255,255,255,0.1)',
                margin: '0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '40px',
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                boxShadow: '0 10px 20px rgba(0,0,0,0.2)',
                transition: 'all 0.3s'
            }
        }, '🌍');

        // --- INPUTS ---
        const form = el('div', { style: 'display: flex; flexDirection: column; gap: 16px;' });

        const createInput = (id, placeholder) => {
            return el('input', {
                type: 'text',
                placeholder: placeholder,
                style: {
                    background: 'rgba(0,0,0,0.2)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '12px',
                    padding: '14px',
                    color: '#fff',
                    fontSize: '16px',
                    width: '100%',
                    boxSizing: 'border-box',
                    outline: 'none',
                    transition: 'border-color 0.2s'
                }
            });
        };

        const nameInput = createInput('name', 'App Name (e.g. YouTube)');
        const urlInput = createInput('url', 'Website (e.g. youtube.com)');

        // Focus effects
        [nameInput, urlInput].forEach(inp => {
            inp.addEventListener('focus', () => inp.style.borderColor = '#007aff');
            inp.addEventListener('blur', () => inp.style.borderColor = 'rgba(255,255,255,0.1)');
        });

        form.appendChild(nameInput);
        form.appendChild(urlInput);

        // --- SMART LOGIC ---
        const updateIcon = (urlVal) => {
            if (!urlVal) return;

            // Auto-prepend https://
            let cleanUrl = urlVal.trim();
            if (!cleanUrl.startsWith('http') && !cleanUrl.includes('://')) {
                cleanUrl = `https://${cleanUrl}`;
            }

            try {
                const urlObj = new URL(cleanUrl);
                const domain = urlObj.hostname;

                // Fetch High-Res Icon
                const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=256`;

                // Build Image Object to test load
                const img = new Image();
                img.onload = () => {
                    iconPreview.textContent = '';
                    iconPreview.style.backgroundImage = `url(${faviconUrl})`;
                    this.selectedIcon = faviconUrl;
                };
                img.onerror = () => {
                    // Fallback
                    iconPreview.style.backgroundImage = 'none';
                    iconPreview.textContent = '🌍';
                    this.selectedIcon = '🌍';
                };
                img.src = faviconUrl;

                // Auto-Capitalize Name if empty
                if (!nameInput.value) {
                    const name = domain.split('.')[0]; // simple approximate
                    if (name.length > 2) {
                        nameInput.value = name.charAt(0).toUpperCase() + name.slice(1);
                    }
                }

            } catch (e) {
                // Invalid URL ignore
            }
        };

        // Debounce URL input
        let timeout;
        urlInput.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => updateIcon(urlInput.value), 500);
        });

        urlInput.addEventListener('blur', () => updateIcon(urlInput.value));


        // --- BUTTONS ---
        const btnContainer = el('div', { style: 'display: flex; gap: 12px; margin-top: 10px;' });

        const createBtn = (text, primary = false, onClick) => {
            return el('button', {
                style: {
                    flex: 1,
                    padding: '14px',
                    borderRadius: '14px',
                    border: 'none',
                    background: primary ? '#007aff' : 'rgba(255,255,255,0.1)',
                    color: primary ? '#fff' : 'rgba(255,255,255,0.8)',
                    fontWeight: '600',
                    fontSize: '16px',
                    cursor: 'pointer',
                    transition: 'opacity 0.2s'
                },
                onclick: onClick
            }, text);
        };

        const cancelBtn = createBtn('Cancel', false, () => {
            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        });

        const saveBtn = createBtn('Add', true, () => {
            const name = nameInput.value.trim();
            let url = urlInput.value.trim();

            if (!name || !url) {
                // Shake effect
                card.animate([
                    { transform: 'translateX(0)' },
                    { transform: 'translateX(-10px)' },
                    { transform: 'translateX(10px)' },
                    { transform: 'translateX(0)' }
                ], { duration: 300 });
                return;
            }

            // Final URL Normalization
            if (!url.startsWith('http') && !url.includes('://')) {
                url = `https://${url}`;
            }

            const id = 'shortcut-' + Date.now();
            const isScheme = !url.startsWith('http');

            const app = {
                id,
                title: name,
                icon: this.selectedIcon,
                url: isScheme ? null : url,
                scheme: isScheme ? url : null
            };

            this.grid.state.addApp(app);

            // Runtime Register
            const currentApps = kernel.getApps();
            currentApps.push({
                id: app.id,
                name: app.title,
                icon: app.icon,
                url: app.url,
                scheme: app.scheme
            });
            kernel.registerApps(currentApps);

            overlay.style.opacity = '0';
            setTimeout(() => overlay.remove(), 300);
        });

        btnContainer.appendChild(cancelBtn);
        btnContainer.appendChild(saveBtn);

        card.appendChild(title);
        card.appendChild(iconPreview);
        card.appendChild(form);
        card.appendChild(btnContainer);
        overlay.appendChild(card);
        document.body.appendChild(overlay);

        // Animate In
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            card.style.transform = 'scale(1)';
            nameInput.focus();
        });
    }
}

