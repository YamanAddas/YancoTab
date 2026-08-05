/**
 * quickLinks/quickLinksActions.js — the add/remove flows, shared.
 *
 * Two surfaces edit quick links: the Web pane (where you are looking at
 * them) and Settings → Home & widgets (where you go to configure things).
 * Both need the same two-step prompt, the same refusal messages and the
 * same write. Keeping the flow here is what stops one of them from
 * quietly accepting something the other rejects.
 *
 * Every function returns whether it actually changed storage, so the
 * caller can re-render only when there is something new to draw.
 */

import { showConfirm, showPrompt } from '../components/YancoModal.js';
import { addLink, removeLink, suggestLabel, LINKS_KEY } from './quickLinksModel.js';

/**
 * Prompt for a URL, then a display name, and store the result.
 * @returns {Promise<boolean>} true when a link was added
 */
export async function promptAddLink(kernel) {
  const url = await showPrompt('Add Link', 'Website address', '', { placeholder: 'example.com' });
  if (!url) return false;

  const suggested = suggestLabel(url);

  // Validate BEFORE asking for a name. `addLink` is pure, so running it
  // twice costs nothing, and it means a refused URL is refused at the step
  // where it was typed — rather than after making the user name a link
  // that was never going to be stored.
  const dryRun = addLink(kernel?.storage?.load(LINKS_KEY), url, suggested);
  if (dryRun.error) {
    kernel?.emit?.('toast', { message: dryRun.error, type: 'error' });
    return false;
  }

  const typed = await showPrompt('Link Name', 'Shown under the icon', suggested);
  // A cancelled second prompt still adds the link under its default name.
  // The user already committed to the URL at the first step, and throwing
  // that away because they dismissed a cosmetic follow-up is the worse
  // surprise of the two.
  const res = addLink(kernel?.storage?.load(LINKS_KEY), url, typed || suggested);
  if (res.error) {
    kernel?.emit?.('toast', { message: res.error, type: 'error' });
    return false;
  }
  kernel?.storage?.save(LINKS_KEY, res.links);
  kernel?.emit?.('toast', { message: 'Link added', type: 'success' });
  return true;
}

/**
 * Confirm, then remove.
 * @returns {Promise<boolean>} true when a link was removed
 */
export async function confirmRemoveLink(kernel, link) {
  if (!link?.url) return false;
  const name = link.label || link.url;
  if (!await showConfirm('Remove Link', `Remove "${name}" from the Web page?`)) return false;
  kernel?.storage?.save(LINKS_KEY, removeLink(kernel?.storage?.load(LINKS_KEY), link.url));
  kernel?.emit?.('toast', { message: 'Link removed', type: 'info' });
  return true;
}
