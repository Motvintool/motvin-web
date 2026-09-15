import { analyzeScreen, extractScreen, similarScreens, type UiAnalysis, type UiExtraction } from './analysis';
import {
  APPS,
  APP_BY_ID,
  APP_BY_SLUG,
  FLOWS,
  FLOW_BY_ID,
  PATTERNS,
  PATTERN_BY_SLUG,
  SCREENS,
  SCREEN_BY_ID,
} from './data/build';
import { matchesFilters, type ScreenFilters } from './filters';
import { searchCatalogue, suggestQueries, type SearchResults, type SearchSuggestion } from './search';
import type { App, ElementKind, Flow, LibraryCounts, Pattern, Screen } from './types';

/**
 * Data service for the Inspirations UI.
 *
 * Every function is async and returns plain data, so components never touch
 * the catalogue directly. Replacing the in-memory implementation with
 * `fetch('/api/inspirations/…')` — backed by Postgres for metadata, object
 * storage for screenshots and pgvector for similarity — changes this file
 * only. The small artificial latency keeps skeleton states honest in dev.
 */

const LATENCY_MS = 120;

function later<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

export type Page<T> = {
  items: T[];
  total: number;
  nextCursor: number | null;
};

export const PAGE_SIZE = 30;

function paginate<T>(all: readonly T[], cursor = 0, size = PAGE_SIZE): Page<T> {
  const items = all.slice(cursor, cursor + size);
  const next = cursor + size;
  return { items, total: all.length, nextCursor: next < all.length ? next : null };
}

export type ScreenSort = 'newest' | 'oldest' | 'app';

function sortScreens(list: Screen[], sort: ScreenSort): Screen[] {
  const out = [...list];
  if (sort === 'newest') out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  if (sort === 'oldest') out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (sort === 'app') out.sort((a, b) => a.appId.localeCompare(b.appId) || a.createdAt.localeCompare(b.createdAt));
  return out;
}

/** Interleaves apps so consecutive cards rarely share a source — reads as curated. */
function shuffleCurated(list: Screen[]): Screen[] {
  const byApp = new Map<string, Screen[]>();
  for (const s of list) {
    const bucket = byApp.get(s.appId) ?? [];
    bucket.push(s);
    byApp.set(s.appId, bucket);
  }
  const buckets = Array.from(byApp.values());
  const out: Screen[] = [];
  let remaining = list.length;
  let i = 0;
  while (remaining > 0) {
    const bucket = buckets[i % buckets.length];
    if (bucket.length) {
      out.push(bucket.shift()!);
      remaining--;
    }
    i++;
  }
  return out;
}

export const inspirationsApi = {
  async getCounts(): Promise<LibraryCounts> {
    const elementKinds = new Set<ElementKind>();
    SCREENS.forEach((s) => s.elements.forEach((e) => elementKinds.add(e)));
    return later(
      {
        apps: APPS.length,
        screens: SCREENS.length,
        'ui-elements': SCREENS.reduce((n, s) => n + s.elements.length, 0),
        flows: FLOWS.length,
        patterns: PATTERNS.length,
      },
      0,
    );
  },

  async listScreens(filters: ScreenFilters, cursor = 0, sort: ScreenSort | 'curated' = 'curated'): Promise<Page<Screen>> {
    let list = SCREENS.filter((s) => matchesFilters(s, filters));
    if (filters.query) {
      const ids = new Set(searchCatalogue(filters.query).screens.map((s) => s.id));
      list = list.filter((s) => ids.has(s.id));
    }
    const ordered = sort === 'curated' ? shuffleCurated(sortScreens(list, 'newest')) : sortScreens(list, sort);
    return later(paginate(ordered, cursor));
  },

  async listApps(industry?: App['industry']): Promise<App[]> {
    const list = industry ? APPS.filter((a) => a.industry === industry) : [...APPS];
    return later(list.sort((a, b) => b.screenCount - a.screenCount));
  },

  async getApp(slug: string): Promise<App | null> {
    return later(APP_BY_SLUG.get(slug) ?? null, 0);
  },

  async getAppScreens(appId: string): Promise<Screen[]> {
    return later(SCREENS.filter((s) => s.appId === appId));
  },

  async getAppFlows(appId: string): Promise<Flow[]> {
    return later(FLOWS.filter((f) => f.appId === appId));
  },

  async getScreen(id: string): Promise<Screen | null> {
    return later(SCREEN_BY_ID.get(id) ?? null, 0);
  },

  async getScreens(ids: string[]): Promise<Screen[]> {
    return later(ids.map((id) => SCREEN_BY_ID.get(id)).filter((s): s is Screen => Boolean(s)));
  },

  async getScreenFlows(screenId: string): Promise<Flow[]> {
    return later(FLOWS.filter((f) => f.screenIds.includes(screenId)));
  },

  async getScreenPatterns(screenId: string): Promise<Pattern[]> {
    return later(PATTERNS.filter((p) => p.screenIds.includes(screenId)));
  },

  async listFlows(category?: Flow['category']): Promise<Flow[]> {
    return later(category ? FLOWS.filter((f) => f.category === category) : [...FLOWS]);
  },

  async getFlow(id: string): Promise<Flow | null> {
    return later(FLOW_BY_ID.get(id) ?? null, 0);
  },

  async listPatterns(): Promise<Pattern[]> {
    return later([...PATTERNS]);
  },

  async getPattern(slug: string): Promise<Pattern | null> {
    return later(PATTERN_BY_SLUG.get(slug) ?? null, 0);
  },

  async listElementKinds(): Promise<{ kind: ElementKind; count: number; screenIds: string[] }[]> {
    const map = new Map<ElementKind, string[]>();
    for (const s of SCREENS) {
      for (const e of s.elements) {
        const arr = map.get(e) ?? [];
        arr.push(s.id);
        map.set(e, arr);
      }
    }
    return later(
      Array.from(map.entries())
        .map(([kind, screenIds]) => ({ kind, count: screenIds.length, screenIds }))
        .sort((a, b) => b.count - a.count),
    );
  },

  async search(query: string): Promise<SearchResults> {
    return later(searchCatalogue(query), 180);
  },

  async suggest(query: string): Promise<SearchSuggestion[]> {
    return later(suggestQueries(query), 0);
  },

  async similar(screenId: string, limit = 12): Promise<Screen[]> {
    const screen = SCREEN_BY_ID.get(screenId);
    return later(screen ? similarScreens(screen, limit) : []);
  },

  async analyze(screenId: string): Promise<UiAnalysis | null> {
    const screen = SCREEN_BY_ID.get(screenId);
    return later(screen ? analyzeScreen(screen) : null, 650);
  },

  async extract(screenId: string): Promise<UiExtraction | null> {
    const screen = SCREEN_BY_ID.get(screenId);
    return later(screen ? extractScreen(screen) : null, 800);
  },

  /** Visual search entry point — accepts a file today, returns lookalikes. */
  async visualSearch(file: File): Promise<Screen[]> {
    // Until image embeddings exist, seed the result from the file name so the
    // flow is exercisable end to end.
    const guess = searchCatalogue(file.name.replace(/[-_.]/g, ' ')).screens;
    return later(guess.length ? guess.slice(0, 24) : shuffleCurated([...SCREENS]).slice(0, 24), 900);
  },

  appFor(screen: Screen): App | undefined {
    return APP_BY_ID.get(screen.appId);
  },
};

export type InspirationsApi = typeof inspirationsApi;
