import { el, parseSafeSvg, setLiteralHtml } from "../../utils/dom.js";
import { FolderIcon } from "../components/FolderIcon.js";
import { GAME_ICONS } from "../components/GameIcons.js";
import { PHOSPHOR_ICONS } from "../components/PhosphorIcons.js";
import { getCategoryColor } from "../icons/AppIcons.js";
import { buildHexFrame } from "../icons/hexGeometry.js";

/**
 * SmartIcon — v3.0
 *
 * Renders hexagonal app icons with the YancoVerse aesthetic.
 *
 * Resolution order (first match wins):
 *   1. Folder type           → FolderIcon (4-up thumbnail)
 *   2. Built-in app SVG      → PHOSPHOR_ICONS via _phosphorMap (rich gradients)
 *   3. Live clock            → analog face with ticking hands
 *   4. Built-in game SVG     → GAME_ICONS via _gameIdMap (with category tint)
 *   5. Live calendar         → today's weekday + date
 *   6. Static fallback       → user shortcut: image / inline SVG / emoji / 📦
 *
 * The hex container background tint comes from getCategoryColor(appId), which
 * looks up the app's category in AppIcons.js (productivity / media / utilities
 * / games / external) and returns a translucent color. CSS per-app gradient
 * overrides are gone — single source of truth lives in AppIcons.js.
 *
 * Note: PhosphorIcons.js is misnamed (the icons are custom rich-gradient SVGs,
 * not Phosphor library icons). The name is preserved to avoid SW cache churn.
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

        // 2. Inner content area (clipped by hex shape via CSS)
        const isLight = document.body.classList.contains('theme-light');
        const catColor = getCategoryColor(this.appId, isLight);
        const contentWrapper = el("div", {
            class: "hex-icon-content",
            style: { backgroundColor: catColor }
        });

        // 3. Folder type takes over completely
        if (this.metadata.type === 'folder' || this.appId.startsWith('folder')) {
            const folderIcon = new FolderIcon(
                { id: this.appId, title: this.metadata.name },
                this.metadata.children || []
            );
            return folderIcon.render();
        }

        // 4. Resolve content renderer in priority order
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

        // YancoVerse: body + SVG rim/bloom frame + floor cast.
        // The frame is an <svg> rather than a clipped div so its stroke stays a
        // uniform screen width and its bloom is a real halo — see hexGeometry.js.
        this.root.appendChild(contentWrapper);
        this.root.appendChild(buildHexFrame());
        this.root.appendChild(el('div', { class: 'hex-platform' }));

        // 5. Add badge (notifications, etc.) if any
        if (this.metadata.badge) {
            this.root.appendChild(el("div", { class: "smart-badge" }, String(this.metadata.badge)));
        }

        return this.root;
    }

    /* =========================
       Static fallback — user shortcuts (favicons, emoji, picked icons)
       ========================= */

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
                // Inline SVG (from app metadata or persisted shortcut). Always
                // sanitize through parseSafeSvg — never raw innerHTML — so a
                // tampered storage entry can't inject script/handler markup.
                if (this.metadata.icon.trim().startsWith('<')) {
                    const svg = parseSafeSvg(this.metadata.icon);
                    if (svg) {
                        svg.style.width = "60%";
                        svg.style.height = "60%";
                        svg.style.color = "#fff";
                        svg.style.filter = "drop-shadow(0 2px 4px rgba(0,0,0,0.2))";
                        container.appendChild(svg);
                    } else {
                        // Malformed SVG — fall through to emoji-style fallback
                        container.textContent = "📦";
                        container.style.fontSize = "32px";
                    }
                } else {
                    // Plain text or emoji
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

        container.style.display = "flex";
        container.style.alignItems = "center";
        container.style.justifyContent = "center";
    }

    /* =========================
       Live renderers — Clock + Calendar
       ========================= */

    renderClock(container) {
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
        const now = new Date();
        const day = now.toLocaleString('en-US', { weekday: 'short' });
        const date = now.getDate();

        const cal = el("div", { class: "smart-calendar" }, [
            el("div", { class: "smart-calendar-header" }, day),
            el("div", { class: "smart-calendar-body" }, String(date))
        ]);

        container.appendChild(cal);
    }

    /* =========================
       Registry-driven SVG renderers
       ========================= */

    /** appId → PHOSPHOR_ICONS key for built-in apps */
    static _phosphorMap = {
      calculator: 'calculator', browser: 'browser', settings: 'settings',
      weather: 'weather', notes: 'notes', files: 'files', folder: 'files',
      maps: 'maps', photos: 'photos', 'pdf-reader': 'pdf-reader', todo: 'todo',
      mail: 'mail', pomodoro: 'pomodoro',
    };

    _renderPhosphor(container, key) {
        container.classList.add('phosphor-icon');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        const wrap = el('div', { class: 'phosphor-wrap' });
        setLiteralHtml(wrap, SmartIcon._scopeSvgIds(PHOSPHOR_ICONS[key]));
        container.appendChild(wrap);
    }

    /** appId → GAME_ICONS key (handles spider-solitaire → spider) */
    static _gameIdMap = {
      snake: 'snake', memory: 'memory', tictactoe: 'tictactoe',
      minesweeper: 'minesweeper', solitaire: 'solitaire',
      'spider-solitaire': 'spider', mahjong: 'mahjong',
      tarneeb: 'tarneeb', trix: 'trix',
    };

    /** Subtle accent overlay tone per game (drives .game-tint) */
    static _gameTones = {
      snake: 'rgba(40,255,170,0.10)', memory: 'rgba(120,190,255,0.10)',
      tictactoe: 'rgba(255,120,210,0.08)', minesweeper: 'rgba(255,200,110,0.10)',
      solitaire: 'rgba(255,90,120,0.08)', spider: 'rgba(255,70,90,0.08)',
      mahjong: 'rgba(120,255,200,0.08)', tarneeb: 'rgba(100,120,255,0.10)',
      trix: 'rgba(180,80,255,0.10)',
    };

    /** Returns true if appId is a known game and SVG was rendered. */
    _renderGameIcon(container) {
        const key = SmartIcon._gameIdMap[this.appId];
        if (!key || !GAME_ICONS[key]) return false;

        const tone = SmartIcon._gameTones[key] || 'rgba(255,255,255,0.10)';

        container.classList.add('smart-game');
        container.style.display = 'flex';
        container.style.alignItems = 'center';
        container.style.justifyContent = 'center';
        container.style.position = 'relative';
        container.replaceChildren(el('div', { class: 'game-tint', style: { background: tone } }));

        const wrap = el('div', { class: 'game-wrap' });
        setLiteralHtml(wrap, SmartIcon._scopeSvgIds(GAME_ICONS[key]));
        container.appendChild(wrap);

        container.appendChild(el('div', { class: 'game-shine' }));
        return true;
    }

    /**
     * Scope every gradient / filter / clipPath / mask id in an SVG string to
     * a unique per-instance prefix. Without this, duplicate ids like
     * `globe-sea` across multiple Browser-icon instances on the same page
     * (e.g. one in the AppGrid, one in the AppDock) cause `url(#globe-sea)`
     * lookups to bind to the FIRST id in document order — which may sit
     * inside a `display: none` page-pane after a tab switch, leading to
     * broken paint on the visible icons. Counter-bumping the prefix gives
     * each SVG its own scope.
     */
    static _scopeCounter = 0;
    static _scopeSvgIds(svgString) {
        if (typeof svgString !== 'string' || !svgString.includes('id=')) return svgString;
        const scope = `si${++SmartIcon._scopeCounter}`;
        return svgString
            .replace(/\bid="([^"]+)"/g, (_, id) => `id="${scope}-${id}"`)
            .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#${scope}-${id})`)
            .replace(/href="#([^"]+)"/g, (_, id) => `href="#${scope}-${id}"`)
            .replace(/xlink:href="#([^"]+)"/g, (_, id) => `xlink:href="#${scope}-${id}"`);
    }

    /* =========================
       Lifecycle
       ========================= */

    destroy() {
        this.intervals.forEach(clearInterval);
        this.intervals = [];
        if (this.root) {
            this.root.remove();
        }
    }
}
