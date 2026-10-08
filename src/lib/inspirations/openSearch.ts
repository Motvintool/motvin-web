/**
 * Lets any page open the search modal on one of its sections — the Explore page's column
 * titles ("Screens", "UI Elements"…) use it. The modal lives in the shell's header, so this
 * is a window event rather than a prop: no page needs a reference to it.
 */

export type SearchSection = 'top' | 'categories' | 'screens' | 'elements' | 'flows';

export const OPEN_SEARCH_EVENT = 'motvin:open-search';

export function openSearch(section: SearchSection = 'top') {
  window.dispatchEvent(new CustomEvent<{ section: SearchSection }>(OPEN_SEARCH_EVENT, { detail: { section } }));
}
