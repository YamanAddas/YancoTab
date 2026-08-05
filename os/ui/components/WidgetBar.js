/**
 * WidgetBar.js — Bento-style widget row
 * Horizontal row of glass-effect widget cards.
 * Users toggle which widgets are visible via Settings.
 * Styles defined in css/home.css
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';
import { WeatherWidget } from './widgets/WeatherWidget.js';
import { TodoWidget } from './widgets/TodoWidget.js';
import { PomodoroWidget } from './widgets/PomodoroWidget.js';
import { ActivityWidget } from './widgets/ActivityWidget.js';
import { WIDGETS, isWidgetEnabled } from './widgets/widgetRegistry.js';

// Clock widget intentionally excluded — the hero already shows the time at
// 96px size, so a second clock widget in the Today bar is redundant. The
// ClockWidget module stays around in case the design changes again.
// Row order comes from widgetRegistry (Weather | Pomodoro | Todo | Activity),
// which is also what Settings lists — one order, one source.
const WIDGET_CLASSES = {
    weather: WeatherWidget,
    pomodoro: PomodoroWidget,
    todo: TodoWidget,
    activity: ActivityWidget,
};

export class WidgetBar {
    constructor() {
        this.root = null;
        this._widgets = [];
        this._unsubscribe = null;
    }

    render() {
        this.root = el('div', { class: 'widget-bar' });
        this._buildWidgets();
        // Rebuild when the config changes. A storage subscription rather
        // than a custom event, so a toggle flipped in another tab lands
        // here too — and so Settings does not need to know this component
        // exists in order to change what it shows.
        try {
            this._unsubscribe = kernel.storage?.subscribe?.('yancotab_widgets', () => this._buildWidgets()) || null;
        } catch { this._unsubscribe = null; }
        return this.root;
    }

    _buildWidgets() {
        for (const w of this._widgets) {
            if (w.destroy) w.destroy();
        }
        this._widgets = [];
        this.root.innerHTML = '';

        // Fallback matches the AppStorage REGISTRY default for yancotab_widgets
        // (appStorage.js). When storage isn't ready yet (rare race) default to
        // showing the widgets — that's the design's intent for the home page.
        const stored = kernel.storage?.load('yancotab_widgets') || {};

        for (const { key } of WIDGETS) {
            const WidgetClass = WIDGET_CLASSES[key];
            if (!WidgetClass || !isWidgetEnabled(stored, key)) continue;
            const widget = new WidgetClass();
            this._widgets.push(widget);
            this.root.appendChild(widget.render());
        }

        this.root.classList.toggle('widget-bar-empty', this._widgets.length === 0);
    }

    refresh() {
        this._buildWidgets();
    }

    destroy() {
        if (this._unsubscribe) { try { this._unsubscribe(); } catch { /* ignore */ } this._unsubscribe = null; }
        for (const w of this._widgets) {
            if (w.destroy) w.destroy();
        }
        this._widgets = [];
    }
}
