import { inspirationsApi } from './api';
import { DEFAULT_FRESHNESS, freshFirst, newThisWeek } from './appFreshness';
import { utcDateString } from './dates';
import { browsedPlatforms, parseFilters, withDefaultPlatform } from './filters';
import { APP_CARDS_SEED, FEED_SEED } from './seedKeys';
import type { Flow, Platform, Screen } from './types';

/**
 * The first answers a library page's data hooks need, fetched on the server so the page's HTML holds its content
 * (see SeedProvider): what search engines read, and what a visitor sees before the browser has asked for anything.
 *
 * Only a section's plain address is seeded — `/inspirations/screens`, or with `?platform=web` — the one search
 * engines list (see sectionPath). A filtered or sorted view loads in the browser as before. Each key is exactly
 * the one the page's hook asks with, and its value what that hook's loader returns. Flows and Patterns are too big
 * to send whole (megabytes), so they're seeded with just what shows first; the full set replaces it once loaded.
 *
 * Answers are kept for a few minutes: the API client's own server cache lasts seconds, and Patterns alone is
 * some thirty requests.
 */

export type SeededSection = 'explore' | 'apps' | 'new' | 'screens' | 'ui-elements' | 'flows' | 'patterns' | 'screenshots' | 'sites';

type SearchParams = Record<string, string | string[] | undefined>;

const KEEP_MS = 5 * 60_000;
/** A load the API hasn't answered by now is given up (and not kept), so the next page view asks afresh. */
const GIVE_UP_MS = 8_000;
/**
 * How long a page waits for its seeds. Past it the page renders without the ones still loading — their hooks load
 * in the browser, as without a seed — so a slow API never holds a page. Those loads carry on for the next view.
 */
const PAGE_WAIT_MS = 2_000;

const kept = new Map<string, { at: number; value: Promise<unknown> }>();

/** Resolves to `value` after `ms`. */
const after = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));

/** One answer, shared by every page view for a few minutes; a failure (or no answer in GIVE_UP_MS) isn't kept. */
function remember<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = kept.get(key);
  if (hit && Date.now() - hit.at < KEEP_MS) return hit.value as Promise<T>;
  const value = Promise.race([load(), after(GIVE_UP_MS, null).then(() => Promise.reject(new Error('API too slow')))]);
  kept.set(key, { at: Date.now(), value });
  value.catch(() => {
    if (kept.get(key)?.value === value) kept.delete(key);
  });
  return value;
}

/** Flows first shown (FlowsView's PAGE) and pattern screens first shown (PatternsView's PAGE). */
const FLOWS_SHOWN = 24;
const PATTERN_SCREENS_SHOWN = 60;

async function flowSeeds(platforms: Platform[]): Promise<Record<string, unknown>> {
  const flows = await inspirationsApi.listFlows();
  // FlowsView's list with no filter: this section's flows of more than one screen, in the API's order.
  const shown = flows.filter((f) => platforms.includes(f.platform) && f.screenIds.length > 1).slice(0, FLOWS_SHOWN);
  const full = await Promise.all(shown.map((f) => inspirationsApi.getFlow(f.id).catch(() => null)));
  return {
    'flows:all': shown,
    [`flow-screens:${shown.map((f) => f.id).join(',')}`]: full
      .filter((entry): entry is { flow: Flow; screens: Screen[]; app: null } => Boolean(entry))
      .map(({ flow, screens }) => ({ flow, screens })),
  };
}

async function patternSeeds(platforms: Platform[]): Promise<Record<string, unknown>> {
  const patterns = await inspirationsApi.listPatterns();
  const full = await Promise.all(patterns.map((p) => inspirationsApi.getPattern(p.slug).catch(() => null)));
  // PatternsView's grid with nothing picked: every pattern's screens on this section, in order, each once.
  const shown = new Set<string>();
  for (const entry of full) {
    for (const s of entry?.screens ?? []) {
      if (shown.size >= PATTERN_SCREENS_SHOWN) break;
      if (platforms.includes(s.platform)) shown.add(s.id);
    }
  }
  return {
    'patterns-with-screens': patterns.map((pattern, i) => ({
      // A pattern's own list of every screen it's on is most of its weight, and the page doesn't read it.
      pattern: { ...pattern, screenIds: [] },
      screens: (full[i]?.screens ?? []).filter((s) => shown.has(s.id)),
    })),
  };
}

