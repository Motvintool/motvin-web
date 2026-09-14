import type { Category } from '@/lib/config/categories';
import type {
  ApiEnvelope,
  Collection,
  CollectionsResponse,
  SearchOptions,
  SearchResult,
  Stats,
} from './types';

/**
 * Typed client for the motvin-backend API, generic over category.
 *
 * Replaces the three near-identical clients in motvin-ui/JS
 * (api-client.js, api-client-logos.js, api-client-illustrations.js). Where they
 * had drifted, this takes the most-correct behaviour of the three — notably the
 * AbortError handling, which only the icons client had: without it a fast
 * typist who supersedes an in-flight search gets a console error and a rejected
 * promise instead of a clean "this result is stale" signal.
 *
 * Caching mirrors the original: an in-memory map with per-endpoint TTLs, plus
 * request de-duplication so two callers asking for the same URL share one
 * fetch. It is per-page-load, exactly as before — nothing is persisted.
 */

const CACHE_VERSION = 'v2';

const TTL = {
  stats: 60 * 60 * 1000,
  collections: 60 * 60 * 1000,
  collectionItems: 5 * 60 * 1000,
  search: 60 * 1000,
} as const;

function getApiBaseUrl(category: Category): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (configured) return `${configured.replace(/\/+$/, '')}/api/${category}`;

  // Mirrors the original's hostname sniffing for anyone running without env
  // configuration.
  if (typeof window !== 'undefined') {
    const { hostname } = window.location;
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return `http://localhost:3000/api/${category}`;
    }
  }
  return `https://api.motvin.com/api/${category}`;
}

type CacheEntry = { data: unknown; timestamp: number };

export class LibraryApiClient {
  readonly category: Category;
  private readonly baseUrl: string;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Promise<unknown>>();
  /** Aborts the previous search when a newer one starts. */
  private searchController: AbortController | null = null;

  constructor(category: Category) {
    this.category = category;
    this.baseUrl = getApiBaseUrl(category);
  }

  private async request<T>(
    url: string,
    cacheKey: string,
    ttl: number,
    signal?: AbortSignal,
  ): Promise<T> {
    const key = `${CACHE_VERSION}:${cacheKey}`;

    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      return cached.data as T;
    }

    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight as Promise<T>;

    const promise = (async () => {
      try {
        const res = await fetch(url, signal ? { signal } : undefined);
        if (!res.ok) throw new Error(`API error: ${res.status}`);

        const envelope = (await res.json()) as ApiEnvelope<T>;
        if (!envelope.success) throw new Error(envelope.error || 'API request failed');

        const data = envelope.data as T;
        this.cache.set(key, { data, timestamp: Date.now() });
        return data;
      } finally {
        this.pending.delete(key);
      }
    })();

    this.pending.set(key, promise);
    return promise;
  }

  getStats(): Promise<Stats> {
    return this.request<Stats>(`${this.baseUrl}/stats`, 'stats', TTL.stats);
  }

  /**
   * Collection list, unwrapped. The endpoint answers
   * `{ total, collections: [...] }` rather than a bare array — the original
   * client never noticed because it read collections off /stats instead.
   */
  async getCollections(): Promise<Collection[]> {
    const data = await this.request<CollectionsResponse>(
      `${this.baseUrl}/collections`,
      'collections',
      TTL.collections,
    );
    return data?.collections ?? [];
  }

  /**
   * Search across all collections. An empty query is valid and browses
   * everything, which is how the grid's default view is populated.
   *
   * Each call aborts the previous one. A superseded call rejects with an
   * AbortError; callers should treat that as "ignore me", not as a failure.
   */
  async search(query: string, options: SearchOptions = {}): Promise<SearchResult> {
    const { limit = 40, offset = 0, collection, category, style, license, ids } = options;

    const params = new URLSearchParams({
      q: query,
      limit: String(limit),
      offset: String(offset),
    });
    const appendList = (name: string, values?: string[]) => {
      if (values?.length) params.append(name, values.join(','));
    };
    appendList('collection', collection);
    appendList('style', style);
    appendList('category', category);
    appendList('license', license);
    appendList('ids', ids);

    const cacheKey = `search:${params.toString()}`;

    this.searchController?.abort();
    this.pending.delete(`${CACHE_VERSION}:${cacheKey}`);
    this.searchController = new AbortController();

    return this.request<SearchResult>(
      `${this.baseUrl}/search?${params}`,
      cacheKey,
      TTL.search,
      this.searchController.signal,
    );
  }

  /** URL for a single item's SVG, served (and CDN-cached) by the backend. */
  svgUrl(collectionId: string, itemName: string): string {
    return `${this.baseUrl}/${collectionId}/${itemName}.svg`;
  }

  clearCache() {
    this.cache.clear();
    this.pending.clear();
  }
}

const clients = new Map<Category, LibraryApiClient>();

/** One client per category, reused across renders. */
export function getApiClient(category: Category): LibraryApiClient {
  let client = clients.get(category);
  if (!client) {
    client = new LibraryApiClient(category);
    clients.set(category, client);
  }
  return client;
}
