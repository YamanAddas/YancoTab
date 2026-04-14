/**
 * AppIcons.js — Unified Icon System
 *
 * Single source of truth for app icon metadata: category, container colors,
 * and pointers to SVG artwork in PhosphorIcons.js / GameIcons.js.
 *
 * Categories determine the tinted background behind each icon in the grid.
 */

import { PHOSPHOR_ICONS } from '../components/PhosphorIcons.js';
import { GAME_ICONS, GAME_MINI_ICONS } from '../components/GameIcons.js';

// ── Category color palette ──
// Container background behind the icon in the app grid.
// Two variants: dark theme and light theme.
export const CATEGORY_COLORS = {
  productivity: { dark: 'rgba(0,122,255,0.12)', light: 'rgba(0,122,255,0.08)' },
  media:        { dark: 'rgba(88,86,214,0.12)',  light: 'rgba(88,86,214,0.08)' },
  utilities:    { dark: 'rgba(0,229,193,0.12)',   light: 'rgba(0,229,193,0.08)' },
  games:        { dark: 'rgba(255,69,58,0.12)',   light: 'rgba(255,69,58,0.08)' },
  external:     { dark: 'rgba(255,159,10,0.12)',  light: 'rgba(255,159,10,0.08)' },
};

// ── App icon registry ──
// Maps appId → { category, svgSource, svgKey }
// svgSource: 'phosphor' | 'game' | 'custom' (clock/calendar rendered live)
export const APP_ICON_REGISTRY = {
  // Productivity
  notes:       { category: 'productivity', svgSource: 'phosphor', svgKey: 'notes' },
  todo:        { category: 'productivity', svgSource: 'phosphor', svgKey: 'todo' },
  calculator:  { category: 'productivity', svgSource: 'phosphor', svgKey: 'calculator' },

  // Media
  browser:     { category: 'media', svgSource: 'phosphor', svgKey: 'browser' },
  files:       { category: 'media', svgSource: 'phosphor', svgKey: 'files' },
  photos:      { category: 'media', svgSource: 'phosphor', svgKey: 'photos' },
  maps:        { category: 'media', svgSource: 'phosphor', svgKey: 'maps' },

  // Utilities
  clock:       { category: 'utilities', svgSource: 'custom', svgKey: 'clock' },
  weather:     { category: 'utilities', svgSource: 'phosphor', svgKey: 'weather' },
  settings:    { category: 'utilities', svgSource: 'phosphor', svgKey: 'settings' },

  // Games
  snake:             { category: 'games', svgSource: 'game', svgKey: 'snake' },
  memory:            { category: 'games', svgSource: 'game', svgKey: 'memory' },
  tictactoe:         { category: 'games', svgSource: 'game', svgKey: 'tictactoe' },
  minesweeper:       { category: 'games', svgSource: 'game', svgKey: 'minesweeper' },
  solitaire:         { category: 'games', svgSource: 'game', svgKey: 'solitaire' },
  'spider-solitaire': { category: 'games', svgSource: 'game', svgKey: 'spider' },
  mahjong:           { category: 'games', svgSource: 'game', svgKey: 'mahjong' },
  tarneeb:           { category: 'games', svgSource: 'game', svgKey: 'tarneeb' },
  trix:              { category: 'games', svgSource: 'game', svgKey: 'trix' },
};

/**
 * Get the SVG string for an appId.
 * Returns null for custom-rendered icons (clock, calendar).
 */
export function getIconSvg(appId) {
  const entry = APP_ICON_REGISTRY[appId];
  if (!entry) return null;

  if (entry.svgSource === 'phosphor') return PHOSPHOR_ICONS[entry.svgKey] || null;
  if (entry.svgSource === 'game') return GAME_ICONS[entry.svgKey] || null;
  return null; // custom icons rendered live by SmartIcon
}

/**
 * Get the mini (folder-thumbnail) SVG for a game appId.
 */
export function getMiniIconSvg(appId) {
  const entry = APP_ICON_REGISTRY[appId];
  if (!entry || entry.svgSource !== 'game') return null;
  return GAME_MINI_ICONS?.[entry.svgKey] || null;
}

/**
 * Get the category color for an appId.
 * @param {string} appId
 * @param {boolean} isLight - true for light theme
 * @returns {string} CSS rgba color string
 */
export function getCategoryColor(appId, isLight = false) {
  const entry = APP_ICON_REGISTRY[appId];
  if (!entry) return CATEGORY_COLORS.external[isLight ? 'light' : 'dark'];
  const colors = CATEGORY_COLORS[entry.category] || CATEGORY_COLORS.external;
  return colors[isLight ? 'light' : 'dark'];
}

/**
 * Get the category name for an appId.
 */
export function getCategory(appId) {
  return APP_ICON_REGISTRY[appId]?.category || 'external';
}
