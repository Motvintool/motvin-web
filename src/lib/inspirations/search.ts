import { inspirationsApi } from './api';
import { countsOn, PLATFORM_ONE } from './appCounts';
import { INSPIRATIONS_ROUTES } from './routes';
import { INDUSTRY_LABEL, screenTypeLabel } from './taxonomy';
import type { Industry, Platform } from './types';

/**
 * Suggestions for the global search field.
 *
 * Built from what the store actually holds — its apps, the screen types and
 * industries present, and the patterns that matched real screens. An empty
 * store therefore suggests nothing rather than advertising content that is
 * not there. Ranking of actual results happens server-side.
 */

/** Words that ask for App Store screenshots, and the names they go by. */
const SHOT_WORDS = /\b(app ?store|store|screenshots?|screen ?shots?)\b/;
const SHOT_NAMES = ['screenshots', 'app store screenshots', 'store screenshots'];

export type SearchSuggestion = {
  label: string;
  hint: string;
  href: string;
  iconSrc?: string;
};

/**
 * `scope`: the platforms being searched (the search box's iOS or Webs switch). Every suggestion is of that
 * section — only apps on it, only screen types, industries and patterns it has screens of — and opens there.
 */
export async function suggestQueries(raw: string, limit = 7, scope?: readonly Platform[]): Promise<SearchSuggestion[]> {
  const q = raw.trim().toLowerCase();
  const [meta, allApps, patterns] = await Promise.all([
    inspirationsApi.getMeta(),
    inspirationsApi.listApps(),
    inspirationsApi.listPatterns(),
  ]);
  const scoped = Boolean(scope?.length);
  const inScope = (platform: Platform) => !scoped || scope!.includes(platform);
  const apps = allApps.filter((app) => app.platforms.some(inScope));
  // The section's own address for the lists (Webs is ?platform=web; iOS is the default and needs none).
  const section = scoped && !scope!.includes('ios') ? 'platform=web' : '';
  const withSection = (href: string) => (section ? `${href}${href.includes('?') ? '&' : '?'}${section}` : href);
  // What the section actually has: its apps' screen types (one small answer for every app), and the
  // patterns with a screen on it — a screen id reads "<app>-<platform>-…".
  const typesHere = scoped
    ? new Set([...(await inspirationsApi.appFacets(scope!)).values()].flatMap((facets) => facets.screens))
    : null;
  const platformOfId = (id: string): Platform | null => {
    const app = allApps.find((entry) => id.startsWith(`${entry.id}-`));
    const platform = app ? id.slice(app.id.length + 1).split('-')[0] : '';
    return platform === 'ios' || platform === 'webapp' || platform === 'site' ? platform : null;
  };

  const out: SearchSuggestion[] = [];

  const push = (s: SearchSuggestion) => {
    if (!out.some((existing) => existing.href === s.href)) out.push(s);
  };

  // App Store screenshots: asked for by name ("screenshots", "app store", "airbnb screenshots"), they lead —
  // the page of every set, then each app's own. An app's name alone lists its set just after the app.
  const shotSets = apps.flatMap((app) => {
    const platform = app.platforms.find((p) => inScope(p) && (app.storeShots?.[p]?.images.length ?? 0) > 0);
    return platform ? [{ app, platform, count: app.storeShots![platform]!.images.length }] : [];
  });
  // Half a name ("scree", "app sto") asks for them all; a whole word may come with an app's name ("airbnb store").
  const typingName = q.length >= 5 && SHOT_NAMES.some((name) => name.startsWith(q));
  const asksShots = typingName || SHOT_WORDS.test(q);
  const rest = typingName ? '' : q.replace(new RegExp(SHOT_WORDS.source, 'g'), ' ').replace(/\s+/g, ' ').trim();
  const shotOf = ({ app, platform, count }: (typeof shotSets)[number]): SearchSuggestion => ({
    label: `${app.name.split(' — ')[0]} App Store screenshots`,
    hint: `${PLATFORM_ONE[platform]} · ${count} screenshot${count === 1 ? '' : 's'}`,
    href: INSPIRATIONS_ROUTES.app(app, platform, { platform, shots: '1' }),
    iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
  });
  if (asksShots && shotSets.length) {
    if (!rest) push({ label: 'App Store screenshots', hint: `${shotSets.length} app${shotSets.length === 1 ? '' : 's'}`, href: withSection(INSPIRATIONS_ROUTES.screenshots) });
    for (const entry of shotSets) if (!rest || entry.app.name.toLowerCase().includes(rest)) push(shotOf(entry));
  }

  for (const app of apps) {
    if (!q || app.name.toLowerCase().includes(q)) {
      // The platform it is found on, in place of a plain "App": "Web App · AI · 33 screens".
      const platform = app.platforms.find(inScope) ?? app.platforms[0];
      push({
        label: app.name,
        hint: `${platform ? PLATFORM_ONE[platform] : 'App'} · ${INDUSTRY_LABEL[app.industry] ?? app.industry} · ${countsOn(app, platform ? [platform] : scope).screens} screens`,
        href: INSPIRATIONS_ROUTES.app(app, platform),
        iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
      });
      const shots = q ? shotSets.find((entry) => entry.app === app) : undefined;
      if (shots) push(shotOf(shots));
    }
  }

  for (const type of meta.taxonomy.screenTypes) {
    if (typesHere && !typesHere.has(type)) continue;
    const label = screenTypeLabel(type);
    if (!q || label.toLowerCase().includes(q) || type.includes(q)) {
      push({ label: `${label} screens`, hint: 'Screen type', href: withSection(`${INSPIRATIONS_ROUTES.screens}?type=${type}`) });
    }
  }

  for (const industry of meta.taxonomy.industries) {
    if (scoped && !apps.some((app) => app.industry === industry)) continue;
    const label = INDUSTRY_LABEL[industry as Industry] ?? industry;
    if (!q || label.toLowerCase().includes(q) || industry.includes(q)) {
      push({ label: `${label} apps`, hint: 'Industry', href: withSection(`${INSPIRATIONS_ROUTES.apps}?industry=${industry}`) });
    }
  }

  for (const pattern of patterns) {
    if (scoped && !pattern.screenIds.some((id) => { const platform = platformOfId(id); return platform !== null && inScope(platform); })) continue;
    if (!q || pattern.name.toLowerCase().includes(q)) {
      push({
        label: pattern.name,
        hint: `Pattern · ${pattern.category}`,
        href: withSection(INSPIRATIONS_ROUTES.pattern(pattern)),
      });
    }
  }

  return out.slice(0, limit);
}
