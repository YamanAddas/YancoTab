/**
 * pdf/v3/chrome/signatureModal.js — draw-pad modal for capturing a
 * new signature.
 *
 * Canvas at 480×180. Pointer events drive a Catmull-Rom-smoothed
 * stroke (same algorithm as the ink tool). On Save: trim to the
 * tight bounding box of inked pixels, export as PNG data URL,
 * validate size (< 80KB), pass back to caller.
 *
 * Target size: ≤ 400 lines.
 */

import { el } from '../../../../utils/dom.js';

const PAD_W = 480;
const PAD_H = 180;
const MAX_BYTES_AFTER_TRIM = 80 * 1024;   // 80KB

export function buildSignatureModal({ onSave, onCancel } = {}) {
  const overlay = el('div', { class: 'pdf-sig-modal-overlay' });
  overlay.style.display = 'none';

  const dialog = el('div', { class: 'pdf-sig-modal', role: 'dialog', 'aria-modal': 'true' });

  const header = el('div', { class: 'pdf-sig-modal-header' });
  header.append(
    el('h3', { class: 'pdf-sig-modal-title' }, 'Add a signature'),
    el('button', {
      type: 'button',
      class: 'pdf-sig-modal-x',
      'aria-label': 'Close',
      onclick: () => close(true),
    }, '×'),
  );

  const nameInput = el('input', {
    type: 'text',
    class: 'pdf-sig-name-input',
    placeholder: 'Signature name (optional)',
    'aria-label': 'Signature name',
    maxlength: '40',
  });

  const canvas = document.createElement('canvas');
  canvas.className = 'pdf-sig-canvas';
  canvas.width = PAD_W * 2;     // 2x for retina
  canvas.height = PAD_H * 2;
  canvas.style.width = `${PAD_W}px`;
  canvas.style.height = `${PAD_H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(2, 2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = 2.5;

  const hint = el('div', { class: 'pdf-sig-hint' }, 'Draw your signature above');

  const actions = el('div', { class: 'pdf-sig-actions' });
  const clearBtn = el('button', {
    type: 'button', class: 'pdf-sig-btn',
    onclick: () => clearPad(),
  }, 'Clear');
  const cancelBtn = el('button', {
    type: 'button', class: 'pdf-sig-btn',
    onclick: () => close(true),
  }, 'Cancel');
  const saveBtn = el('button', {
    type: 'button', class: 'pdf-sig-btn is-primary',
    onclick: () => save(),
  }, 'Save');
  actions.append(clearBtn, cancelBtn, saveBtn);

  dialog.append(header, nameInput, canvas, hint, actions);
  overlay.append(dialog);

  // ── Drawing ──
  let drawing = false;
  let pts = [];
  let isDirty = false;

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drawing = true;
    pts = [pointerInCanvas(e)];
    isDirty = true;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* best-effort */ }
    drawSegment();
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    pts.push(pointerInCanvas(e));
    drawSegment();
  });
  canvas.addEventListener('pointerup', () => {
    if (!drawing) return;
    drawing = false;
    pts = [];
  });
  canvas.addEventListener('pointercancel', () => {
    drawing = false;
    pts = [];
  });

  function pointerInCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function drawSegment() {
    if (pts.length < 2) return;
    const a = pts[pts.length - 2];
    const b = pts[pts.length - 1];
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function clearPad() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    isDirty = false;
  }

  async function save() {
    if (!isDirty) {
      onCancel?.();
      close(true);
      return;
    }
    try {
      const dataUrl = await trimAndExport(canvas);
      if (!dataUrl) {
        alert('Signature is empty — draw something first.');
        return;
      }
      if (dataUrl.length > MAX_BYTES_AFTER_TRIM * 1.4) {
        alert('Signature is too large. Try drawing in a smaller area.');
        return;
      }
      const entry = {
        id: `sig-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`,
        name: (nameInput.value || '').trim().slice(0, 40) || `Signature ${new Date().toLocaleDateString()}`,
        imageDataUrl: dataUrl,
        createdAt: Date.now(),
      };
      onSave?.(entry);
      close(false);
    } catch (e) {
      console.error('[pdf-v3 sig modal] save failed:', e);
      alert(`Couldn't save signature: ${e.message || e}`);
    }
  }

  function close(notify) {
    overlay.style.display = 'none';
    clearPad();
    nameInput.value = '';
    if (notify) onCancel?.();
  }
  function open() {
    overlay.style.display = 'flex';
    setTimeout(() => nameInput.focus(), 0);
  }

  // Click outside the dialog → close.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(true);
  });
  // Esc → close.
  function onKey(e) {
    if (e.key === 'Escape' && overlay.style.display !== 'none') close(true);
  }
  document.addEventListener('keydown', onKey, true);

  function destroy() {
    document.removeEventListener('keydown', onKey, true);
    overlay.remove();
  }

  return { root: overlay, open, close: () => close(false), destroy };
}

/**
 * Trim transparent edges off the canvas and return a base64 PNG data URL.
 * Returns null if the canvas has no inked pixels.
 */
async function trimAndExport(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = img[(y * w + x) * 4 + 3];
      if (a > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 4;
  const bx = Math.max(0, minX - pad);
  const by = Math.max(0, minY - pad);
  const bw = Math.min(w - bx, maxX - bx + pad + 1);
  const bh = Math.min(h - by, maxY - by + pad + 1);
  const out = document.createElement('canvas');
  out.width = bw;
  out.height = bh;
  out.getContext('2d').drawImage(canvas, bx, by, bw, bh, 0, 0, bw, bh);
  return out.toDataURL('image/png');
}
