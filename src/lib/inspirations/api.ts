import type { ScreenFilters } from './filters';
import type {
  App,
  ElementKind,
  Flow,
  LibraryMeta,
  Pattern,
  Screen,
  UiAnalysis,
} from './types';

/**
 * Client for the Inspirations API in motvin-backend.
 *
 * Everything the UI shows is fetched from there — `data/inspirations` on the
 * server is the single source of truth. When the store is empty the API
 * answers with empty lists and the UI says so; nothing is invented to fill
 * the gap.
 *
 * Mirrors the caching and de-duplication of `lib/api/client.ts` so two
 * components asking for the same URL share one request.
 */

const TTL = {
  meta: 5 * 60 * 1000,
  list: 60 * 1000,
  item: 5 * 60 * 1000,
  search: 60 * 1000,
} as const;

function baseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/inspirations`;
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:3000/api/inspirations';
    }
  }
  return 'https://api.motvin.com/api/inspirations';
}

type CacheEntry = { data: unknown; timestamp: number };

const cache = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<unknown>>();

async function request<T>(path: string, ttl: number, fallback: T): Promise<T> {
  const url = `${baseUrl()}${path}`;

  const cached = cache.get(url);
  if (cached && Date.now() - cached.timestamp < ttl) return cached.data as T;

  const inFlight = pending.get(url);
  if (inFlight) return inFlight as Promise<T>;

  const promise = (async () => {
    try {
      const res = await fetch(url);
      if (res.status === 404) return fallback;
      if (!res.ok) throw new Error(`Inspirations API error: ${res.status}`);
      const envelope = (await res.json()) as { success: boolean; data: T; error?: string };
      if (!envelope.success) throw new Error(envelope.error || 'Request failed');
      cache.set(url, { data: envelope.data, timestamp: Date.now() });
      return envelope.data;
    } finally {
      pending.delete(url);
    }
  })();

  pending.set(url, promise);
  return promise;
}

function listParam(name: string, values: string[] | undefined, params: URLSearchParams) {
  if (values?.length) params.set(name, values.join(','));
}

export type Page<T> = {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  nextOffset: number | null;
};

const EMPTY_PAGE: Page<never> = { items: [], total: 0, limit: 30, offset: 0, nextOffset: null };

export const EMPTY_META: LibraryMeta = {
  counts: { apps: 0, screens: 0, 'ui-elements': 0, flows: 0, patterns: 0 },
  taxonomy: { platforms: [], screenTypes: [], industries: [], styles: [], elements: [] },
  generatedAt: '',
};

export type ScreenSort = 'newest' | 'oldest' | 'app' | 'curated';

export type SearchResults = {
  intent: {
    raw: string;
    terms: string[];
    industries: string[];
    screenTypes: string[];
    platforms: string[];
    styles: string[];
    free: string[];
  };
  apps: App[];
  screens: Screen[];
  flows: Flow[];
  patterns: Pattern[];
  total: number;
  screenTotal: number;
};

const EMPTY_SEARCH: SearchResults = {
  intent: { raw: '', terms: [], industries: [], screenTypes: [], platforms: [], styles: [], free: [] },
  apps: [],
  screens: [],
  flows: [],
  patterns: [],
  total: 0,
  screenTotal: 0,
};

export const PAGE_SIZE = 30;

export const inspirationsApi = {
  /** Counts and the taxonomy actually present in the store. */
  getMeta(): Promise<LibraryMeta> {
    return request('/meta', TTL.meta, EMPTY_META);
  },

  listScreens(
    filters: ScreenFilters,
    offset = 0,
    sort: ScreenSort = 'curated',
    extra: { app?: string; element?: string } = {},
  ): Promise<Page<Screen>> {
    const params = new URLSearchParams();
    listParam('platform', filters.platforms, params);
    listParam('type', filters.screenTypes, params);
    listParam('industry', filters.industries, params);
    listParam('style', filters.styles, params);
    if (filters.query) params.set('q', filters.query);
    if (extra.app) params.set('app', extra.app);
    if (extra.element) params.set('element', extra.element);
    params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    return request(`/screens?${params}`, TTL.list, EMPTY_PAGE as Page<Screen>);
  },

  listApps(industry?: string): Promise<App[]> {
    return request(industry ? `/apps?industry=${industry}` : '/apps', TTL.list, []);
  },

  getApp(slug: string): Promise<{ app: App; screens: Screen[]; flows: Flow[]; patterns: Pattern[] } | null> {
    return request(`/app/${encodeURIComponent(slug)}`, TTL.item, null);
  },

  getScreen(id: string): Promise<{ screen: Screen; app: App | null; flows: Flow[]; patterns: Pattern[] } | null> {
    return request(`/screen/${encodeURIComponent(id)}`, TTL.item, null);
  },

  /** Metadata neighbours. The response states its basis so the UI can label it. */
  similar(id: string, limit = 12): Promise<{ basis: string; items: Screen[] }> {
    return request(`/screen/${encodeURIComponent(id)}/similar?limit=${limit}`, TTL.item, {
      basis: 'metadata',
      items: [],
    });
  },

  /**
   * Stored analysis for a screen. `analyzed: false` means no analyzer has run
   * on it yet — the panel says that rather than showing guesses.
   */
  async analyze(id: string): Promise<{ analyzed: boolean; analysis: UiAnalysis | null }> {
    const url = `${baseUrl()}/screen/${encodeURIComponent(id)}/analysis`;
    try {
      const res = await fetch(url);
      if (!res.ok) return { analyzed: false, analysis: null };
      const envelope = (await res.json()) as { success: boolean; data: UiAnalysis | null; analyzed: boolean };
      return { analyzed: Boolean(envelope.analyzed), analysis: envelope.data ?? null };
    } catch {
      return { analyzed: false, analysis: null };
    }
  },

  listFlows(category?: string): Promise<Flow[]> {
    return request(category ? `/flows?category=${category}` : '/flows', TTL.list, []);
  },

  getFlow(id: string): Promise<{ flow: Flow; screens: Screen[]; app: App | null } | null> {
    return request(`/flow/${encodeURIComponent(id)}`, TTL.item, null);
  },

  listPatterns(category?: string): Promise<Pattern[]> {
    return request(category ? `/patterns?category=${encodeURIComponent(category)}` : '/patterns', TTL.list, []);
  },

  getPattern(slug: string): Promise<{ pattern: Pattern; screens: Screen[] } | null> {
    return request(`/pattern/${encodeURIComponent(slug)}`, TTL.item, null);
  },

  listElements(): Promise<{ kind: ElementKind; count: number }[]> {
    return request('/elements', TTL.list, []);
  },

  search(query: string): Promise<SearchResults> {
    if (!query.trim()) return Promise.resolve(EMPTY_SEARCH);
    return request(`/search?q=${encodeURIComponent(query)}`, TTL.search, EMPTY_SEARCH);
  },

  /** Screens resolved by id, for saved items and collections. */
  async getScreens(ids: string[]): Promise<Screen[]> {
    const found = await Promise.all(ids.map((id) => inspirationsApi.getScreen(id).catch(() => null)));
    return found.filter((r): r is { screen: Screen; app: App | null; flows: Flow[]; patterns: Pattern[] } => Boolean(r)).map((r) => r.screen);
  },

  /** Download URL for a screen. The backend refuses it for view-only material. */
  downloadUrl(screen: Screen): string {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '') ?? '';
    return `${base}${screen.url}?download=1`;
  },

  /** Resolves a manifest-relative API path to an absolute URL. */
  mediaUrl(path: string | null): string | null {
    if (!path) return null;
    if (/^https?:\/\//.test(path)) return path;
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, '');
    if (base) return `${base}${path}`;
    if (typeof window !== 'undefined') {
      const { hostname } = window.location;
      if (hostname === 'localhost' || hostname === '127.0.0.1') return `http://localhost:3000${path}`;
    }
    return `https://api.motvin.com${path}`;
  },
};

export type InspirationsApi = typeof inspirationsApi;