/** App cards seeded: AppsGrid shows 8 at first, then 8 more as the visitor scrolls. */
const APP_CARDS_SHOWN = 16;

/**
 * An app list's page (Apps, New this week, Explore): the app list under the page's own key, and the first cards'
 * screens — AppsGrid holds every card until its screens are in. The order is the page's with nothing picked: the
 * admin's picks on New this week, else newest first. Were it ever to differ, AppsGrid asks for the cards it lacks.
 */
async function appListSeeds(section: 'explore' | 'apps' | 'new', platforms: Platform[], appsKey: string): Promise<Record<string, unknown>> {
  const [apps, meta] = await Promise.all([inspirationsApi.listApps(), inspirationsApi.getMeta()]);
  const inSection = apps.filter((app) => app.platforms.some((p) => platforms.includes(p)));
  const settings = meta.settings ?? { freshness: DEFAULT_FRESHNESS };
  const order = section === 'new' ? newThisWeek(inSection, settings.newThisWeek, platforms) : freshFirst(inSection, settings.freshness, utcDateString(), platforms);
  const cards = await inspirationsApi.appCards(order.slice(0, APP_CARDS_SHOWN).map((app) => app.id), platforms);
  return { [appsKey]: apps, [APP_CARDS_SEED]: { platforms: platforms.join(','), cards: Object.fromEntries(cards) } };
}

/** The seeds for one library page at this address, or none when it's filtered (or the API can't be reached). */
export async function sectionSeeds(section: SeededSection, searchParams: SearchParams): Promise<Record<string, unknown>> {
  if (Object.keys(searchParams).some((name) => name !== 'platform')) return {};
  const raw = searchParams.platform;
  const platform = (Array.isArray(raw) ? raw[0] : raw) ?? null;
  const query = new URLSearchParams(platform ? { platform } : {});
  const platforms = browsedPlatforms(query);
  const sectionKey = platforms.join(',');

  const loads: Record<string, () => Promise<unknown>> = {
    // Counts and the taxonomy every page's toolbar and pills read.
    [`meta:${sectionKey}`]: () => inspirationsApi.getMeta(platforms),
    'meta:settings': () => inspirationsApi.getMeta(),
  };
  const bundles: (() => Promise<Record<string, unknown>>)[] = [];
  switch (section) {
    case 'explore':
      bundles.push(() => remember(`explore:${sectionKey}`, () => appListSeeds('explore', platforms, 'filtered-gallery-apps:true:curated')));
      break;
    case 'apps':
    case 'new':
      bundles.push(() => remember(`${section}:${sectionKey}`, () => appListSeeds(section, platforms, 'apps:all:curated')));
      break;
    case 'screens':
    case 'ui-elements':
      loads[FEED_SEED] = () => inspirationsApi.listScreens(withDefaultPlatform(parseFilters(query)), 0, 'curated', {});
      break;
    case 'screenshots':
      loads['apps:all'] = () => inspirationsApi.listApps();
      break;
    case 'sites':
      loads['sites:page'] = () => inspirationsApi.listSiteScreens('page', '', 1000);
      loads['sites:section'] = () => inspirationsApi.listSiteScreens('section', '', 1000);
      break;
    case 'flows':
      bundles.push(() => remember(`flows:${sectionKey}`, () => flowSeeds(platforms)));
      break;
    case 'patterns':
      bundles.push(() => remember(`patterns:${sectionKey}`, () => patternSeeds(platforms)));
      break;
  }

  // A key whose answer fails, or isn't in within PAGE_WAIT_MS, is left out: its hook loads in the browser, as
  // without a seed.
  const deadline = after(PAGE_WAIT_MS, {});
  const settled = await Promise.allSettled([
    ...Object.entries(loads).map(([key, load]) =>
      Promise.race([remember(`${sectionKey}|${key}`, load).then((value) => ({ [key]: value })), deadline]),
    ),
    ...bundles.map((bundle) => Promise.race([bundle(), deadline])),
  ]);
  return Object.assign({}, ...settled.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])));
}
