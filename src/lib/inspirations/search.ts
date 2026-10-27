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
  // What the section actually has: its apps' screen types (their records are cached), and the patterns
  // with a screen on it — a screen id reads "<app>-<platform>-…".
  const typesHere = scoped
    ? new Set(
        (await Promise.all(apps.map((app) => inspirationsApi.getApp(app.id))))
          .flatMap((detail) => detail?.screens ?? [])
          .filter((screen) => inScope(screen.platform))
          .map((screen) => screen.screenType as string),
      )
    : null;
  const platformOfId = (id: string): Platform | null => {
    const app = allApps.find((entry) => id.startsWith(`${entry.id}-`));
    const platform = app ? id.slice(app.id.length + 1).split('-')[0] : '';
    return platform === 'ios' || platform === 'webapp' || platform === 'web' ? platform : null;
  };

  const out: SearchSuggestion[] = [];

  const push = (s: SearchSuggestion) => {
    if (!out.some((existing) => existing.href === s.href)) out.push(s);
  };

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
