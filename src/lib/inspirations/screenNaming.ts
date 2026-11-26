import { pageTypeLabel, screenTypeLabel, sectionTypeLabel, sitePageName } from './taxonomy';

/**
 * One rule for what a screen is called, wherever it is shown — the screen
 * and flow previews, cards, search, compare, the lightbox and the admin. It
 * is the flow preview's rule: a screen the pipeline typed is called by its
 * type ("Form", "Sign-in"); one it could only call "Other" by its own name
 * ("Onboarding sharing"), which says more than "Other" does.
 */

type Nameable = {
  name?: string | null;
  screenType?: string | null;
  site?: { kind: 'page' | 'section'; pageType?: string | null; sectionType?: string | null; heading?: string | null } | null;
};

/**
 * What the screen is called: its type, or its own name when its type is "Other" or unknown. A website page is
 * called by its page type ("Pricing Page") and a section by its own ("Hero", or "Products menu" for a menu) —
 * never by the screen type its picture was classified as.
 */
export function screenTitle(screen: Nameable): string {
  const site = screen.site;
  if (site?.kind === 'page') return sitePageName(site);
  if (site?.kind === 'section') return site.sectionType === 'nav-menu' && site.heading ? site.heading : sectionTypeLabel(site.sectionType ?? 'content');
  const type = String(screen.screenType ?? '').trim();
  const name = String(screen.name ?? '').trim();
  if (type && type !== 'other') return screenTypeLabel(type);
  return name || (type ? screenTypeLabel(type) : 'Screen');
}

/** Where a screen is from, as its label says it: one of each, unlike the menus' "Web Apps" (taxonomy PLATFORM_LABEL). */
const LABEL_PLATFORM: Record<string, string> = { ios: 'iOS', webapp: 'Web App', site: 'Website' };

/**
 * A screenshot's alt text — what search engines index it under and screen readers say: the app, what the screen
 * is, and where it's from — "Coursera — Login screen (Web App)", "Stripe — Pricing Page (Website)". Built from
 * the screen's own data, so every screen added gets one. Without the app's name (not loaded yet) it's the rest.
 */
export function screenLabel(screen: Nameable & { platform?: string | null }, appName?: string | null): string {
  const title = screenTitle(screen);
  // A website page's title already says "Page"; a plain screen title doesn't say what it is.
  const what =
    screen.site?.kind === 'page' ? title : screen.site?.kind === 'section' ? `${title} section` : title === 'Screen' ? title : `${title} screen`;
  const where = LABEL_PLATFORM[screen.platform ?? ''];
  const label = where ? `${what} (${where})` : what;
  return appName ? `${appName} — ${label}` : label;
}

/**
 * A store screenshot's alt text, as screenLabel's for a screen: the app, which of its set (counted from 1) and
 * where — "Canva — App Store screenshot 1 (iOS)", or "Notion — Screenshot 2 (Web App)" for images the admin added.
 */
export function storeShotLabel(appName: string, source: 'appstore' | 'manual', platform: string, number: number): string {
  const what = `${source === 'appstore' ? 'App Store screenshot' : 'Screenshot'} ${number}`;
  const where = LABEL_PLATFORM[platform];
  return `${appName} — ${where ? `${what} (${where})` : what}`;
}

type FlowLike = { id: string; name: string; parentId?: string | null; screenIds: string[] };

/** The flow a screen is a step of — a top-level one first, over a detour inside it. */
export function flowOfScreen<F extends FlowLike>(flows: readonly F[], screenId: string): F | null {
  return flows.find((flow) => !flow.parentId && flow.screenIds.includes(screenId)) ?? flows.find((flow) => flow.screenIds.includes(screenId)) ?? null;
}

/**
 * What a screen is called inside a flow: its title, unless that only repeats
 * the flow's name ("Onboarding" in Onboarding) — then its own name, which
 * says which step it is.
 */
export function screenTitleIn(flow: { name: string } | null | undefined, screen: Nameable): string {
  const title = screenTitle(screen);
  const name = String(screen.name ?? '').trim();
  return flow && name && title.toLowerCase() === flow.name.trim().toLowerCase() ? name : title;
}

/** The path a screen is shown under: app, the flow it is a step of, then the screen. */
export function screenTrail(app: { name: string } | null | undefined, flow: { name: string } | null | undefined, screen: Nameable): string[] {
  return [app?.name, flow?.name, screenTitleIn(flow, screen)].filter((part): part is string => Boolean(part));
}
