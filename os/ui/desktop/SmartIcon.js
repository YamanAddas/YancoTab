import { el } from "../../utils/dom.js";
import { FolderIcon } from "../components/FolderIcon.js";
import { GAME_ICONS } from "../components/GameIcons.js";
import { PHOSPHOR_ICONS } from "../components/PhosphorIcons.js";
import { getCategoryColor } from "../icons/AppIcons.js";

/**
 * SmartIcon Component — v2.0 Hex
 * Renders hexagonal icons with the YancoHub cosmic glass design language.
 * Each icon uses clip-path: var(--hex-clip) for the signature hex shape.
 */
export class SmartIcon {
    constructor(appId, metadata = {}) {
        this.appId = appId;
        this.metadata = metadata;
        this.root = null;
        this.intervals = [];
    }

    render() {
        // 1. Base hex container
        this.root = el("div", {
            class: `hex-icon app-icon-${this.appId}`,
            "data-app-id": this.appId,
            title: this.metadata.name || this.appId
        });

        // 2. Inner content area (clipped by hex shape)
        const isLight = document.body.classList.contains('theme-light');
        const catColor = getCategoryColor(this.appId, isLight);
        const contentWrapper = el("div", {
            class: "hex-icon-content",
            style: { backgroundColor: catColor }
        });

        // 3. Render content based on type
        if (this.metadata.type === 'folder' || this.appId.startsWith('folder')) {
            const folderIcon = new FolderIcon({ id: this.appId, title: this.metadata.name }, this.metadata.children || []);
            return folderIcon.render();
        }

        // Phosphor duotone icons for standard apps
        const phosphorKey = SmartIcon._phosphorMap[this.appId];
        if (phosphorKey && PHOSPHOR_ICONS[phosphorKey]) {
            this._renderPhosphor(contentWrapper, phosphorKey);
        } else if (this.appId === "clock") {
            this.renderClock(contentWrapper);
        } else if (this._renderGameIcon(contentWrapper)) {
            // Handled by unified game icon renderer
        } else if (this.appId === "calendar" || this.appId === "date") {
            this.renderCalendar(contentWrapper);
        } else {
            this.renderStatic(contentWrapper);
        }

        this.root.appendChild(contentWrapper);

        // 4. Add Badges (if any)
        if (this.metadata.badge) {
            this.root.appendChild(el("div", { class: "smart-badge" }, String(this.metadata.badge)));
        }

        return this.root;
    }

