import type {
  ContentKind,
  Industry,
  PatternCategory,
  Platform,
  ScreenState,
  ScreenType,
  Style,
} from './types';

/**
 * Display labels for the taxonomy. The values themselves come from the store
 * (the manifest reports which platforms, screen types, industries, styles and
 * element kinds are actually present); this module only decides how each one
 * is written in the interface.
 */

export const PLATFORM_LABEL: Record<Platform, string> = {
  web: 'Web',
  ios: 'iOS',
  android: 'Android',
};

export const SCREEN_TYPE_LABEL: Record<ScreenType, string> = {
  landing: 'Landing',
  splash: 'Splash',
  onboarding: 'Onboarding',
  permission: 'Permission',
  login: 'Login',
  signup: 'Sign up',
  home: 'Home',
  dashboard: 'Dashboard',
  feed: 'Feed',
  search: 'Search',
  detail: 'Detail',
  product: 'Product',
  cart: 'Cart',
  checkout: 'Checkout',
  pricing: 'Pricing',
  profile: 'Profile',
  settings: 'Settings',
  notifications: 'Notifications',
  messages: 'Messages',
  map: 'Map',
  calendar: 'Calendar',
  player: 'Player',
  form: 'Form',
  modal: 'Modal',
  success: 'Success',
  error: 'Error',
  empty: 'Empty state',
  loading: 'Loading',
  other: 'Other',
};

/** Label for a screen type, including one this build has not seen. */
export function screenTypeLabel(type: string): string {
  return (
    SCREEN_TYPE_LABEL[type as ScreenType] ??
    type.split(/[-_\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  );
}

export const SCREEN_STATE_LABEL: Record<ScreenState, string> = {
  loading: 'Loading',
  empty: 'Empty',
  error: 'Error',
  success: 'Success',
  modal: 'Modal',
  'bottom-sheet': 'Bottom sheet',
  toast: 'Toast',
  'coach-mark': 'Coach mark',
  permission: 'Permission',
  scrolled: 'Scrolled',
  keyboard: 'Keyboard',
};

export function screenStateLabel(state: string): string {
  return (
    SCREEN_STATE_LABEL[state as ScreenState] ??
    state.split(/[-_\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  );
}

/**
 * The finer type the capture pipeline recorded, written for people.
 * "coach_mark" → "Coach mark", "otp" → "Verification code".
 */
export function fineTypeLabel(fineType: string): string {
  const special: Record<string, string> = {
    otp: 'Verification code',
    empty_state: 'Empty state',
    search_results: 'Search results',
    product_detail: 'Product detail',
    coach_mark: 'Coach mark',
    bottom_sheet: 'Bottom sheet',
    external_auth: 'External sign-in',
    confirmation: 'Success',
  };
  return special[fineType] ?? screenTypeLabel(fineType);
}

export const INDUSTRY_LABEL: Record<Industry, string> = {
  saas: 'SaaS',
  fintech: 'Fintech',
  healthcare: 'Healthcare',
  ecommerce: 'E-commerce',
  education: 'Education',
  travel: 'Travel',
  productivity: 'Productivity',
  ai: 'AI',
  social: 'Social',
  finance: 'Finance',
  food: 'Food & drink',
  entertainment: 'Entertainment',
  lifestyle: 'Lifestyle',
};

export const STYLE_LABEL: Record<Style, string> = {
  minimal: 'Minimal',
  editorial: 'Editorial',
  bold: 'Bold',
  dark: 'Dark',
  light: 'Light',
  playful: 'Playful',
  corporate: 'Corporate',
  experimental: 'Experimental',
};

/**
 * Element kinds are open-ended: a sidecar file may record a kind this table
 * has never seen, and it should still read properly in the UI.
 */
export const ELEMENT_LABEL: Record<string, string> = {
  button: 'Button',
  input: 'Input',
  search: 'Search',
  card: 'Card',
  navigation: 'Navigation',
  sidebar: 'Sidebar',
  'bottom-nav': 'Bottom Navigation',
  tabs: 'Tabs',
  table: 'Table',
  chart: 'Chart',
  'kpi-card': 'KPI Card',
  'progress-ring': 'Progress Ring',
  form: 'Form',
  modal: 'Modal',
  'bottom-sheet': 'Bottom Sheet',
  toggle: 'Toggle',
  avatar: 'Avatar',
  badge: 'Badge',
  icon: 'Icon',
  image: 'Image',
  list: 'List',
  chip: 'Chip',
  stepper: 'Stepper',
  'date-picker': 'Date Picker',
  'filter-panel': 'Filter Panel',
  'empty-state': 'Empty State',
  'success-state': 'Success State',
  notification: 'Notification',
};

/** Label for any element kind, including ones not in the table above. */
export function elementLabel(kind: string): string {
  return (
    ELEMENT_LABEL[kind] ??
    kind.split('-').map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  );
}

export const FLOW_CATEGORY_LABEL: Record<string, string> = {
  onboarding: 'Onboarding',
  checkout: 'Checkout',
  authentication: 'Authentication',
  search: 'Search',
  settings: 'Settings',
  creation: 'Creation',
  discovery: 'Discovery',
};

/**
 * How a screenshot came to be in the library. This is the one field the
 * licensing gate requires, so it is shown on the screen page rather than kept
 * to the admin form.
 */
export const PERMISSION_LABEL: Record<string, string> = {
  'owner-granted': 'Published with permission',
  'open-source': 'Open-source app',
  'public-domain': 'Public domain',
  'own-work': 'Our own product',
  'fair-use-reference': 'Editorial reference',
};

/** Shorter wording for the admin form, where the context is already clear. */
export const PERMISSION_LABEL_SHORT: Record<string, string> = {
  'owner-granted': 'Owner gave permission',
  'open-source': 'Open-source app',
  'public-domain': 'Public domain',
  'own-work': 'Our own product or capture',
  'fair-use-reference': 'Editorial reference',
};

/** Label for any category, including ones typed in by hand. */
export function flowCategoryLabel(category: string): string {
  return (
    FLOW_CATEGORY_LABEL[category] ??
    category.split(/[-_\s]+/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(' ')
  );
}

export const PATTERN_CATEGORIES: PatternCategory[] = [
  'Navigation',
  'Search',
  'Filters',
  'Cards',
  'Tables',
  'Charts',
  'Forms',
  'Modals',
  'Tabs',
  'Bottom Navigation',
  'Date Pickers',
  'Empty States',
  'Notifications',
  'Checkout',
  'Onboarding',
];

export const CONTENT_KINDS: { kind: ContentKind; label: string; href: string }[] = [
  { kind: 'apps', label: 'Apps', href: '/inspirations/apps' },
  { kind: 'screens', label: 'Screens', href: '/inspirations/screens' },
  { kind: 'ui-elements', label: 'UI Elements', href: '/inspirations/ui-elements' },
  { kind: 'flows', label: 'Flows', href: '/inspirations/flows' },
  { kind: 'patterns', label: 'Patterns', href: '/inspirations/patterns' },
];

/** Compact "116K" style counts — never dominant, always readable. */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
