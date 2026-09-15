import { APPS, APP_BY_ID, FLOWS, PATTERNS, SCREENS } from './data/build';
import {
  INDUSTRY_LABEL,
  PLATFORM_LABEL,
  SCREEN_TYPE_LABEL,
  STYLE_LABEL,
} from './taxonomy';
import type { App, Flow, Industry, Pattern, Platform, Screen, ScreenType, Style } from './types';

/**
 * Natural-language search over the catalogue.
 *
 * This is a lexical scorer: it maps query words onto the taxonomy (industry,
 * screen type, platform, style), app names, tags and pattern names, and ranks
 * by how many facets a result satisfies. It is deliberately structured as
 * `query → SearchIntent → ranked results` so a vector/semantic backend can
 * replace `interpretQuery` + the scorers without touching the UI.
 */

export type SearchIntent = {
  raw: string;
  terms: string[];
  industries: Industry[];
  screenTypes: ScreenType[];
  platforms: Platform[];
  styles: Style[];
  /** Words left after taxonomy extraction — matched against names and tags. */
  free: string[];
};

export type SearchResults = {
  intent: SearchIntent;
  apps: App[];
  screens: Screen[];
  flows: Flow[];
  patterns: Pattern[];
  total: number;
};

const SYNONYMS: Record<string, string[]> = {
  // industries
  bank: ['fintech'], banking: ['fintech'], payments: ['fintech'], wallet: ['fintech'], money: ['fintech', 'finance'],
  invest: ['finance'], investing: ['finance'], stocks: ['finance'], portfolio: ['finance'], crypto: ['finance'], trading: ['finance'],
  health: ['healthcare'], fitness: ['healthcare'], medical: ['healthcare'], wellness: ['healthcare'], workout: ['healthcare'],
  shop: ['ecommerce'], shopping: ['ecommerce'], store: ['ecommerce'], retail: ['ecommerce'], cart: ['ecommerce', 'checkout'],
  learn: ['education'], learning: ['education'], course: ['education'], courses: ['education'], school: ['education'],
  trip: ['travel'], trips: ['travel'], hotel: ['travel'], booking: ['travel'], flights: ['travel'], stay: ['travel'],
  tasks: ['productivity'], notes: ['productivity'], project: ['productivity'], todo: ['productivity'], calendar: ['productivity'],
  chat: ['ai'], assistant: ['ai'], copilot: ['ai'], llm: ['ai'], generative: ['ai'], ml: ['ai'],
  community: ['social'], creators: ['social'], messaging: ['social'], posts: ['social'],
  b2b: ['saas'], software: ['saas'], analytics: ['saas', 'dashboard'], admin: ['saas', 'dashboard'],
  // screen types
  home: ['landing', 'feed'], homepage: ['landing'], hero: ['landing'], marketing: ['landing'],
  signin: ['login'], 'sign-in': ['login'], auth: ['login', 'signup'], register: ['signup'], registration: ['signup'],
  overview: ['dashboard'], kpi: ['dashboard'], metrics: ['dashboard'], insights: ['dashboard'], reports: ['dashboard'],
  results: ['search'], browse: ['search'], explore: ['search'], filter: ['search'], filters: ['search'],
  plans: ['pricing'], plan: ['pricing'], subscription: ['pricing'], billing: ['pricing'],
  payment: ['checkout'], pay: ['checkout'], order: ['checkout'],
  preferences: ['settings'], account: ['settings', 'profile'],
  welcome: ['onboarding'], intro: ['onboarding'], walkthrough: ['onboarding'],
  timeline: ['feed'], activity: ['feed'],
  detail: ['product'], details: ['product'], listing: ['product'],
  empty: ['other'], success: ['other'], confirmation: ['other'], error: ['other'],
  // platforms
  mobile: ['ios', 'android'], app: ['ios', 'android'], iphone: ['ios'], desktop: ['web'], website: ['web'], site: ['web'],
  // styles
  clean: ['minimal'], simple: ['minimal'], modern: ['minimal'], black: ['dark'], night: ['dark'], white: ['light'],
  bright: ['light'], fun: ['playful'], colorful: ['playful'], colourful: ['playful'], enterprise: ['corporate'],
  professional: ['corporate'], magazine: ['editorial'], typographic: ['editorial'], loud: ['bold'], weird: ['experimental'],
};

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'for', 'of', 'with', 'in', 'on', 'to', 'beautiful', 'nice', 'best', 'good', 'great', 'ui', 'ux', 'design', 'designs', 'screen', 'screens', 'page', 'pages', 'example', 'examples', 'inspiration']);