    renderStatic(container) {
        if (this.metadata.icon && (this.metadata.icon.includes("/") || this.metadata.icon.startsWith("data:"))) {
            const img = el("img", {
                src: this.metadata.icon,
                draggable: false,
                style: { width: "100%", height: "100%", objectFit: "cover", userSelect: "none" }
            });
            img.ondragstart = (e) => e.preventDefault();
            container.appendChild(img);
        } else if (this.metadata.icon) {
            try {
                // Check if it looks like HTML/SVG
                if (this.metadata.icon.trim().startsWith('<')) {
                    container.innerHTML = this.metadata.icon;
                    const svg = container.querySelector('svg');
                    if (svg) {
                        svg.style.width = "60%";
                        svg.style.height = "60%";
                        svg.style.color = "#fff";
                        svg.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.2))";
                    }
                } else {
                    // Just text/emoji
                    container.textContent = this.metadata.icon;
                    container.style.fontSize = "32px";
                }
            } catch (e) {
                container.textContent = this.metadata.icon;
                container.style.fontSize = "32px";
            }
        } else {
            container.textContent = "📦";
            container.style.fontSize = "32px";
        }

        // Flex center by default for static content
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
    }

    renderClock(container) {
        // Live Analog Clock
        const face = el("div", { class: "smart-clock-face" });
        const hourHand = el("div", { class: "smart-clock-hand smart-clock-hour" });
        const minHand = el("div", { class: "smart-clock-hand smart-clock-minute" });
        const secHand = el("div", { class: "smart-clock-hand smart-clock-second" });
        const dot = el("div", { class: "smart-clock-dot" });

        face.append(hourHand, minHand, secHand, dot);
        container.appendChild(face);

        const update = () => {
            const now = new Date();
            const sec = now.getSeconds();
            const min = now.getMinutes();
            const hour = now.getHours();

            const secDeg = ((sec / 60) * 360);
            const minDeg = ((min / 60) * 360) + ((sec / 60) * 6);
            const hourDeg = ((hour % 12) / 12 * 360) + ((min / 60) * 30);

            secHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
            minHand.style.transform = `translateX(-50%) rotate(${minDeg}deg)`;
            hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
        };

        update();
        const timer = setInterval(update, 1000);
        this.intervals.push(timer);
    }

    renderCalendar(container) {
        // Dynamic Calendar Icon
        const now = new Date();
        const day = now.toLocaleString('en-US', { weekday: 'short' });
        const date = now.getDate();

        const cal = el("div", { class: "smart-calendar" }, [
            el("div", { class: "smart-calendar-header" }, day),
            el("div", { class: "smart-calendar-body" }, String(date))
        ]);

        container.appendChild(cal);
    }

    renderPhotos(container) {
        // Premium glass photo stack (lightweight SVG)
        container.classList.add("smart-photos");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.innerHTML = `
            <svg viewBox="0 0 64 64" width="72%" height="72%" aria-hidden="true">
              <defs>
                <linearGradient id="phGlass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="rgba(255,255,255,0.55)"/>
                  <stop offset="1" stop-color="rgba(255,255,255,0.10)"/>
                </linearGradient>
                <linearGradient id="phSky" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#6ee7ff"/>
                  <stop offset="1" stop-color="#2b5cff"/>
                </linearGradient>
              </defs>

              <!-- back card -->
              <g transform="translate(6,10) rotate(-8 26 22)">
                <rect x="6" y="6" width="40" height="40" rx="10" fill="rgba(0,0,0,0.25)"/>
                <rect x="4" y="4" width="40" height="40" rx="10" fill="url(#phGlass)" stroke="rgba(255,255,255,0.25)"/>
              </g>

              <!-- front card -->
              <g transform="translate(12,8)">
                <rect x="10" y="8" width="36" height="36" rx="10" fill="rgba(0,0,0,0.30)"/>
                <rect x="8" y="6" width="36" height="36" rx="10" fill="url(#phGlass)" stroke="rgba(255,255,255,0.30)"/>
                <rect x="12" y="12" width="28" height="18" rx="6" fill="url(#phSky)"/>
                <path d="M12 30 L20 22 L26 28 L30 25 L40 34 L12 34 Z" fill="rgba(255,255,255,0.35)"/>
                <circle cx="34" cy="20" r="3" fill="rgba(255,255,255,0.65)"/>
                <!-- shine -->
                <path d="M14 14 C22 10, 28 10, 40 14" stroke="rgba(255,255,255,0.35)" stroke-width="2" fill="none" stroke-linecap="round"/>
              </g>
            </svg>
        `;
    }

    renderMaps(container) {
        // Folded map + pin (lightweight SVG)
        container.classList.add("smart-maps");
        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
        container.innerHTML = `
            <svg viewBox="0 0 64 64" width="74%" height="74%" aria-hidden="true">
              <defs>
                <linearGradient id="mpGlass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stop-color="rgba(255,255,255,0.55)"/>
                  <stop offset="1" stop-color="rgba(255,255,255,0.10)"/>
                </linearGradient>
                <linearGradient id="mpLand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#46f3a8"/>
                  <stop offset="1" stop-color="#19c07a"/>
                </linearGradient>
                <linearGradient id="mpSea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#67b8ff"/>
                  <stop offset="1" stop-color="#2b62ff"/>
                </linearGradient>
                <linearGradient id="mpPin" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stop-color="#ff5b5b"/>
                  <stop offset="1" stop-color="#d81b60"/>
                </linearGradient>
              </defs>

              <!-- folded map -->
              <g transform="translate(8,10)">
                <path d="M6 6 L18 2 L30 6 L42 2 L42 42 L30 46 L18 42 L6 46 Z"
                      fill="rgba(0,0,0,0.25)"/>
                <path d="M4 4 L16 0 L28 4 L40 0 L40 40 L28 44 L16 40 L4 44 Z"
                      fill="url(#mpGlass)" stroke="rgba(255,255,255,0.28)" />
                <path d="M6 10 L16 6 L16 36 L6 40 Z" fill="url(#mpSea)" opacity="0.85"/>
                <path d="M16 6 L28 10 L28 40 L16 36 Z" fill="url(#mpLand)" opacity="0.85"/>
                <path d="M28 10 L40 6 L40 36 L28 40 Z" fill="url(#mpSea)" opacity="0.80"/>
                <path d="M16 6 V40" stroke="rgba(255,255,255,0.22)"/>
                <path d="M28 10 V40" stroke="rgba(255,255,255,0.22)"/>
              </g>

              <!-- pin -->
              <g transform="translate(35,16)">
                <path d="M0 8 C0 3, 4 0, 8 0 C12 0, 16 3, 16 8 C16 14, 8 22, 8 22 C8 22, 0 14, 0 8 Z"
                      fill="url(#mpPin)" />
                <circle cx="8" cy="8" r="3.2" fill="rgba(255,255,255,0.75)"/>
              </g>
            </svg>
        `;
    }



    renderSettings(container) {
        const gear = el("div", { class: "icon-gear-3d" });
        container.appendChild(gear);
    }

    renderBrowser(container) {
        const globe = el("div", { class: "icon-globe-grid" });
        const ring = el("div", { class: "icon-globe-ring" });
        container.appendChild(globe);
        container.appendChild(ring);
    }

    renderWeather(container) {
        const sun = el("div", { class: "icon-sun" });
        const cloud = el("div", { class: "icon-cloud" });
        container.appendChild(sun);
        container.appendChild(cloud);

        // Mock Temp
        const temp = el("div", {
            style: {
                position: 'absolute',
                bottom: '4px',
                right: '6px',
                color: '#fff',
                fontWeight: 'bold',
                fontSize: '10px',
                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
            }
        }, "72°");
        container.appendChild(temp);
    }

    renderNotes(container) {
        const stack = el("div", { class: "icon-paper-stack" }, [
            el("div", { class: "icon-paper" }),
            el("div", { class: "icon-paper" }),
            el("div", { class: "icon-paper" }, [
                el("div", { class: "paper-line" }),
                el("div", { class: "paper-line" }),
                el("div", { class: "paper-line short" }),
            ])
        ]);
        container.appendChild(stack);
    }

    renderFolder(container) {
        // Legacy folder render, redirect to new one
        this.renderFiles(container);
    }

    renderFiles(container) {
        const back = el("div", { class: "icon-folder-back" });
        const paper = el("div", { class: "icon-folder-paper" });
        const front = el("div", { class: "icon-folder-front" });

        container.appendChild(back);
        container.appendChild(paper);
        container.appendChild(front);
    }

    /* =========================
       GAME ICONS — unified renderer from GameIcons.js
       ========================= */

    /** Map appId to PHOSPHOR_ICONS key */
    static _phosphorMap = {
      calculator: 'calculator', browser: 'browser', settings: 'settings',
      weather: 'weather', notes: 'notes', files: 'files', folder: 'files',
      maps: 'maps', photos: 'photos', todo: 'todo', pomodoro: 'pomodoro',
    };

    /** Render a Phosphor duotone icon */
    _renderPhosphor(container, key) {
        container.classList.add('phosphor-icon');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        const wrap = el('div', { class: 'phosphor-wrap' });
        wrap.innerHTML = PHOSPHOR_ICONS[key];
        container.appendChild(wrap);
    }

    /** Map appId to GAME_ICONS key (handles spider-solitaire → spider) */
    static _gameIdMap = {
      snake: 'snake', memory: 'memory', tictactoe: 'tictactoe',
      minesweeper: 'minesweeper', solitaire: 'solitaire',
      'spider-solitaire': 'spider', mahjong: 'mahjong',
      tarneeb: 'tarneeb', trix: 'trix',
    };

    /** Accent tones per game (subtle overlay inside .smart-game base) */
    static _gameTones = {
      snake: 'rgba(40,255,170,0.10)', memory: 'rgba(120,190,255,0.10)',
      tictactoe: 'rgba(255,120,210,0.08)', minesweeper: 'rgba(255,200,110,0.10)',
      solitaire: 'rgba(255,90,120,0.08)', spider: 'rgba(255,70,90,0.08)',
      mahjong: 'rgba(120,255,200,0.08)', tarneeb: 'rgba(100,120,255,0.10)',
      trix: 'rgba(180,80,255,0.10)',
    };

    /**
     * Attempts to render a game icon for this.appId.
     * Returns true if this appId is a known game, false otherwise.
     */
    _renderGameIcon(container) {
        const key = SmartIcon._gameIdMap[this.appId];
        if (!key || !GAME_ICONS[key]) return false;

        const tone = SmartIcon._gameTones[key] || 'rgba(255,255,255,0.10)';

        // Set up arcade glass base
        container.classList.add('smart-game');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.position = 'relative';
        container.innerHTML = `<div class="game-tint" style="background:${tone}"></div>`;

        // Insert SVG artwork
        const wrap = el('div', { class: 'game-wrap' });
        wrap.innerHTML = GAME_ICONS[key];
        container.appendChild(wrap);

        // Shine layer
        container.appendChild(el('div', { class: 'game-shine' }));
        return true;
    }

    renderCalculator(container) {
        // Display Area
        const display = el("div", { class: "icon-calc-display" }, "123");

        // Button Grid
        const grid = el("div", { class: "icon-calc-grid" });

        // Generate buttons (mock layout)
        const buttons = [
            'C', '±', '%', '÷',
            '7', '8', '9', '×',
            '4', '5', '6', '-',
            '1', '2', '3', '+',
            '0', '.', '='
        ];

        buttons.forEach((btn, i) => {
            let className = "icon-calc-btn";
            if (['÷', '×', '-', '+', '='].includes(btn)) className += " orange";
            else if (['C', '±', '%'].includes(btn)) className += " grey";

            if (btn === '0') className += " zero"; // Span 2

            grid.appendChild(el("div", { class: className }, btn));
        });

        container.appendChild(display);
        container.appendChild(grid);
    }

    destroy() {
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        if (this.root) {
            this.root.remove();
        }
    }
}
