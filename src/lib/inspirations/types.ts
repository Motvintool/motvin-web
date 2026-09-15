/**
 * Data model for the Motvin Inspirations platform.
 *
 * Mirrors the shape the backend will eventually serve (PostgreSQL + object
 * storage + vector search). Everything the UI renders comes through
 * `src/lib/inspirations/api.ts`, so swapping the in-memory mock for real HTTP
 * calls is a one-file change.
 */

export const PLATFORMS = ['web', 'ios', 'android'] as const;
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

export const ASPECTS = ['9:16', '3:4', '4:5', '1:1', '16:10', '16:9'] as const;
export type Aspect = (typeof ASPECTS)[number];

/** UI element kinds the extraction step can detect inside a screen. */
export const ELEMENT_KINDS = [
  'button',
  'input',
  'search',
  'card',
  'navigation',
  'bottom-nav',
  'tabs',
  'table',
  'chart',
  'form',
  'modal',
  'toggle',
  'avatar',
  'badge',
  'icon',
  'image',
  'list',
  'chip',
  'stepper',
  'empty-state',
  'notification',
] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];

/** Content-pipeline lifecycle. Only `published` assets reach the UI. */
export type ReviewStatus =
  | 'pending'
  | 'processing'
  | 'ai-analyzed'
  | 'needs-review'
  | 'approved'
  | 'published'
  | 'rejected';

export type PermissionStatus = 'unknown' | 'requested' | 'granted' | 'fair-use' | 'denied';

export type ScreenPalette = {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  /** Whether the screen itself is a dark UI (drives the mock renderer). */
  dark: boolean;
};

export type AppLogo = {
  /** Solid mark background. */
  bg: string;
  /** Glyph colour. */
  fg: string;
  /** One or two letters rendered on the mark. */
  glyph: string;
  /** Optional real logo URL; when set it replaces the generated mark. */
  src?: string;
};

export type App = {
  id: string;
  name: string;
  slug: string;
  logo: AppLogo;
  platforms: Platform[];
  industry: Industry;
  website: string;
  tagline: string;
  screenCount: number;
  flowCount: number;
};

export type ScreenProvenance = {
  sourceUrl: string;
  capturedAt: string;
  permission: PermissionStatus;
  license: string;
  attribution: string;
  status: ReviewStatus;
};

export type Screen = {
  id: string;
  appId: string;
  name: string;
  /** Real screenshot URL. `null` renders the procedural mock. */
  image: string | null;
  aspect: Aspect;
  platform: Platform;
  screenType: ScreenType;
  industry: Industry;
  tags: string[];
  colors: ScreenPalette;
  style: Style[];
  elements: ElementKind[];
  createdAt: string;
  /** Deterministic seed so the mock renderer produces stable variation. */
  seed: number;
  provenance: ScreenProvenance;
};

export type FlowCategory =
  | 'onboarding'
  | 'checkout'
  | 'authentication'
  | 'search'
  | 'settings'
  | 'creation'
  | 'discovery';

export type Flow = {
  id: string;
  appId: string;
  name: string;
  screenIds: string[];
  category: FlowCategory;
  platform: Platform;
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
  screenIds: string[];
  tags: string[];
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
