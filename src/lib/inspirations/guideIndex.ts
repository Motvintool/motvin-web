import { inspirationsApi } from './api';
import { elementLabel, flowCategoryLabel, INDUSTRY_LABEL, SCREEN_STATE_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from './taxonomy';
import type { App, Flow, LibraryMeta, Pattern } from './types';

/**
 * Everything the guide can name, loaded once and kept warm: the apps, flows,
 * patterns and UI element kinds, and the taxonomy actually present in the
 * library. Each part loads on its own, so a missing piece narrows the guide
 * rather than silencing it.
 */

export type ElementCount = { kind: string; count: number };

export type LibraryIndex = {
  apps: App[];
  flows: Flow[];
  patterns: Pattern[];
  elements: ElementCount[];
  meta: LibraryMeta | null;
  /** False when even the app list could not be fetched. */
  reachable: boolean;
  /** Words a misspelling may be corrected to: names and taxonomy the library really uses. */
  vocabulary: string[];
  appById: Map<string, App>;
  appBySlug: Map<string, App>;
};

const TTL = 60_000;
let cached: { at: number; index: LibraryIndex } | null = null;
let inFlight: Promise<LibraryIndex> | null = null;

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// Everyday words that happen to be screen types; correcting a typo *into* one would be a guess.
const COMMON = new Set(['home', 'feed', 'search', 'detail', 'product', 'profile', 'messages', 'map', 'calendar', 'player', 'form', 'modal', 'success', 'error', 'empty', 'loading', 'other', 'light', 'bold', 'list', 'price', 'button', 'banner']);

export function buildVocabulary(apps: App[], flows: Flow[], patterns: Pattern[], elements: ElementCount[], meta: LibraryMeta | null): string[] {
  const vocabulary = new Set<string>();
  const add = (text: string) => words(text).forEach((word) => word.length >= 5 && !COMMON.has(word) && vocabulary.add(word));
  apps.forEach((app) => add(app.name));
  flows.forEach((flow) => add(flow.name));
  patterns.forEach((pattern) => add(pattern.name));
  elements.forEach((element) => add(elementLabel(element.kind)));
  Object.values(SCREEN_TYPE_LABEL).forEach(add);
  Object.values(SCREEN_STATE_LABEL).forEach(add);
  Object.values(STYLE_LABEL).forEach(add);
  Object.values(INDUSTRY_LABEL).forEach(add);
  (meta?.taxonomy.flowCategories ?? []).forEach((category) => add(flowCategoryLabel(category)));
  ['flows', 'screens', 'patterns', 'elements', 'collections', 'android', 'iphone', 'websites', 'onboarding', 'checkout', 'signup', 'login', 'splash', 'pricing', 'permission', 'landing', 'dashboard', 'settings', 'notifications'].forEach((word) => vocabulary.add(word));
  return [...vocabulary];
}

export function makeIndex(parts: { apps: App[]; flows: Flow[]; patterns: Pattern[]; elements: ElementCount[]; meta: LibraryMeta | null; reachable: boolean }): LibraryIndex {
  return {
    ...parts,
    vocabulary: buildVocabulary(parts.apps, parts.flows, parts.patterns, parts.elements, parts.meta),
    appById: new Map(parts.apps.map((app) => [app.id, app])),
    appBySlug: new Map(parts.apps.map((app) => [app.slug, app])),
  };
}

const EMPTY_INDEX = makeIndex({ apps: [], flows: [], patterns: [], elements: [], meta: null, reachable: false });

async function attempt<T>(task: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}

export async function loadIndex(now = Date.now()): Promise<LibraryIndex> {
  if (cached && now - cached.at < TTL) return cached.index;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let reachable = true;
    let apps: App[] = [];
    try {
      apps = await inspirationsApi.listApps();
    } catch {
      reachable = false;
    }
    if (!reachable) return EMPTY_INDEX;
    const [flows, patterns, elements, meta] = await Promise.all([
      attempt(() => inspirationsApi.listFlows(), [] as Flow[]),
      attempt(() => inspirationsApi.listPatterns(), [] as Pattern[]),
      attempt(() => inspirationsApi.listElements(), [] as ElementCount[]),
      attempt(() => inspirationsApi.getMeta(), null as LibraryMeta | null),
    ]);
    const index = makeIndex({ apps, flows, patterns, elements, meta, reachable });
    cached = { at: Date.now(), index };
    return index;
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** Forget the warm copy — after a test, or when the library is known to have changed. */
export function resetIndex() {
  cached = null;
  inFlight = null;
}

/** The app a screen or flow id belongs to: ids start with the app's slug. */
export function appOfId(index: LibraryIndex, id: string): App | null {
  let best: App | null = null;
  for (const app of index.apps) {
    if ((id === app.slug || id.startsWith(`${app.slug}-`)) && (!best || app.slug.length > best.slug.length)) best = app;
  }
  return best;
}

/** The apps a pattern appears in, by the screens it points at. */
export function appsUsingPattern(index: LibraryIndex, pattern: Pattern): App[] {
  const seen = new Map<string, App>();
  for (const screenId of pattern.screenIds ?? []) {
    const app = appOfId(index, screenId);
    if (app) seen.set(app.id, app);
  }
  return [...seen.values()];
}
