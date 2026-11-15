import { inspirationsApi } from './api';
import { appCardScreens } from './cover';
import type { Screen } from './types';

export type CoverShot = { src: string; ratio: number };

const PHONE_RATIO = 390 / 844;

/** Shown when the library can't be reached, so the pictures never go missing. */
export const FALLBACK_COVER_SHOTS: CoverShot[] = [
  'home-front', 'checkout-back', 'dashboard-front', 'login-back', 'search-front',
  'signup-back', 'setting-front', 'home-back', 'checkout-front', 'dashboard-back',
  'login-front', 'search-back', 'signup-front', 'setting-back', 'app',
].map((name) => ({ src: `/ASSET/search-modal/top-rated/${name}.png`, ratio: PHONE_RATIO }));

/**
 * The pictures the Apps page puts on its app cards: each iOS app's carousel
 * (the admin's picks, else its single cover), dealt out one app at a time so
 * neighbouring pictures come from different apps. Empty when nothing loads.
 */
export async function loadAppCoverShots(): Promise<CoverShot[]> {
  const apps = (await inspirationsApi.listApps()).filter((app) => app.platforms.includes('ios'));
  const details = await Promise.all(apps.map((app) => inspirationsApi.getApp(app.id)));
  const perApp = apps.map((app, i) =>
    appCardScreens(app, (details[i]?.screens ?? []).filter((screen) => screen.platform === 'ios')),
  );
  const total = perApp.reduce((sum, screens) => sum + screens.length, 0);
  const dealt: Screen[] = [];
  for (let round = 0; dealt.length < total; round++) {
    for (const screens of perApp) if (screens[round]) dealt.push(screens[round]);
  }
  return dealt
    .map((screen) => ({
      src: inspirationsApi.mediaUrl(screen.url) ?? '',
      ratio: screen.width && screen.height ? screen.width / screen.height : PHONE_RATIO,
    }))
    .filter((shot) => shot.src);
}
