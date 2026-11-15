import type { App, Platform } from './types';

/**
 * The "go to the real product" button, worded for the platform it is on: an
 * iOS screen offers the App Store, a Web App one the app itself, a Web one the
 * site itself. The destination is the app's recorded website for all of
 * them; an app with no website has nowhere to send a Web visitor, so that
 * button is left off rather than shown dead (mobile keeps its button — the
 * store listing is the point of it, and the link is filled in as it is
 * recorded).
 */
export type StoreAction = { label: string; icon: string; href: string };

export function storeAction(platform: Platform, website: string | null | undefined): StoreAction | null {
  const href = website?.trim() || '';
  switch (platform) {
    case 'web':
      return href ? { label: 'Visit website', icon: '/ASSET/Icons/Motvin/web.svg', href } : null;
    case 'webapp':
      return href ? { label: 'Open web app', icon: '/ASSET/Icons/Motvin/web.svg', href } : null;
    default:
      return { label: 'View in App Store', icon: '/ASSET/Icons/Motvin/view-apps.svg', href: href || '#' };
  }
}

/**
 * The platform an app page speaks for: iOS when the app is there (the
 * library's default), else Web Apps, else Webs — so an online-only product is not
 * presented as an App Store listing.
 */
export function appPlatform(app: Pick<App, 'platforms'>): Platform {
  if (app.platforms.includes('ios')) return 'ios';
  if (app.platforms.includes('webapp')) return 'webapp';
  return app.platforms[0] ?? 'ios';
}
