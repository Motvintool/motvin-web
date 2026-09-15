import type {
  ContentKind,
  FlowCategory,
  Industry,
  PatternCategory,
  Platform,
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
  login: 'Login',
  signup: 'Signup',
  dashboard: 'Dashboard',
  search: 'Search',
  pricing: 'Pricing',
  checkout: 'Checkout',
  settings: 'Settings',
  profile: 'Profile',
  onboarding: 'Onboarding',
  feed: 'Feed',
  product: 'Product',
  other: 'Other',
};

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

export const FLOW_CATEGORY_LABEL: Record<FlowCategory, string> = {
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
