import type { Category } from '@/lib/config/categories';
import { ICON_CATEGORY_MAP } from '@/lib/search/icon-categories';
import type { RawItem } from './types';

/**
 * Per-category categorisation, one of the few places the three libraries
 * genuinely diverge.
 *
 * The static site had three different strategies, one per engine:
 *  - icons  (motvin-icons.js) matched name+tags against a 36-category keyword
 *    map, first match wins, defaulting to "Others"
 *  - logos  (logos.js) used hand-written brand rules, falling back to a hash of
 *    the name so an unrecognised brand at least lands somewhere stable
 *  - illustrations (illustrations.js) trusted the API's own `category`
 *
 * All three are preserved exactly. The config picks one; shared code never
 * branches on category name.
 */

export type Categorizer = (item: RawItem, index: number) => string;

const FALLBACK_CATEGORY = 'Others';

// Word-boundary match per category, built once. Declaration order matters —
// the first category whose keywords hit is the one assigned.
const ICON_CATEGORY_PATTERNS: [string, RegExp][] = Object.entries(
  ICON_CATEGORY_MAP,
).map(([name, keywords]) => [name, new RegExp(`\\b(${keywords.join('|')})\\b`)]);

const categorizeIcon: Categorizer = (item) => {
  const haystack = `${item.name} ${(item.tags ?? []).join(' ')}`.toLowerCase();
  for (const [name, pattern] of ICON_CATEGORY_PATTERNS) {
    if (pattern.test(haystack)) return name;
  }
  return FALLBACK_CATEGORY;
};

const LOGO_CATEGORIES = [
  'Design',
  'Technology',
  'Development',
  'Marketing',
  'Social Media',
  'Entertainment',
  'Others',
] as const;

// Brand keyword rules, in the original's order — first match wins.
const LOGO_RULES: [string, readonly string[]][] = [
  ['Design', ['adobe', 'figma', 'sketch', 'design', 'invision', 'canva']],
  [
    'Development',
    ['react', 'vue', 'angular', 'node', 'javascript', 'python', 'github', 'api', 'dev'],
  ],
  ['Technology', ['apple', 'google', 'microsoft', 'samsung', 'intel', 'tech']],
  [
    'Social Media',
    ['facebook', 'twitter', 'instagram', 'tiktok', 'snapchat', 'linkedin', 'social'],
  ],
  [
    'Entertainment',
    ['netflix', 'spotify', 'youtube', 'twitch', 'hulu', 'entertainment', 'music'],
  ],
  ['Marketing', ['ad', 'marketing', 'seo', 'analytics', 'sales']],
];

const categorizeLogo: Categorizer = (item, index) => {
  const name = (item.name || '').toLowerCase();
  const tags = (item.tags ?? []).map((t) => t.toLowerCase());
  const matches = (keyword: string) =>
    name.includes(keyword) || tags.some((t) => t.includes(keyword));

  for (const [category, keywords] of LOGO_RULES) {
    if (keywords.some(matches)) return category;
  }

  // No rule matched. Hash the identity so the same brand always lands in the
  // same bucket rather than jumping around between loads.
  const hash = (item.id || item.name || String(index))
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return LOGO_CATEGORIES[hash % LOGO_CATEGORIES.length];
};

const categorizeIllustration: Categorizer = (item) => item.category || FALLBACK_CATEGORY;

export const CATEGORIZERS: Readonly<Record<Category, Categorizer>> = {
  icons: categorizeIcon,
  logos: categorizeLogo,
  illustrations: categorizeIllustration,
};
