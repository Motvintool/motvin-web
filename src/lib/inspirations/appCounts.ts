import type { App, Platform } from './types';

/** One app's platform, said of that app ("iOS", "Web App", "Website") — not the library's section names. */
export const PLATFORM_ONE: Record<Platform, string> = { ios: 'iOS', webapp: 'Web App', web: 'Website' };

/**
 * An app's screens and flows on the given platforms — the section it is seen in. Claude in Webs counts
 * its web screens, in iOS its iPhone ones, never the two added together. With no platforms given (or an
 * older manifest without per-platform counts), the app's totals.
 */
export function countsOn(app: Pick<App, 'screenCount' | 'flowCount' | 'platformCounts'>, platforms?: readonly Platform[]): { screens: number; flows: number } {
  if (!app.platformCounts || !platforms?.length) return { screens: app.screenCount, flows: app.flowCount };
  let screens = 0;
  let flows = 0;
  for (const platform of platforms) {
    const counts = app.platformCounts[platform];
    if (!counts) continue;
    screens += counts.screens;
    flows += counts.flows;
  }
  return { screens, flows };
}

/** The platforms an app has counts for, in the library's order (iOS first). */
export function countedPlatforms(app: Pick<App, 'platformCounts' | 'platforms'>): Platform[] {
  return app.platforms.filter((platform) => app.platformCounts?.[platform]);
}