const INDUSTRY_SET = new Set<string>(Object.keys(INDUSTRY_LABEL));
const SCREEN_TYPE_SET = new Set<string>(Object.keys(SCREEN_TYPE_LABEL));
const PLATFORM_SET = new Set<string>(Object.keys(PLATFORM_LABEL));
const STYLE_SET = new Set<string>(Object.keys(STYLE_LABEL));

function normalize(word: string): string {
  const w = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (w === 'e-commerce' || w === 'ecom') return 'ecommerce';
  if (w === 'dashboards') return 'dashboard';
  if (w === 'logins') return 'login';
  if (w === 'onboardings') return 'onboarding';
  if (w === 'feeds') return 'feed';
  if (w === 'profiles') return 'profile';
  if (w === 'checkouts') return 'checkout';
  if (w === 'settings') return 'settings';
  if (w === 'products') return 'product';
  return w;
}

export function interpretQuery(raw: string): SearchIntent {
  const terms = raw.split(/\s+/).map(normalize).filter((t) => t && !STOP.has(t));
  const intent: SearchIntent = {
    raw: raw.trim(),
    terms,
    industries: [],
    screenTypes: [],
    platforms: [],
    styles: [],
    free: [],
  };
  const add = <T extends string>(list: T[], value: T) => {
    if (!list.includes(value)) list.push(value);
  };
  for (const term of terms) {
    const candidates = [term, ...(SYNONYMS[term] ?? [])];
    let matched = false;
    for (const c of candidates) {
      if (INDUSTRY_SET.has(c)) { add(intent.industries, c as Industry); matched = true; }
      if (SCREEN_TYPE_SET.has(c)) { add(intent.screenTypes, c as ScreenType); matched = true; }
      if (PLATFORM_SET.has(c)) { add(intent.platforms, c as Platform); matched = true; }
      if (STYLE_SET.has(c)) { add(intent.styles, c as Style); matched = true; }
    }
    // Keep the term for name/tag matching even if it mapped to a facet —
    // "checkout" should still boost screens tagged checkout.
    if (!matched || term.length > 3) intent.free.push(term);
  }
  return intent;
}

function includesAny(haystack: string, needles: string[]): number {
  const h = haystack.toLowerCase();
  return needles.reduce((n, w) => (h.includes(w) ? n + 1 : n), 0);
}

function scoreScreen(screen: Screen, intent: SearchIntent): number {
  let score = 0;
  const app = APP_BY_ID.get(screen.appId);
  if (intent.industries.includes(screen.industry)) score += 3;
  if (intent.screenTypes.includes(screen.screenType)) score += 4;
  if (intent.platforms.includes(screen.platform)) score += 2;
  score += intent.styles.filter((s) => screen.style.includes(s)).length * 2;
  score += includesAny(`${screen.name} ${screen.tags.join(' ')} ${app?.name ?? ''}`, intent.free);
  // Every facet the user named must be honoured; otherwise drop the screen.
  if (intent.industries.length && !intent.industries.includes(screen.industry)) return 0;
  if (intent.screenTypes.length && !intent.screenTypes.includes(screen.screenType)) return 0;
  if (intent.platforms.length && !intent.platforms.includes(screen.platform)) return 0;
  if (intent.styles.length && !intent.styles.some((s) => screen.style.includes(s))) return 0;
  return score;
}

function scoreApp(app: App, intent: SearchIntent): number {
  let score = 0;
  if (intent.industries.includes(app.industry)) score += 3;
  if (intent.platforms.some((p) => app.platforms.includes(p))) score += 1;
  score += includesAny(`${app.name} ${app.tagline}`, intent.free) * 3;
  if (intent.industries.length && !intent.industries.includes(app.industry)) return 0;
  return score;
}

