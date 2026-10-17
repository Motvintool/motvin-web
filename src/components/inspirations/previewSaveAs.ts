import type { SavedItemType, Screen } from '@/lib/inspirations/types';

type SaveAs = (screen: Screen) => { type: SavedItemType; id: string };

/**
 * How the grids on the page save their screens (ScreenGrid's `saveItem`): a
 * UI Elements or Patterns grid saves its screens as UI elements or patterns.
 * The screen preview is mounted outside the grid, so a grid registers here
 * while it's on the page, and the preview's Save asks for the screen it shows,
 * saving it the same way the grid's own selection would.
 */
const grids = new Map<symbol, { ids: Set<string>; saveAs: SaveAs }>();

export function registerSaveAs(key: symbol, ids: string[], saveAs: SaveAs) {
  grids.set(key, { ids: new Set(ids), saveAs });
}

export function unregisterSaveAs(key: symbol) {
  grids.delete(key);
}

/** What this screen saves as here; a plain screen when no grid says otherwise. */
export function saveItemFor(screen: Screen): { type: SavedItemType; id: string } {
  for (const { ids, saveAs } of grids.values()) {
    if (ids.has(screen.id)) return saveAs(screen);
  }
  return { type: 'screen', id: screen.id };
}
