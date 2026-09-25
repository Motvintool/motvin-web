import type { Screen } from './types';

/**
 * The screen that stands for an app on its card.
 *
 * Screens are stored in the order they were walked, so the first one is the
 * splash — a colour and a logo, which says nothing about the product. The
 * cover is the app's home when there is one, then a dashboard or feed, then
 * any settled full screen; a splash, a loading state, an overlay or an empty
 * state is used only when nothing better exists.
 */
const COVER_ORDER = ['home', 'dashboard', 'feed', 'landing', 'search', 'detail', 'product', 'profile'];
const NOT_A_COVER = new Set(['splash', 'loading', 'modal', 'empty', 'error', 'permission', 'success']);

export function coverScreen(screens: Screen[]): Screen | null {
  if (!screens.length) return null;
  const settled = screens.filter((s) => !(s.states ?? []).some((v) => v !== 'keyboard' && v !== 'scrolled'));
  for (const type of COVER_ORDER) {
    const match = settled.find((s) => s.screenType === type);
    if (match) return match;
  }
  return settled.find((s) => !NOT_A_COVER.has(s.screenType)) ?? screens.find((s) => s.screenType !== 'splash') ?? screens[0];
}
