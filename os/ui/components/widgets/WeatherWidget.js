import { el } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

export class WeatherWidget {
    constructor() {
        this.root = null;
    }

    render() {
        this.root = el('div', { class: 'widget-card widget-weather' });
        this.root.addEventListener('click', () => kernel.emit('app:open', 'weather'));
        this._update();
        return this.root;
    }

    _update() {
        if (!this.root) return;
        this.root.innerHTML = '';

        const ws = kernel.getService('weather');
        if (!ws) { this._showEmpty(); return; }

        const state = ws.getState();
        if (!state?.currentLocation) { this._showEmpty(); return; }

        const forecast = ws.getCache(state.currentLocation.query, 1000 * 60 * 60);
        if (!forecast?.current) { this._showEmpty(); return; }

        const temp = Math.round(forecast.current.temperature_2m ?? forecast.current.temp ?? 0);
        const unit = state.unit === 'f' ? 'F' : 'C';
        const city = state.currentLocation.label || '';
        const high = forecast.daily?.temperature_2m_max?.[0];
        const low = forecast.daily?.temperature_2m_min?.[0];

        this.root.append(
            el('div', { class: 'widget-value widget-value-sm' }, `${temp}\u00B0${unit}`),
            el('div', { class: 'widget-label' }, city),
        );

        if (high != null && low != null) {
            this.root.append(
                el('div', { class: 'widget-label-sm' }, `H:${Math.round(high)}\u00B0 L:${Math.round(low)}\u00B0`)
            );
        }
    }

    _showEmpty() {
        this.root.append(
            el('div', { class: 'widget-empty' }, 'Set up weather'),
            el('div', { class: 'widget-empty-sub' }, 'Tap to configure'),
        );
    }

    destroy() {}
}
