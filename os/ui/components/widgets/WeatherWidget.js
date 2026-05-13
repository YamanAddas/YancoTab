import { el, setLiteralHtml } from '../../../utils/dom.js';
import { kernel } from '../../../kernel.js';

/**
 * WeatherWidget — current temperature + city + H/L for the configured city.
 *
 * Uses the unified .widget-head / .widget-body / .widget-foot pattern so it
 * visually matches the other Today widgets at the same height. When weather
 * isn't configured we render a useful empty state instead of leaving the
 * card blank.
 */
export class WeatherWidget {
    constructor() { this.root = null; }

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
        const state = ws?.getState?.();
        const forecast = state?.currentLocation
            ? ws.getCache?.(state.currentLocation.query, 1000 * 60 * 60)
            : null;

        if (!forecast?.current) {
            this._renderEmpty();
            return;
        }

        const temp = Math.round(forecast.current.temperature_2m ?? forecast.current.temp ?? 0);
        const unit = state.unit === 'f' ? 'F' : 'C';
        const city = (state.currentLocation.label || '').split(',')[0];
        const high = forecast.daily?.temperature_2m_max?.[0];
        const low = forecast.daily?.temperature_2m_min?.[0];

        this.root.append(
            el('div', { class: 'widget-head' }, [
                el('b', {}, 'weather'),
                el('span', {}, city.toLowerCase()),
            ]),
            el('div', { class: 'widget-body widget-weather-body' }, [
                el('div', { class: 'widget-weather-temp' }, [
                    String(temp),
                    el('span', { class: 'widget-weather-deg' }, `°${unit}`),
                ]),
            ]),
        );

        if (high != null && low != null) {
            this.root.append(
                el('div', { class: 'widget-foot' }, `H ${Math.round(high)}°  ·  L ${Math.round(low)}°`)
            );
        }
    }

    _renderEmpty() {
        this.root.append(
            el('div', { class: 'widget-head' }, [
                el('b', {}, 'weather'),
                el('span', {}, 'not set'),
            ]),
            el('div', { class: 'widget-body widget-weather-empty' }, [
                this._cloudGlyph(),
                el('div', { class: 'widget-empty-msg' }, 'Tap to set your city'),
            ]),
        );
    }

    _cloudGlyph() {
        const wrap = el('div', { class: 'widget-empty-glyph' });
        setLiteralHtml(wrap, `<svg viewBox="0 0 64 40" width="48" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 28a8 8 0 0 1 0-16 12 12 0 0 1 23 4 9 9 0 0 1 5 17H17a7 7 0 0 1-3-5z"/></svg>`);
        return wrap;
    }

    destroy() {}
}
