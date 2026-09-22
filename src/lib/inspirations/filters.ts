import {
  INDUSTRIES,
  PLATFORMS,
  SCREEN_TYPES,
  STYLES,
  type Industry,
  type Platform,
  type Screen,
  type ScreenType,
  type Style,
} from './types';

/**
 * Gallery filter state. Lives in the URL (`?platform=ios&industry=fintech`)
 * so browser back/forward and shared links restore the exact view.
 */

export type ScreenFilters = {
  platforms: Platform[];
  screenTypes: ScreenType[];
  industries: Industry[];
  styles: Style[];
  query: string;
};

export const EMPTY_FILTERS: ScreenFilters = {
  platforms: [],
  screenTypes: [],
  industries: [],
  styles: [],
  query: '',
};

/**
 * The platform actually browsed when the URL names none. Mobbin's model, and
 * ours: a visitor is always in exactly one platform's section — iOS by
 * default — rather than an "all platforms" soup no control can describe. The
 * URL stays clean for the default; only Android/Web are ever written to it.
 */
export const DEFAULT_PLATFORM: Platform = 'ios';

/** Filters with the platform default made real, for feeds and matching. */
export function withDefaultPlatform(filters: ScreenFilters): ScreenFilters {
  return filters.platforms.length ? filters : { ...filters, platforms: [DEFAULT_PLATFORM] };
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] {
  if (!raw) return [];
  const set = new Set<string>(allowed);
  return Array.from(new Set(raw.split(',').filter((v): v is T => set.has(v))));
}

export function parseFilters(params: URLSearchParams): ScreenFilters {
  return {
    platforms: parseList(params.get('platform'), PLATFORMS),
    screenTypes: parseList(params.get('type'), SCREEN_TYPES),
    industries: parseList(params.get('industry'), INDUSTRIES),
    styles: parseList(params.get('style'), STYLES),
    query: params.get('q')?.trim() ?? '',
  };
}

export function serializeFilters(filters: ScreenFilters, base?: URLSearchParams): URLSearchParams {
  const params = new URLSearchParams(base);
  const setList = (key: string, values: string[]) => {
    if (values.length) params.set(key, values.join(','));
    else params.delete(key);
  };
  setList('platform', filters.platforms);
  setList('type', filters.screenTypes);
  setList('industry', filters.industries);
  setList('style', filters.styles);
  if (filters.query) params.set('q', filters.query);
  else params.delete('q');
  return params;
}

export function countActiveFilters(filters: ScreenFilters): number {
  return (
    filters.platforms.length +
    filters.screenTypes.length +
    filters.industries.length +
    filters.styles.length
  );
}

export function filtersEqual(a: ScreenFilters, b: ScreenFilters): boolean {
  return serializeFilters(a).toString() === serializeFilters(b).toString();
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export function matchesFilters(screen: Screen, filters: ScreenFilters): boolean {
  if (filters.platforms.length && !filters.platforms.includes(screen.platform)) return false;
  if (filters.screenTypes.length && !filters.screenTypes.includes(screen.screenType)) return false;
  if (filters.industries.length && !filters.industries.includes(screen.industry)) return false;
  if (filters.styles.length && !filters.styles.some((s) => screen.style.includes(s))) return false;
  return true;
}
