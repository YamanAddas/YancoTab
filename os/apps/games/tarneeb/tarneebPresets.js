/**
 * tarneebPresets.js — "Quick start" preset configs for Tarneeb.
 *
 * Each preset spawns a fresh Tarneeb match by dispatching START_MATCH
 * with a difficulty option. The naming + flavor is Levantine to match
 * the design package's tone.
 */
import { makePreset } from '../table/presets.js';

export const TARNEEB_PRESETS = [
  makePreset({
    id: 'hamra',
    name: 'Hamra Salon',
    subtitle: 'Casual · forgiving AI',
    gameId: 'tarneeb',
    action: { type: 'START_MATCH', difficulty: 'easy' },
  }),
  makePreset({
    id: 'damascus',
    name: 'Damascus Diwan',
    subtitle: 'Expert · sharp AI',
    gameId: 'tarneeb',
    action: { type: 'START_MATCH', difficulty: 'hard' },
  }),
  makePreset({
    id: 'solo',
    name: 'Solo · vs Bots',
    subtitle: 'Quick start · default',
    gameId: 'tarneeb',
    action: { type: 'START_MATCH', difficulty: 'moderate' },
  }),
];

export default TARNEEB_PRESETS;
