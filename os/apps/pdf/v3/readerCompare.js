/**
 * pdf/v3/readerCompare.js — side-by-side compare view.
 *
 * Activated from the More menu → "Compare". User picks a second doc;
 * the stage transforms into a 2-column grid with the original strip on
 * the left and a new lightweight strip for doc B on the right. Both
 * scroll independently within the same stage.
 *
 * Exit via the floating bar that appears at the bottom of the stage.
 * Annotations, search, and the selection pill stay attached to doc A
 * — doc B is a read-only viewer.
 *
 * Target size: ≤ 240 lines.
 */

import { el } from '../../../utils/dom.js';
import { buildComparePicker } from './chrome/comparePicker.js';
import { buildPageStrip } from './render/pageStrip.js';

export function createCompareController({
  pdfStore,
  stage,
  getLeftStrip,    // () → existing strip (whose root is already in stage)
  getPdfJs,        // () → pdfjs module (caller already loaded it)
  getDocId,
  onToast,
}) {
  const picker = buildComparePicker({
    onPick: (docId) => openCompare(docId),
  });
  document.body.appendChild(picker.root);

  let active = false;
  let compareWrap = null;     // .pdf-compare-wrap surrounding both panes
  let leftPanel = null;
  let rightPanel = null;
  let rightStrip = null;
  let rightDoc = null;
  let exitBar = null;
  let originalStripParent = null;
  let scrollHandlersOn = false;

  async function open() {
    if (active) {
      onToast?.({ message: 'Already in compare mode', type: 'info' });
      return;
    }
    const docId = getDocId();
    if (!docId) {
      onToast?.({ message: 'Open a PDF first', type: 'info' });
      return;
    }
    let libraryDocs = [];
    try { libraryDocs = await pdfStore.listDocuments(); }
    catch (e) {
      onToast?.({ message: `Couldn't list library: ${e?.message || e}`, type: 'error' });
      return;
    }
    picker.open({ currentDocId: docId, libraryDocs });
  }

  async function openCompare(docIdB) {
    const leftStrip = getLeftStrip?.();
    if (!leftStrip) {
      onToast?.({ message: 'Compare unavailable', type: 'error' });
      return;
    }
    let pdfjs = null;
    try { pdfjs = await getPdfJs?.(); } catch { /* fallthrough */ }
    if (!pdfjs) {
      onToast?.({ message: 'pdf.js not loaded', type: 'error' });
      return;
    }
    try {
      const blob = await pdfStore.readBlob(docIdB);
      if (!blob) throw new Error('Doc not found');
      const buf = await blob.arrayBuffer();
      rightDoc = await pdfjs.getDocument({ data: buf, isEvalSupported: false }).promise;
    } catch (e) {
      onToast?.({ message: `Couldn't open doc: ${e?.message || e}`, type: 'error' });
      return;
    }

    // Build DOM wrapper around the existing strip.
    originalStripParent = leftStrip.root.parentNode;
    compareWrap = el('div', { class: 'pdf-compare-wrap' });
    leftPanel = el('div', { class: 'pdf-compare-pane pdf-compare-pane-left' });
    rightPanel = el('div', { class: 'pdf-compare-pane pdf-compare-pane-right' });
    // Insert wrap where the original strip was, then move strip into left pane.
    originalStripParent.insertBefore(compareWrap, leftStrip.root);
    leftPanel.appendChild(leftStrip.root);
    compareWrap.append(leftPanel, rightPanel);

    // Build right strip with no callbacks (read-only viewer).
    rightStrip = buildPageStrip({});
    rightPanel.appendChild(rightStrip.root);
    await rightStrip.prepareSlots(rightDoc, rightPanel, { zoom: 1.0 });

    // Sync scroll.
    bindScrollSync();

    // Exit bar.
    exitBar = el('div', { class: 'pdf-compare-exitbar' });
    exitBar.append(
      el('span', { class: 'pdf-compare-exitbar-label' }, 'Comparing 2 PDFs side-by-side'),
      el('button', {
        type: 'button',
        class: 'pdf-compare-exitbar-btn',
        onclick: () => closeCompare(),
      }, 'Exit'),
    );
    stage.appendChild(exitBar);

    active = true;
    stage.classList.add('is-comparing');
    onToast?.({ message: 'Compare mode active', type: 'success' });
  }

  function closeCompare() {
    if (!active) return;
    unbindScrollSync();
    if (exitBar) { exitBar.remove(); exitBar = null; }
    const leftStrip = getLeftStrip?.();
    // Move the left strip back to the stage at the wrap's old position.
    if (leftStrip && compareWrap && originalStripParent) {
      originalStripParent.insertBefore(leftStrip.root, compareWrap);
      compareWrap.remove();
    }
    try { rightStrip?.destroy?.(); } catch { /* best-effort */ }
    try { rightDoc?.destroy?.(); } catch { /* best-effort */ }
    rightStrip = null;
    rightDoc = null;
    compareWrap = null;
    leftPanel = null;
    rightPanel = null;
    originalStripParent = null;
    active = false;
    stage.classList.remove('is-comparing');
  }

  // ── Scroll sync ───────────────────────────────────────────────────
  // Mirror scroll position from one pane to the other as a proportion.
  let syncing = false;
  function bindScrollSync() {
    if (scrollHandlersOn) return;
    leftPanel.addEventListener('scroll', onLeftScroll, { passive: true });
    rightPanel.addEventListener('scroll', onRightScroll, { passive: true });
    scrollHandlersOn = true;
  }
  function unbindScrollSync() {
    if (!scrollHandlersOn) return;
    leftPanel?.removeEventListener('scroll', onLeftScroll);
    rightPanel?.removeEventListener('scroll', onRightScroll);
    scrollHandlersOn = false;
  }
  function onLeftScroll() {
    if (syncing) return;
    if (!leftPanel || !rightPanel) return;
    const lMax = Math.max(1, leftPanel.scrollHeight - leftPanel.clientHeight);
    const rMax = Math.max(1, rightPanel.scrollHeight - rightPanel.clientHeight);
    const ratio = leftPanel.scrollTop / lMax;
    syncing = true;
    rightPanel.scrollTop = ratio * rMax;
    requestAnimationFrame(() => { syncing = false; });
  }
  function onRightScroll() {
    if (syncing) return;
    if (!leftPanel || !rightPanel) return;
    const lMax = Math.max(1, leftPanel.scrollHeight - leftPanel.clientHeight);
    const rMax = Math.max(1, rightPanel.scrollHeight - rightPanel.clientHeight);
    const ratio = rightPanel.scrollTop / rMax;
    syncing = true;
    leftPanel.scrollTop = ratio * lMax;
    requestAnimationFrame(() => { syncing = false; });
  }

  function destroy() {
    closeCompare();
    picker.root.remove();
  }

  return { open, closeCompare, isActive: () => active, destroy };
}
