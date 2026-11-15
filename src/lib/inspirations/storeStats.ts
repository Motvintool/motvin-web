/**
 * Live store numbers for an app's masthead, fetched server-side and cached.
 *
 *  - iOS: iTunes Search for the listing (rating count, category), Apple's
 *    top-free charts for the rank. Apple publishes no download counts, so the
 *    rating count stands in for "popularity" on iOS.
 *
 * Every field is optional: a store that changes its markup or is unreachable
 * just yields nulls, and the UI shows a dash.
 */

export type StoreStats = {
  platform: 'ios';
  /** Store listing URL. */
  url: string | null;
  /** iOS: how many ratings the listing has, compacted ("42.5M"). */
  ratings: string | null;
  /** iOS: average star rating out of 5. */
  rating: number | null;
  /** iOS: "Free" or a price like "$4.99". */
  price: string | null;
  /** iOS: download size, e.g. "210 MB". */
  size: string | null;
  /** iOS: ISO date of the latest release. */
  updated: string | null;
  /** iOS: current version string. */
  version: string | null;
  /** Rank within the store's top-free chart for the app's category. */
  rank: { position: number; category: string; country: string } | null;
  /** Rank in the store's overall top-free chart. */
  overallRank: number | null;
};

const BLANK: StoreStats = {
  platform: 'ios', url: null, ratings: null, rating: null, price: null, size: null,
  updated: null, version: null, rank: null, overallRank: null,
};

const REVALIDATE = 60 * 60 * 24;
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

async function getText(url: string, fresh = false): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
      // A fresh read skips the day-long cache: the chart is read as it stands now.
      ...(fresh ? { cache: 'no-store' as const } : { next: { revalidate: REVALIDATE } }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function getJson<T>(url: string, fresh = false): Promise<T | null> {
  const text = await getText(url, fresh);
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

export function compact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

type ItunesResult = {
  trackId: number;
  trackName: string;
  trackViewUrl: string;
  primaryGenreId: number;
  primaryGenreName: string;
  userRatingCount?: number;
  averageUserRating?: number;
  formattedPrice?: string;
  fileSizeBytes?: string;
  currentVersionReleaseDate?: string;
  version?: string;
};
type Chart = { feed?: { entry?: { id: { attributes: { 'im:id': string } } }[] } };

async function rankIn(url: string, trackId: number, fresh = false): Promise<number | null> {
  const chart = await getJson<Chart>(url, fresh);
  const ids = chart?.feed?.entry?.map((e) => e.id.attributes['im:id']) ?? [];
  const i = ids.indexOf(String(trackId));
  return i >= 0 ? i + 1 : null;
}

/**
 * Storefronts to read, in order of preference. An app is ranked in the market it
 * actually sells in — Swiggy and Zomato are in India's charts, not the US's — so
 * the storefront where it places best is the one reported, and the listing
 * details (ratings, size, link) come from that same storefront. An app that
 * ranks nowhere falls back to the first storefront that lists it at all.
 */
const STOREFRONTS = [
  { code: 'us', name: 'US' },
  { code: 'in', name: 'India' },
] as const;

type Storefront = {
  code: string;
  name: string;
  hit: ItunesResult | null;
  rank: number | null;
  overallRank: number | null;
};

async function iosStorefront(name: string, front: (typeof STOREFRONTS)[number], fresh = false): Promise<Storefront> {
  const search = await getJson<{ results: ItunesResult[] }>(
    `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&country=${front.code}&limit=5`,
    fresh,
  );
  const results = search?.results ?? [];
  const want = norm(name);
  // Prefer a listing whose title starts with the app's name over the raw top hit.
  const hit = results.find((r) => norm(r.trackName).startsWith(want)) ?? results[0] ?? null;
  if (!hit) return { ...front, hit: null, rank: null, overallRank: null };
  const [rank, overallRank] = await Promise.all([
    rankIn(`https://itunes.apple.com/${front.code}/rss/topfreeapplications/limit=200/genre=${hit.primaryGenreId}/json`, hit.trackId, fresh),
    rankIn(`https://itunes.apple.com/${front.code}/rss/topfreeapplications/limit=200/json`, hit.trackId, fresh),
  ]);
  return { ...front, hit, rank, overallRank };
}

async function iosStats(name: string, fresh = false): Promise<StoreStats> {
  const empty: StoreStats = { ...BLANK, platform: 'ios' };
  const fronts = await Promise.all(STOREFRONTS.map((f) => iosStorefront(name, f, fresh)));
  // Best placing wins; on a tie the earlier storefront (US) does.
  const ranked = fronts
    .filter((f) => f.hit && f.rank)
    .reduce<Storefront | undefined>((best, f) => (!best || (f.rank ?? Infinity) < (best.rank ?? Infinity) ? f : best), undefined);
  const hit = (ranked ?? fronts.find((f) => f.hit))?.hit;
  if (!hit) return empty;

  const bytes = Number(hit.fileSizeBytes);
  return {
    ...empty,
    url: hit.trackViewUrl,
    ratings: hit.userRatingCount ? compact(hit.userRatingCount) : null,
    rating: hit.averageUserRating ? Math.round(hit.averageUserRating * 10) / 10 : null,
    price: hit.formattedPrice ?? null,
    size: bytes > 0 ? `${Math.round(bytes / 1_048_576)} MB` : null,
    updated: hit.currentVersionReleaseDate ?? null,
    version: hit.version ?? null,
    rank: ranked?.rank && ranked.hit
      ? { position: ranked.rank, category: ranked.hit.primaryGenreName, country: ranked.name }
      : null,
    overallRank: ranked?.overallRank ?? null,
  };
}

/**
 * Numbers read fresh on purpose (an upload of the app), kept for the same
 * day the cache would have held the old ones, and served ahead of it — so
 * the page shows the rank read at upload, not yesterday's.
 */
const freshByName: Map<string, { stats: StoreStats; at: number }> = ((globalThis as unknown as { __motvinFreshStoreStats?: Map<string, { stats: StoreStats; at: number }> }).__motvinFreshStoreStats ??= new Map());

export function getStoreStats(name: string, _platform: 'ios' = 'ios'): Promise<StoreStats> {
  const kept = freshByName.get(norm(name));
  if (kept && Date.now() - kept.at < REVALIDATE * 1000) return Promise.resolve(kept.stats);
  return iosStats(name);
}

/** Reads an iOS app's store numbers now, past the cache, and serves them from here on. */
export async function refreshStoreStats(name: string): Promise<StoreStats> {
  const stats = await iosStats(name, true);
  freshByName.set(norm(name), { stats, at: Date.now() });
  return stats;
}
