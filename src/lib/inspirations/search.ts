import { inspirationsApi } from './api';
import { INSPIRATIONS_ROUTES } from './routes';
import { INDUSTRY_LABEL, SCREEN_TYPE_LABEL } from './taxonomy';
import type { Industry, ScreenType } from './types';

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

export async function suggestQueries(raw: string, limit = 7): Promise<SearchSuggestion[]> {
  const q = raw.trim().toLowerCase();
  const [meta, apps, patterns] = await Promise.all([
    inspirationsApi.getMeta(),
    inspirationsApi.listApps(),
    inspirationsApi.listPatterns(),
  ]);

  const out: SearchSuggestion[] = [];

  const push = (s: SearchSuggestion) => {
    if (!out.some((existing) => existing.href === s.href)) out.push(s);
  };

  for (const app of apps) {
    if (!q || app.name.toLowerCase().includes(q)) {
      push({
        label: app.name,
        hint: `App · ${INDUSTRY_LABEL[app.industry] ?? app.industry} · ${app.screenCount} screens`,
        href: INSPIRATIONS_ROUTES.app(app),
        iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
      });
    }
  }

  for (const type of meta.taxonomy.screenTypes) {
    const label = SCREEN_TYPE_LABEL[type as ScreenType] ?? type;
    if (!q || label.toLowerCase().includes(q) || type.includes(q)) {
      push({ label: `${label} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${type}` });
    }
  }

  for (const industry of meta.taxonomy.industries) {
    const label = INDUSTRY_LABEL[industry as Industry] ?? industry;
    if (!q || label.toLowerCase().includes(q) || industry.includes(q)) {
      push({ label: `${label} apps`, hint: 'Industry', href: `${INSPIRATIONS_ROUTES.apps}?industry=${industry}` });
    }
  }

  for (const pattern of patterns) {
    if (!q || pattern.name.toLowerCase().includes(q)) {
      push({
        label: pattern.name,
        hint: `Pattern · ${pattern.category}`,
        href: INSPIRATIONS_ROUTES.pattern(pattern),
      });
    }
  }

  return out.slice(0, limit);
}
