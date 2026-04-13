/**
 * WidgetBar.js — Bento-style widget row
 * Horizontal row of glass-effect widget cards.
 * Users toggle which widgets are visible via Settings.
 * Styles defined in css/home.css
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';
import { ClockWidget } from './widgets/ClockWidget.js';
import { WeatherWidget } from './widgets/WeatherWidget.js';
import { TodoWidget } from './widgets/TodoWidget.js';
import { PomodoroWidget } from './widgets/PomodoroWidget.js';

const WIDGET_CLASSES = {
    clock: ClockWidget,
    weather: WeatherWidget,
    todo: TodoWidget,
    pomodoro: PomodoroWidget,
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

        const config = kernel.storage?.load('yancotab_widgets') || { clock: false, weather: false, todo: false, pomodoro: false };

        for (const [key, WidgetClass] of Object.entries(WIDGET_CLASSES)) {
            if (!config[key]) continue;
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
