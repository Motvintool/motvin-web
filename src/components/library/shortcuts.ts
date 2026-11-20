/**
 * Keyboard shortcuts in the item detail view, as [keys, action]: one entry per
 * key cap, so ←/→ shows as two keys. One list for the view's own "?" sheet
 * (DetailModal) and the Help panel, so the two can't drift apart. The keys
 * themselves are handled in DetailModal's keydown.
 */
export const DETAIL_SHORTCUTS: ReadonlyArray<readonly [keys: readonly string[], action: string]> = [
  [['C'], 'Copy SVG'],
  [['D'], 'Download SVG'],
  [['P'], 'Download PNG'],
  [['S'], 'Save / Unsave'],
  [['F'], 'Find similar'],
  [['E'], 'Expand'],
  [['G'], 'Toggle grid'],
  [['R'], 'Reset'],
  [['←', '→'], 'Prev / Next'],
  [['Esc'], 'Close'],
  [['?'], 'Show shortcuts'],
];

/** The library-wide search shortcut, shown first in the Help panel's list. */
export const SEARCH_SHORTCUT: readonly string[] = ['⌘', 'K'];
