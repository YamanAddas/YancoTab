/**
 * pomodoro/intents.js — view → reducer action factories.
 *
 * Pure helpers; the app shell wires the actual dispatch. Keeping these
 * named lets us evolve the reducer's action shape without combing
 * through every view file.
 */

export const start            = ()    => ({ type: 'START' });
export const pause            = ()    => ({ type: 'PAUSE' });
export const resume           = ()    => ({ type: 'RESUME' });
export const tick             = ()    => ({ type: 'TICK' });
export const extend           = (ms)  => ({ type: 'EXTEND', ms });
export const skipBreak        = ()    => ({ type: 'SKIP_BREAK' });
export const endCycle         = ()    => ({ type: 'END_CYCLE' });
export const changePreset     = (id)  => ({ type: 'CHANGE_PRESET', presetId: id });
export const toggleSky        = ()    => ({ type: 'TOGGLE_SKY_OVERRIDE' });
export const clearSkyOverride = ()    => ({ type: 'CLEAR_SKY_OVERRIDE' });
