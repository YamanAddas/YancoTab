/**
 * pdf/view/infoPanel.js — right column of the Codex.
 *
 * Three card stacks:
 *   1. Selection card — current selection (truncated)
 *   2. Inline calc — when the selection is numeric, show evaluated
 *      result with the original expression as caption
 *   3. Today's quotes — running list of quotes copied this session
 *
 * Empty state when nothing is selected and no quotes have been
 * captured yet.
 */

import { el } from '../../../utils/dom.js';

const MAX_TODAYS_QUOTES = 8;

export function buildInfoPanel({ onClearTodays, onJumpToQuote } = {}) {
  const root = el('aside', { class: 'cx-info' });

  // Selection card
  const selCard = el('div', { class: 'cx-card cx-card-tool' });
  const selHead = el('div', { class: 'cx-card-h' }, 'SELECTION');
  const selBody = el('div', { class: 'cx-card-body' });
  selCard.append(selHead, selBody);

  // Inline calc card
  const calcCard = el('div', { class: 'cx-card cx-card-tool' });
  const calcHead = el('div', { class: 'cx-card-h' }, 'INLINE CALC');
  const calcValue = el('div', { class: 'cx-calc-value' });
  const calcCaption = el('div', { class: 'cx-calc-caption' });
  calcCard.append(calcHead, calcValue, calcCaption);

  // Today's quotes
  const quotesCard = el('div', { class: 'cx-card cx-card-quotes' });
  const quotesHead = el('div', { class: 'cx-card-row' }, [
    el('span', { class: 'cx-card-h' }, 'TODAY’S QUOTES'),
    (() => {
      const b = el('button', { type: 'button', class: 'cx-clear-btn', title: 'Clear' }, '×');
      b.addEventListener('click', () => onClearTodays?.());
      return b;
    })(),
  ]);
  const quotesList = el('div', { class: 'cx-quotes-list' });
  const quotesEmpty = el('p', { class: 'cx-card-blurb' },
    'Select text and tap "→ Notes" to capture a quote with citation.');
  quotesCard.append(quotesHead, quotesList, quotesEmpty);

  // Hint footer
  const hint = el('div', { class: 'cx-info-hint' },
    'Drag to select · "→ Notes" copies a quote-ready citation · F focus mode');

  root.append(selCard, calcCard, quotesCard, hint);

  function showSelection(visible) {
    selCard.style.display = visible ? '' : 'none';
  }
  function showCalc(visible) {
    calcCard.style.display = visible ? '' : 'none';
  }

  showSelection(false);
  showCalc(false);

  return {
    root,
    update({ selectionText = '', calc = null, todaysQuotes = [] } = {}) {
      // Selection
      const t = String(selectionText || '').trim();
      showSelection(!!t);
      if (t) {
        selBody.textContent = t.length > 240 ? t.slice(0, 240) + '…' : t;
      }

      // Calc
      showCalc(!!(calc && calc.ok));
      if (calc && calc.ok) {
        calcValue.textContent = calc.formattedValue;
        calcCaption.textContent = calc.expr ? `= ${calc.expr.trim()}` : '';
      }

      // Today's quotes
      quotesList.innerHTML = '';
      const visible = (todaysQuotes || []).slice(0, MAX_TODAYS_QUOTES);
      quotesEmpty.style.display = visible.length ? 'none' : '';
      for (const q of visible) {
        const item = el('div', { class: 'cx-quote-item' });
        const text = el('div', { class: 'cx-quote-text' }, q.text);
        const src = el('div', { class: 'cx-quote-src' },
          [q.docTitle, q.page ? `p.${q.page}` : ''].filter(Boolean).join(' · '));
        item.append(text, src);
        if (q.page) {
          item.classList.add('is-clickable');
          item.addEventListener('click', () => onJumpToQuote?.(q));
        }
        quotesList.appendChild(item);
      }
    },
  };
}
