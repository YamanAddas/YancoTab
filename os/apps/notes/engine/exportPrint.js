/**
 * notes/engine/exportPrint.js — export-as-Markdown + print-a-note.
 *
 * Pure helpers extracted from NotesApp to keep the orchestrator
 * under the 500-line cap. Both functions are side-effecting (they
 * trigger a download / open a window) but they take their note +
 * an onToast callback as args, so they're easy to unit-test by
 * stubbing globals.
 *
 * Target size: ≤ 110 lines.
 */

const PRINT_CSS = `
  body { font-family: Georgia, 'Times New Roman', serif; max-width: 700px; margin: 40px auto; line-height: 1.55; color: #1a1a1a; padding: 0 24px; }
  h1, h2, h3 { line-height: 1.25; }
  h1 { font-size: 28px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  code { background: #f4f4f4; padding: 1px 5px; border-radius: 3px; font-size: 0.92em; }
  pre { background: #f4f4f4; padding: 10px 14px; border-radius: 6px; overflow-x: auto; }
  blockquote { border-left: 3px solid #ccc; margin: 0; padding: 4px 14px; color: #555; }
  ul, ol { padding-left: 26px; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 18px 0; }
  a { color: #007AFF; text-decoration: none; }
  .nc-md-task input { margin-right: 6px; }
  @media print { body { margin: 20mm 18mm; } }
`;

export function safeFilename(s) {
  return String(s || 'note').replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80) || 'note';
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Trigger a download of `<title>.md`. The body is preceded by a
 * H1 of the title so the exported file is self-describing.
 */
export function exportAsMarkdown(note, { onToast } = {}) {
  if (!note) return;
  const filename = safeFilename(note.title || 'Untitled') + '.md';
  const front = `# ${note.title || 'Untitled'}\n\n`;
  const body = front + (note.body || '');
  try {
    const blob = new Blob([body], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    onToast?.({ message: `Exported ${filename}`, type: 'success' });
  } catch (e) {
    onToast?.({ message: `Export failed: ${e?.message || e}`, type: 'error' });
  }
}

/**
 * Render the note's markdown into a standalone print window. Uses
 * browser's print dialog — works for "Save as PDF" too.
 */
export function printNote(note, { onToast, renderMarkdown } = {}) {
  if (!note || !renderMarkdown) return;
  const html = renderMarkdown(note.body || '');
  const win = window.open('', '_blank', 'width=800,height=900');
  if (!win) {
    onToast?.({ message: 'Pop-up blocked — allow popups to print', type: 'error' });
    return;
  }
  const titleHtml = escapeHtml(note.title || 'Untitled');
  const doc = win.document;
  doc.open();
  doc.write(`<!doctype html><html><head>
    <meta charset="utf-8">
    <title>${titleHtml}</title>
    <style>${PRINT_CSS}</style>
  </head><body>
    <h1>${titleHtml}</h1>
    ${html}
  </body></html>`);
  doc.close();
  setTimeout(() => {
    try { win.focus(); win.print(); } catch { /* ignore */ }
  }, 250);
}
