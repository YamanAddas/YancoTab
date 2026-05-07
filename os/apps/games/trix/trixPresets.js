/**
 * trixPresets.js — "Quick start" preset configs for Trix.
 *
 * Trix has 3 axes: mode (single | partners), difficulty
 * (easy | moderate | hard), and ruleProfile (classic | jawaker2025).
 * The 3 presets cover the most common combinations Yaman wants
 * one-tap access to. The "Custom" path stays available via the
 * setup screen for the full picker.
 */
import { makePreset } from '../table/presets.js';

export const TRIX_PRESETS = [
  makePreset({
    id: 'bourj',
    name: 'Bourj Trix',
    subtitle: 'Single · classic · moderate',
    gameId: 'trix',
    action: { type: 'START_MATCH', mode: 'single', difficulty: 'moderate', ruleProfile: 'classic' },
  }),
  makePreset({
    id: 'saida',
    name: 'Saida Partners',
    subtitle: 'Partners · jawaker 2025',
    gameId: 'trix',
    action: { type: 'START_MATCH', mode: 'partners', difficulty: 'moderate', ruleProfile: 'jawaker2025' },
  }),
  makePreset({
    id: 'solo',
    name: 'Solo · vs Bots',
    subtitle: 'Quick start · default',
    gameId: 'trix',
    action: { type: 'START_MATCH', mode: 'single', difficulty: 'moderate', ruleProfile: 'classic' },
  }),
];

export default TRIX_PRESETS;
