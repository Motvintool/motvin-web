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
  if (picked.length) {
    // A light screen leads the card, so a grid of covers reads calm rather than a wall of dark: the admin's
    // first light pick, else the app's best light main screen ahead of the picks (the last one giving way).
    if (picked.some(isLight)) return [...picked.filter(isLight), ...picked.filter((s) => !isLight(s))];
    const light = mainCover(screens.filter(isLight), MAIN_SCREENS);
    return light ? [light, ...picked.filter((s) => s.id !== light.id)].slice(0, MAX_CARD_SCREENS) : picked;
  }
  const cover = coverScreen(screens);
  return cover ? [cover] : [];
}

const isLight = (screen: Screen) => (screen.style ?? []).includes('light');

/** What may stand in front of the admin's picks: the app's own front door, never a detail or help page. */
const MAIN_SCREENS = ['home', 'dashboard', 'feed', 'landing'];

/** The best settled screen of these types (cover order) among these, or null when none is one. */
function mainCover(screens: Screen[], types: string[] = COVER_ORDER): Screen | null {
  const settled = screens.filter((s) => !(s.states ?? []).some((v) => v !== 'keyboard' && v !== 'scrolled'));
  for (const type of types) {
    const match = settled.find((s) => s.screenType === type);
    if (match) return match;
  }
  return null;
}

export function coverScreen(screens: Screen[]): Screen | null {
  if (!screens.length) return null;
  // A light main screen first, when the app has one (see appCardScreens).
  const light = mainCover(screens.filter(isLight));
  if (light) return light;
  const settled = screens.filter((s) => !(s.states ?? []).some((v) => v !== 'keyboard' && v !== 'scrolled'));
  for (const type of COVER_ORDER) {
    const match = settled.find((s) => s.screenType === type);
    if (match) return match;
  }
  return settled.find((s) => !NOT_A_COVER.has(s.screenType)) ?? screens.find((s) => s.screenType !== 'splash') ?? screens[0];
}