function scoreFlow(flow: Flow, intent: SearchIntent, screenScores: Map<string, number>): number {
  const app = APP_BY_ID.get(flow.appId);
  let score = includesAny(`${flow.name} ${flow.category} ${app?.name ?? ''}`, intent.free) * 2;
  const stepScores = flow.screenIds.map((id) => screenScores.get(id) ?? 0);
  score += Math.max(0, ...stepScores) / 2;
  if (intent.platforms.length && !intent.platforms.includes(flow.platform)) return 0;
  if (app && intent.industries.length && !intent.industries.includes(app.industry)) return 0;
  return score;
}

function scorePattern(pattern: Pattern, intent: SearchIntent): number {
  return (
    includesAny(`${pattern.name} ${pattern.category} ${pattern.tags.join(' ')}`, intent.free) * 2 +
    (intent.screenTypes.some((t) => pattern.tags.includes(t) || pattern.slug.includes(t)) ? 2 : 0)
  );
}

export function searchCatalogue(raw: string): SearchResults {
  const intent = interpretQuery(raw);
  if (!intent.terms.length) {
    return { intent, apps: [], screens: [], flows: [], patterns: [], total: 0 };
  }

  const screenScores = new Map<string, number>();
  const screens = SCREENS.map((s) => ({ s, score: scoreScreen(s, intent) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.s.createdAt.localeCompare(b.s.createdAt))
    .map((r) => {
      screenScores.set(r.s.id, r.score);
      return r.s;
    });

  const apps = APPS.map((a) => ({ a, score: scoreApp(a, intent) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.a);

  const flows = FLOWS.map((f) => ({ f, score: scoreFlow(f, intent, screenScores) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.f);

  const patterns = PATTERNS.map((p) => ({ p, score: scorePattern(p, intent) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((r) => r.p);

  return {
    intent,
    apps,
    screens,
    flows,
    patterns,
    total: apps.length + screens.length + flows.length + patterns.length,
  };
}

/** Suggestions for the global search dropdown. */
export type SearchSuggestion = {
  label: string;
  hint: string;
  href: string;
};

export const TRENDING_QUERIES = [
  'minimal fintech dashboard',
  'dark AI dashboard',
  'mobile banking',
  'clean SaaS pricing page',
  'modern onboarding',
  'beautiful checkout',
];

export function suggestQueries(raw: string, limit = 7): SearchSuggestion[] {
  const q = raw.trim().toLowerCase();
  if (!q) {
    return TRENDING_QUERIES.slice(0, limit).map((t) => ({
      label: t,
      hint: 'Trending',
      href: `/inspirations/search?q=${encodeURIComponent(t)}`,
    }));
  }
  const out: SearchSuggestion[] = [];
  for (const app of APPS) {
    if (app.name.toLowerCase().includes(q)) {
      out.push({ label: app.name, hint: `App · ${INDUSTRY_LABEL[app.industry]}`, href: `/inspirations/app/${app.slug}` });
    }
  }
  for (const [key, label] of Object.entries(SCREEN_TYPE_LABEL)) {
    if (label.toLowerCase().includes(q) || key.includes(q)) {
      out.push({ label: `${label} screens`, hint: 'Screen type', href: `/inspirations/screens?type=${key}` });
    }
  }
  for (const [key, label] of Object.entries(INDUSTRY_LABEL)) {
    if (label.toLowerCase().includes(q) || key.includes(q)) {
      out.push({ label: `${label} apps`, hint: 'Industry', href: `/inspirations/apps?industry=${key}` });
    }
  }
  for (const pattern of PATTERNS) {
    if (pattern.name.toLowerCase().includes(q)) {
      out.push({ label: pattern.name, hint: `Pattern · ${pattern.category}`, href: `/inspirations/pattern/${pattern.slug}` });
    }
  }
  for (const t of TRENDING_QUERIES) {
    if (t.includes(q) && t !== q) {
      out.push({ label: t, hint: 'Suggested', href: `/inspirations/search?q=${encodeURIComponent(t)}` });
    }
  }
  return out.slice(0, limit);
}
