import type { Category } from '@/lib/config/categories';
import { sourceLicenseUrl } from '@/lib/data/sourceLicenses';
import { CATEGORIZERS } from './categorize';
import type { Collection, RawItem } from './types';

/**
 * Turns a raw API item into the shape the UI can rely on — the port of
 * populateIconsFromAPI() in JS/api-loader.js plus createIconsArray() /
 * createLogosArray() / createIllustrationsArray() in the three engines.
 *
 * Every field is filled, because the API returns sparse items while a
 * collection is still indexing and the original crashed the grid renderer on
 * undefined.
 */

export type LibraryItem = {
  id: string;
  name: string;
  /** Collection id, e.g. "lucide". */
  source: string;
  /** Human-readable collection name, resolved from stats. */
  sourceName: string;
  /** Stable "collection:style:name" key, used for saved collections. */
  sourceItemId: string;
  /** Backend-assigned id, unique across collections. */
  uid: string;
  /** The collection's own style name, e.g. "bold" where style is "solid". */
  sourceStyle: string;
  /** Whether the stroke-width control applies. Icons only; false elsewhere. */
  isEditableStroke: boolean;
  /** Intrinsic size. Logos are not square, so the grid can't assume 1:1. */
  width: number | null;
  height: number | null;
  /** Raster source for illustrations that have one. */
  imageUrl: string | null;
  /** Inline SVG markup when the API supplied it; otherwise fetched by URL. */
  svg: string;
  tags: string[];
  style: string;
  viewBox: string;
  category: string;
  license: string;
  licenseUrl: string;
  author: string;
  /** Synthesised ordering weights — see the note below. */
  popularity: number;
  createdAt: number;
  updatedAt: number;
};

/**
 * Default style when the API doesn't say.
 *
 * "outline" would be wrong: it means "adjustable stroke", so an item with no
 * style would land in the Outline filter and then render with a stroke it
 * doesn't have.
 */
const DEFAULT_STYLE = 'solid';
const DEFAULT_VIEWBOX = '0 0 24 24';
const UNKNOWN = 'Unknown';

export function normalizeItems(
  raw: RawItem[],
  category: Category,
  collections: Collection[],
): LibraryItem[] {
  const categorize = CATEGORIZERS[category];
  const byId = new Map(collections.map((c) => [c.id, c]));
  const now = Date.now();

  // The API can return sparse slots mid-index; drop them before anything
  // downstream has to defend against undefined.
  return raw
    .filter((item): item is RawItem => Boolean(item) && typeof item === 'object')
    .map((item, index) => {
      const source = item.source || item.collection || category;
      const collection = byId.get(source);
      const style = item.style || DEFAULT_STYLE;

      return {
        ...item,
        id: item.id || `${source}_${style}_${item.name || index}`,
        name: item.name,
        source,
        sourceName:
          collection?.name || item.sourceName || item.collectionName || source,
        sourceItemId: `${source}:${style}:${item.name}`,
        uid: item.uid || item.id || `${source}_${style}_${item.name || index}`,
        svg: item.svg || '',
        tags: item.tags ?? [],
        style,
        sourceStyle: item.sourceStyle || style,
        isEditableStroke: item.isEditableStroke ?? false,
        width: item.width ?? null,
        height: item.height ?? null,
        imageUrl: item.imageUrl ?? null,
        viewBox: item.viewBox || DEFAULT_VIEWBOX,
        category: categorize(item, index),
        license: item.license || collection?.license || UNKNOWN,
        // Reference reads licenseUrl from source metadata (per icons/logos/
        // illustrations engine). The stats endpoint doesn't ship it for every
        // source, so fall back to the collections.json table at
        // src/lib/data/sourceLicenses.ts — two-way lookup (by id, then by
        // human name) because the API and the manifest use different slugs
        // for the same collection (e.g. API `phosphor` ↔ manifest `ph`).
        licenseUrl:
          item.licenseUrl ||
          collection?.licenseUrl ||
          sourceLicenseUrl(source, collection?.name || item.sourceName || item.collectionName) ||
          '',
        author: item.author || collection?.author || UNKNOWN,

        // Carried over from the original, which had no real popularity or date
        // data and derived both from array position. They only affect the
        // "Popular" and "Newest" sort orders, which therefore reflect the
        // API's own ordering rather than anything measured. Worth replacing
        // with real fields once the backend exposes them.
        popularity: Math.round(1000 - index + Math.sin(index) * 200),
        createdAt: now - index * 1e5,
        updatedAt: now,
      };
    });
}
