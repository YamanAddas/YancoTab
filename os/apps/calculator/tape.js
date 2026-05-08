/**
 * tape.js — Calculator ("Tape") side-effect helpers.
 *
 * Pure-ish: reads the tape array + a kernel handle and performs a
 * single side effect (clipboard, blob download, file write).
 */
import { fmtTime } from './view.js';

export function tapeAsText(tape) {
  return tape.map((t) => `${fmtTime(t.ts)}  ${t.expr}  =  ${t.result}`).join('\n');
}

export async function copyTape(tape, kernel) {
  if (tape.length === 0) {
    kernel.emit('toast', { message: 'Tape is empty', type: 'info' });
    return;
  }
  try {
    await navigator.clipboard.writeText(tapeAsText(tape));
    kernel.emit('toast', { message: 'Tape copied', type: 'success' });
  } catch {
    kernel.emit('toast', { message: 'Copy failed', type: 'error' });
  }
}

export function exportTapeCsv(tape, kernel) {
  if (tape.length === 0) {
    kernel.emit('toast', { message: 'Tape is empty', type: 'info' });
    return;
  }
  // CSV-injection guard: Excel/Sheets interpret cells beginning with
  // =, +, -, @, tab, or CR as formulas. A user could type a calculator
  // expression that starts with `=HYPERLINK(...)` or `-1+cmd|'/c calc'`,
  // export to CSV, and a recipient opening it in Excel would execute
  // the formula. Prefix offending cells with a single quote — Excel
  // hides the apostrophe and treats the content as plain text.
  const escape = (s) => {
    let v = String(s);
    if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
    return `"${v.replace(/"/g, '""')}"`;
  };
  const rows = ['time,expression,result'];
  for (const t of tape) rows.push(`${escape(fmtTime(t.ts))},${escape(t.expr)},${escape(t.result)}`);
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `calculator-tape-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  kernel.emit('toast', { message: 'CSV downloaded', type: 'success' });
}

export function saveTapeToNotes(tape, kernel) {
  if (tape.length === 0) {
    kernel.emit('toast', { message: 'Tape is empty', type: 'info' });
    return;
  }
  const fs = kernel.getService?.('fs');
  if (!fs?.write) {
    kernel.emit('toast', { message: 'Notes not available', type: 'error' });
    return;
  }
  const now = Date.now();
  const title = `Calculator tape — ${new Date(now).toISOString().slice(0, 10)}`;
  const body = `# ${title}\n\n${tapeAsText(tape)}\n`;
  const docsPath = '/home/documents';
  try {
    if (!fs.exists?.(docsPath)) fs.mkdir?.(docsPath);
    let path = `${docsPath}/${title}.md`;
    let i = 2;
    while (fs.read?.(path)) {
      path = `${docsPath}/${title} (${i}).md`;
      i += 1;
    }
    fs.write(path, body, { created: now });
    kernel.emit('toast', { message: 'Saved to Notes', type: 'success' });
  } catch (e) {
    kernel.emit('toast', { message: `Save failed: ${e.message || e}`, type: 'error' });
  }
}
