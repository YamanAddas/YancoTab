/**
 * presets.js — "Quick start" preset registry for the Table salon.
 *
 * Replaces the mock's "Live rooms" panel. Tapping a preset spawns a
 * fresh game with the preset's options applied. Per-game presets only
 * — Tarneeb's rail shows Tarneeb presets, Trix's rail shows Trix.
 * Cross-game launching is the game-switch tabs at the top of the felt.
 *
 * Each preset is a serializable descriptor; the host app calls
 * `preset.apply(state, dispatch)` which dispatches a START_MATCH (or
 * equivalent) action with the preset's options.
 */

/**
 * Validate one preset shape. Used by tests to ensure packs are well-formed.
 */
export function isValidPreset(p) {
  if (!p || typeof p !== 'object') return false;
  if (typeof p.id !== 'string' || !p.id) return false;
  if (typeof p.name !== 'string' || !p.name) return false;
  if (typeof p.gameId !== 'string' || !p.gameId) return false;
  if (typeof p.apply !== 'function') return false;
  return true;
}

/**
 * Validate a preset pack — array of presets, all valid, unique ids.
 */
export function validatePack(pack) {
  if (!Array.isArray(pack) || pack.length === 0) return false;
  const seen = new Set();
  for (const p of pack) {
    if (!isValidPreset(p)) return false;
    if (seen.has(p.id)) return false;
    seen.add(p.id);
  }
  return true;
}

/**
 * Apply a preset by id from a pack. Returns true if dispatched, false if
 * the id wasn't found. The host app provides `dispatch`; the preset's
 * own `apply` decides which action shape to send (Tarneeb uses
 * START_MATCH; Trix uses START_MATCH with mode + rules).
 */
export function applyPreset(pack, presetId, dispatch) {
  const preset = pack.find((p) => p.id === presetId);
  if (!preset) return false;
  try {
    preset.apply(dispatch);
    return true;
  } catch {
    return false;
  }
}

/**
 * Generic preset constructor used by per-game packs. Reduces boilerplate.
 *   makePreset({ id, name, subtitle, gameId, action })
 *     → preset object with .apply(dispatch) closing over `action`
 */
export function makePreset({ id, name, subtitle = '', gameId, action }) {
  if (!id || !name || !gameId || !action) {
    throw new Error('makePreset: id, name, gameId, action required');
  }
  return {
    id,
    name,
    subtitle,
    gameId,
    apply(dispatch) {
      dispatch({ ...action });
    },
  };
}
