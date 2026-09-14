/**
 * Response shapes from the motvin-backend NestJS API.
 *
 * The three modules (icons, logos, illustrations) expose byte-identical
 * controller signatures, so one set of types covers all of them.
 */

/** Every endpoint wraps its payload in { success, data } or { success, error }. */
export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type Collection = {
  id: string;
  name: string;
  total?: number;
  displayName?: string;
  /** Normalized style names this collection provides. */
  styles?: string[];
  categories?: string[];
  category?: string;
  defaultViewBox?: string;
  updated?: string;
  styleCounts?: Record<string, number>;
  license?: string;
  licenseUrl?: string;
  author?: string;
  website?: string;
};

export type Stats = {
  /**
   * Absent on /api/logos/stats — see totalItems() in ./stats.ts, which derives
   * it from the collections instead.
   */
  total?: number;
  totalCollections?: number;
  collections: Collection[];
  byStyle?: Record<string, number>;
  byLicense?: Record<string, number>;
  byCategory?: Record<string, number>;
  lastUpdated?: string;
  version?: string;
};

/**
 * A single item as the API returns it. Fields beyond `name` are unreliable
 * while a collection is still indexing, which is why normalizeItem() in
 * ./normalize.ts fills every gap before anything renders.
 */
export type RawItem = {
  id?: string;
  name: string;
  /** Only illustrations send `source`; icons and logos send `collection`. */
  source?: string;
  collection?: string;
  sourceName?: string;
  collectionName?: string;
  /** Globally unique across collections. */
  uid?: string;
  /** Inner SVG markup — paths and groups, NOT a wrapping <svg> element. */
  svg?: string;
  tags?: string[];
  /** Normalized style, one of the category's configured styles. */
  style?: string;
  /** The collection's own name for that style, e.g. "bold" for Phosphor. */
  sourceStyle?: string;
  /** Icons only: whether the stroke-width control applies to this item. */
  isEditableStroke?: boolean;
  viewBox?: string;
  /** Logos only: intrinsic dimensions, which are not square. */
  width?: number;
  height?: number;
  /** Illustrations only: a raster source, when there is one. */
  imageUrl?: string | null;
  category?: string;
  license?: string;
  licenseUrl?: string;
  author?: string;
  /** Search score assigned by the backend. */
  relevance?: number;
};

export type SearchResult = {
  query?: string;
  results: RawItem[];
  /** Total matching the query across all collections, not just this page. */
  total: number;
  /** Count in this page. */
  returned?: number;
};

/**
 * /collections wraps the list. `total` here counts collections, not items —
 * item counts live on each collection's own `total`.
 */
export type CollectionsResponse = {
  total: number;
  collections: Collection[];
};

export type SearchOptions = {
  limit?: number;
  offset?: number;
  /** Collection ids to restrict to. */
  collection?: string[];
  category?: string[];
  style?: string[];
  license?: string[];
  /** Explicit item ids — used to fetch a saved collection. */
  ids?: string[];
};

/** Returned instead of results when a newer search superseded this one. */
export type AbortedResult = { aborted: true };

export function isAborted(value: unknown): value is AbortedResult {
  return typeof value === 'object' && value !== null && 'aborted' in value;
}
