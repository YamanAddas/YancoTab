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

// Clock widget intentionally excluded — the hero already shows the time at
// 96px size, so a second clock widget in the Today bar is redundant. The
// ClockWidget module stays around in case the design changes again.
// Order matches the design's 1.2/1/1/1.2 row: Weather | Pomodoro | Todo | Activity.
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
    }

    render() {
        this.root = el('div', { class: 'widget-bar' });
        this._buildWidgets();
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
        // Treat MISSING keys as enabled (true). This matters when a new widget
        // ships and existing users have a saved config without the new key —
        // we still want them to see it. Explicit `false` keeps it hidden.
        const enabled = (key) => stored[key] !== false;

        for (const [key, WidgetClass] of Object.entries(WIDGET_CLASSES)) {
            if (!enabled(key)) continue;
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
        for (const w of this._widgets) {
            if (w.destroy) w.destroy();
        }
        this._widgets = [];
    }
}
