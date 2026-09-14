/**
 * Everything that differs between the icons, logos and illustrations libraries.
 *
 * The static site shipped these as three near-identical pages: icons.html,
 * logos.html and illustrations.html differ by 81 of ~2,030 lines once the
 * category word is normalised away, and their engines share 68 of ~70
 * functions. That shared behaviour lives in one `/[category]` route; everything
 * genuinely per-category is here.
 *
 * Values below were read out of the original pages and engines — see the
 * comment on each field for where it came from.
 */

export const CATEGORIES = ['icons', 'logos', 'illustrations'] as const;

export type Category = (typeof CATEGORIES)[number];

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Public URL a category is reachable at. Deliberately the short form —
 * `next.config.ts` rewrites /icons /logos /illustrations to the
 * `motvin-library/[category]` folder internally, so the URL bar shows
 * `/icons` while the file lives under `src/app/motvin-library/[category]/`.
 */
export function categoryHref(slug: Category): string {
  return `/${slug}`;
}

export type CategoryConfig = {
  /** Route segment and API path segment — /icons ↔ /api/icons. */
  slug: Category;

  /** Singular/plural nouns for UI copy ("No icons match your filters"). */
  noun: string;
  nounPlural: string;

  title: string;
  description: string;

  /**
   * localStorage key prefix. Deliberately kept as the original's so a returning
   * visitor's saved filters, collections and favourites survive the cutover.
   */
  storagePrefix: string;

  /** Style facet values. The single biggest behavioural difference. */
  styles: readonly string[];

  /** Display overrides for style names that don't just title-case. */
  styleLabels: Readonly<Record<string, string>>;

  /** Swatch image per style, shown on the filter chip. */
  styleSwatches: Readonly<Record<string, string>>;

  /**
   * Grid column count. The one substantial layout difference between the three
   * original stylesheets; exposed to CSS as --mi-grid-columns.
   */
  gridColumns: number;

  /** Preset sizes on the right panel's size control, and which starts active. */
  panelSizes: readonly number[];
  defaultPanelSize: number;

  /** Initial values for the global recolor/size/stroke controls. */
  defaultGlobalSize: number;
  defaultGlobalStroke: number;

  /** Source-library marks in the empty-state cluster behind the grid. */
  clusterLogos: readonly string[];

  /** Label on the top header's library switcher. */
  libraryLabel: string;

  /**
   * Subtitle under that label in the switcher menu.
   *
   * Hardcoded in the original and already stale — it says 331,500+ icons where
   * /stats reports 390,508. Kept verbatim for parity; wiring it to live stats
   * would be a small improvement.
   */
  librarySubtitle: string;
};

/** Results requested per page. All three engines settled on 60. */
export const PAGE_SIZE = 60;

const CLUSTER_TAIL = [
  '/ASSET/Icons/Lucide.svg',
  '/ASSET/Icons/Heroicons.svg',
  '/ASSET/Icons/Tabler%20Icons.svg',
  '/ASSET/Icons/adobe.svg',
  '/ASSET/Icons/apple.svg',
  '/ASSET/Icons/modvin.svg',
  '/ASSET/Icons/pixelsmarket.svg',
  '/ASSET/Icons/open-doodles.svg',
  '/ASSET/Icons/undraw.svg',
] as const;

export const CATEGORY_CONFIG: Readonly<Record<Category, CategoryConfig>> = {
  icons: {
    slug: 'icons',
    noun: 'icon',
    nounPlural: 'icons',
    title: 'Motvin Icons: A complete icon toolkit for designers, developers.',
    description:
      'Search, compare, customize, and use icons from your favorite libraries — all in one place.',
    storagePrefix: 'mi',
    styles: ['outline', 'solid', 'duotone', 'thin', '3d'],
    styleLabels: { '3d': '3D Icons' },
    styleSwatches: {
      outline: 'icons-basic.svg',
      solid: 'icons-filled.svg',
      duotone: 'icons-duotone.svg',
      thin: 'icons-basic.svg',
      '3d': 'icons-3d.svg',
    },
    gridColumns: 10,
    libraryLabel: 'Icons Library',
    librarySubtitle: '331,500+ icons, ready to explore',
    panelSizes: [16, 20, 24, 32],
    defaultPanelSize: 20,
    defaultGlobalSize: 36,
    defaultGlobalStroke: 1.5,
    clusterLogos: [
      '/ASSET/Icons/Lucide.svg',
      '/ASSET/Icons/Heroicons.svg',
      '/ASSET/Icons/Tabler%20Icons.svg',
      ...CLUSTER_TAIL,
    ],
  },

  logos: {
    slug: 'logos',
    noun: 'logo',
    nounPlural: 'logos',
    title: 'Motvin Logos: Brand logos for designers and developers.',
    description:
      'Search, browse, and use brand logos from popular companies — all in one place.',
    storagePrefix: 'ml',
    gridColumns: 8,
    libraryLabel: 'Logos Library',
    librarySubtitle: '13,000+ logos, all in one place',
    styles: ['color', 'solid'],
    styleLabels: {},
    styleSwatches: {
      color: 'icons-brand.svg',
      solid: 'icons-filled.svg',
    },
    panelSizes: [16, 24, 42, 55],
    defaultPanelSize: 55,
    defaultGlobalSize: 55,
    defaultGlobalStroke: 1.5,
    clusterLogos: [
      '/ASSET/Icons/adobe.svg',
      '/ASSET/Icons/apple.svg',
      '/ASSET/Icons/modvin.svg',
      ...CLUSTER_TAIL,
    ],
  },

  illustrations: {
    slug: 'illustrations',
    noun: 'illustration',
    nounPlural: 'illustrations',
    title:
      'Motvin Illustrations: A curated illustration library for designers and developers.',
    description: 'Browse and use illustrations in one place.',
    storagePrefix: 'mill',
    gridColumns: 6,
    libraryLabel: 'Illustration Library',
    librarySubtitle: 'Illustrations, ready to explore',
    styles: ['color', 'solid'],
    styleLabels: {},
    styleSwatches: {
      color: 'icons-brand.svg',
      solid: 'icons-filled.svg',
    },
    panelSizes: [16, 24, 42, 55],
    defaultPanelSize: 55,
    defaultGlobalSize: 55,
    defaultGlobalStroke: 1.5,
    clusterLogos: [
      '/ASSET/Icons/pixelsmarket.svg',
      '/ASSET/Icons/open-doodles.svg',
      '/ASSET/Icons/undraw.svg',
      ...CLUSTER_TAIL,
    ],
  },
};

export function getCategoryConfig(category: Category): CategoryConfig {
  return CATEGORY_CONFIG[category];
}

/** Display label for a style value, e.g. "3d" → "3D Icons", "solid" → "Solid". */
export function styleLabel(config: CategoryConfig, style: string): string {
  return config.styleLabels[style] ?? style.charAt(0).toUpperCase() + style.slice(1);
}

/** Namespaced localStorage key, e.g. ("mi", "query") → "mi.query". */
export function storageKey(config: CategoryConfig, key: string): string {
  return `${config.storagePrefix}.${key}`;
}
