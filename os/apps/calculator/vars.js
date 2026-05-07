/**
 * vars.js — Calculator variables UX glue.
 *
 * Define/use/delete flows wired through YancoModal prompts. Pure-ish:
 * mutates the passed-in `vars` object via the callbacks, so the shell
 * stays in control of state + persistence + render scheduling.
 */
import { showPrompt } from '../../ui/components/YancoModal.js';
import {
  isValidVarName, isReservedVarName, normalizeNumber,
} from './engine.js';
import { actInsertVar as progInsertVar } from './programmer.js';

/**
 * Prompt for a new variable. On success the caller gets back
 * { name, value, tapeEntry } and is responsible for committing it
 * to its `vars` map + tape + storage.
 *
 * @param {object} ctx — { kernel, defaultValue }
 * @returns {Promise<null | { name: string, value: number, tapeEntry: object }>}
 */
export async function promptDefineVar({ kernel, defaultValue = '' }) {
  const name = await showPrompt(
    'New variable',
    'Name (letters, digits, underscores; ≤ 16 chars):',
    '',
    { placeholder: 'e.g. tax' }
  );
  if (name == null) return null;
  const trimmed = name.trim();
  if (!isValidVarName(trimmed)) {
    kernel.emit('toast', { message: 'Invalid variable name', type: 'error' });
    return null;
  }
  if (isReservedVarName(trimmed)) {
    kernel.emit('toast', { message: `"${trimmed}" is reserved`, type: 'error' });
    return null;
  }
  const valueStr = await showPrompt(
    'Value',
    `Numeric value for "${trimmed}":`,
    defaultValue && defaultValue !== 'Error' ? defaultValue : ''
  );
  if (valueStr == null) return null;
  const num = Number(String(valueStr).replace(/,/g, ''));
  if (!Number.isFinite(num)) {
    kernel.emit('toast', { message: 'Value must be a finite number', type: 'error' });
    return null;
  }
  return {
    name: trimmed,
    value: num,
    tapeEntry: {
      ts: Date.now(),
      expr: `${trimmed} = ${normalizeNumber(num)}`,
      result: '→ stored',
      kind: 'var-def',
    },
  };
}

// ─── Shell action helpers ───────────────────────────────────────

export async function actDefineVar(ctx) {
  const r = await promptDefineVar({ kernel: ctx.kernel, defaultValue: ctx.state.current });
  if (!r) return;
  ctx._vars[r.name] = r.value;
  ctx._appendTape(r.tapeEntry);
  ctx._persist();
  ctx._renderVars();
  ctx._renderTape();
  ctx.kernel.emit('toast', { message: `${r.name} stored`, type: 'success' });
}

export function actUseVar(ctx, name) {
  const v = ctx._vars[name];
  if (!Number.isFinite(v)) return;
  if (ctx._mode === 'programmer') {
    progInsertVar(ctx, v);
  } else {
    ctx.state.current = normalizeNumber(v);
    ctx.state.resetNext = true;
    ctx._renderDisplay();
  }
  ctx.kernel.emit('toast', { message: `${name} inserted`, type: 'info' });
}

export function actDeleteVar(ctx, name) {
  if (!(name in ctx._vars)) return;
  delete ctx._vars[name];
  ctx._persist();
  ctx._renderVars();
  ctx.kernel.emit('toast', { message: `${name} deleted`, type: 'info' });
}
