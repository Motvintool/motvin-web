/**
 * Data model for the Inspirations platform.
 *
 * These types mirror `motvin-backend/data/inspirations/manifest.json` exactly.
 * Every record the UI renders comes from that store over the API — nothing is
 * generated in the browser, so an empty store renders empty states rather than
 * filler.
 */

export const PLATFORMS = ['ios', 'android', 'web'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const SCREEN_TYPES = [
  'landing',
  'login',
  'signup',
  'dashboard',
  'search',
  'pricing',
  'checkout',
  'settings',
  'profile',
  'onboarding',
  'feed',
  'product',
  'other',
] as const;
export type ScreenType = (typeof SCREEN_TYPES)[number];

export const INDUSTRIES = [
  'saas',
  'fintech',
  'healthcare',
  'ecommerce',
  'education',
  'travel',
  'productivity',
  'ai',
  'social',
  'finance',
] as const;
export type Industry = (typeof INDUSTRIES)[number];

export const STYLES = [
  'minimal',
  'editorial',
  'bold',
  'dark',
  'light',
  'playful',
  'corporate',
  'experimental',
] as const;
export type Style = (typeof STYLES)[number];

/**
 * Component kinds. Not a closed set in the data: the UI element pages read the
 * kinds that are actually present from the manifest's taxonomy, so a new kind
 * in a sidecar file appears without a code change.
 */
export type ElementKind = string;

/** How a capture was obtained and what may be done with it. */
export type ScreenSource = {
  url: string | null;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
  permission: string | null;
};

export type App = {
  id: string;
  name: string;
  slug: string;
  industry: Industry;
  platforms: Platform[];
  website: string | null;
  tagline: string | null;
  /** API URL of the stored mark, or null when none has been added. */
  logo: string | null;
  screenCount: number;
  flowCount: number;
  license: string | null;
  attribution: string;
  /**
   * Average score out of 5 and how many ratings it came from. Both null until
   * someone records them — the UI hides the rating entirely rather than
   * showing a zero, because "0.0 (0)" reads as a bad app rather than an
   * unrated one.
   */
  rating: number | null;
  ratingCount: number | null;
};

export type Screen = {
  id: string;
  appId: string;
  name: string;
  /** Path within the store, e.g. `ios/acme/dashboard.webp`. */
  file: string;
  /** API URL of the image bytes. */
  url: string;
  /** Real pixel dimensions, read from the file at build time. */
  width: number;
  height: number;
  bytes: number;
  platform: Platform;
  screenType: ScreenType;
  industry: Industry;
  tags: string[];
  elements: ElementKind[];
  style: Style[];
  capturedAt: string | null;
  /** Whether an analyzer has produced real findings for this screen. */
  hasAnalysis: boolean;
  /** Whether the recorded licence permits handing the file to a visitor. */
  downloadable: boolean;
  source: ScreenSource;
};

/** The suggested categories. Free text is allowed, so this is not a closed set. */
export const FLOW_CATEGORY_PRESETS = [
  'onboarding',
  'checkout',
  'authentication',
  'search',
  'settings',
  'creation',
  'discovery',
] as const;

export type FlowCategory = string;

export type Flow = {
  id: string;
  appId: string;
  name: string;
  category: FlowCategory;
  platform: Platform;
  screenIds: string[];
};

export type PatternCategory =
  | 'Navigation'
  | 'Search'
  | 'Filters'
  | 'Cards'
  | 'Tables'
  | 'Charts'
  | 'Forms'
  | 'Modals'
  | 'Tabs'
  | 'Bottom Navigation'
  | 'Date Pickers'
  | 'Empty States'
  | 'Notifications'
  | 'Checkout'
  | 'Onboarding';

export type Pattern = {
  id: string;
  slug: string;
  name: string;
  category: PatternCategory;
  description: string;
  tags: string[];
  screenIds: string[];
};

export type SavedItemType = 'screen' | 'app' | 'flow' | 'pattern' | 'component' | 'icon';

export type CollectionItem = {
  type: SavedItemType;
  id: string;
  addedAt: string;
};

export type Collection = {
  id: string;
  userId: string;
  name: string;
  items: CollectionItem[];
  createdAt: string;
};

export type SavedItem = CollectionItem & { viewedAt?: string };

export type ContentKind = 'apps' | 'screens' | 'ui-elements' | 'flows' | 'patterns';

export type LibraryCounts = Record<ContentKind, number>;

/** Counts plus the taxonomy actually present in the store. */
export type LibraryMeta = {
  counts: LibraryCounts;
  taxonomy: {
    platforms: Platform[];
    screenTypes: ScreenType[];
    industries: Industry[];
    styles: Style[];
    elements: ElementKind[];
    flowCategories: string[];
  };
  generatedAt: string;
};

/** Real analysis output, when an analyzer has stored some for a screen. */
export type AnalysisSection = { title: string; points: string[] };

export type UiAnalysis = {
  screenId: string;
  analyzer?: string;
  analyzedAt?: string;
  sections: AnalysisSection[];
  palette?: { hex: string; role: string }[];
  components?: DetectedComponent[];
  typography?: { role: string; spec: string }[];
};

export type DetectedComponent = {
  kind: ElementKind;
  label: string;
  count: number;
  /** Normalised 0–1 bounding box, when the analyzer located the component. */
  box?: { x: number; y: number; w: number; h: number };
  iconQueries?: string[];
};
