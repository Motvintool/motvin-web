import type { App, Screen } from './types';

/** How many screens an app card cycles through — the same cap as useSiblingCycle's dots. */
export const MAX_CARD_SCREENS = 4;

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

/**
 * The screens an app's card shows, in order: the admin's pick when there is
 * one (only the ids that are actually among `screens`), otherwise the single
 * automatic cover. Never more than MAX_CARD_SCREENS; empty when the app has
 * no screens at all.
 */
export function appCardScreens(app: Pick<App, 'cardScreens'>, screens: Screen[]): Screen[] {
  const byId = new Map(screens.map((s) => [s.id, s]));
  const picked = (app.cardScreens ?? [])
    .map((id) => byId.get(id))
    .filter((s): s is Screen => Boolean(s))
    .slice(0, MAX_CARD_SCREENS);
  if (picked.length) return picked;
  const cover = coverScreen(screens);
  return cover ? [cover] : [];
}

export function coverScreen(screens: Screen[]): Screen | null {
  if (!screens.length) return null;
  const settled = screens.filter((s) => !(s.states ?? []).some((v) => v !== 'keyboard' && v !== 'scrolled'));
  for (const type of COVER_ORDER) {
    const match = settled.find((s) => s.screenType === type);
    if (match) return match;
  }
  return settled.find((s) => !NOT_A_COVER.has(s.screenType)) ?? screens.find((s) => s.screenType !== 'splash') ?? screens[0];
}
