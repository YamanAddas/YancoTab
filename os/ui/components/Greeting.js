/**
 * Greeting.js — Personalized time-of-day greeting
 * Shows greeting, date, and optional weather summary.
 */
import { el } from '../../utils/dom.js';
import { kernel } from '../../kernel.js';

function getGreetingText() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good morning';
    if (hour >= 12 && hour < 17) return 'Good afternoon';
    return 'Good evening'; // 17:00 through 4:59
}

function getDateString() {
    const now = new Date();
    return now.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric'
    });
}

function getTimeString() {
    const now = new Date();
    return now.toLocaleTimeString(undefined, {
        hour: 'numeric', minute: '2-digit', hour12: true
    });
}

function getWeatherSummary() {
    try {
        const ws = kernel.getService('weather');
        if (!ws) return null;
        const state = ws.getState();
        if (!state?.currentLocation) return null;
        const query = state.currentLocation.query;
        const forecast = ws.getCache(query, 1000 * 60 * 60); // 1h tolerance for display
        if (!forecast?.current) return null;
        const temp = Math.round(forecast.current.temperature_2m ?? forecast.current.temp ?? 0);
        const unit = state.unit === 'f' ? 'F' : 'C';
        const city = state.currentLocation.label || '';
        return `${temp}°${unit} ${city}`;
    } catch {
        return null;
    }
}

export class Greeting {
    constructor() {
        this.root = null;
        this._interval = null;
    }

    render() {
        this.root = el('div', { class: 'greeting-bar' });
        this._update();
        // Refresh every 30s — keeps time display current without per-second overhead
        this._interval = setInterval(() => this._update(), 30000);
        // Instant refresh when name is changed in Settings
        this._onNameChanged = () => this._update();
        window.addEventListener('yancotab:name_changed', this._onNameChanged);
        return this.root;
    }

    _update() {
        if (!this.root) return;

        const name = kernel.storage?.load('yancotab_user_name') || '';
        const greeting = getGreetingText();
        const greetingFull = name ? `${greeting}, ${name}` : greeting;
        const dateStr = getDateString();
        const weather = getWeatherSummary();

        const timeStr = getTimeString();

        this.root.innerHTML = '';
        this.root.append(
            el('div', { class: 'greeting-text' }, greetingFull),
            el('div', { class: 'greeting-sub' }, weather ? `${dateStr}  ·  ${weather}` : dateStr),
            el('div', { class: 'greeting-time' }, timeStr),
        );
    }

    destroy() {
        if (this._interval) clearInterval(this._interval);
        if (this._onNameChanged) window.removeEventListener('yancotab:name_changed', this._onNameChanged);
        if (this.root) this.root.remove();
    }
}
