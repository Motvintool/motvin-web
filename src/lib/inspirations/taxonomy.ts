import type {
  ContentKind,
  ElementKind,
  FlowCategory,
  Industry,
  PatternCategory,
  Platform,
  ScreenType,
  Style,
} from './types';

/** Human labels for every enum the filters and cards display. */

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

export const ELEMENT_LABEL: Record<ElementKind, string> = {
  button: 'Button',
  input: 'Input',
  search: 'Search',
  card: 'Card',
  navigation: 'Navigation',
  'bottom-nav': 'Bottom Navigation',
  tabs: 'Tabs',
  table: 'Table',
  chart: 'Chart',
  form: 'Form',
  modal: 'Modal',
  toggle: 'Toggle',
  avatar: 'Avatar',
  badge: 'Badge',
  icon: 'Icon',
  image: 'Image',
  list: 'List',
  chip: 'Chip',
  stepper: 'Stepper',
  'empty-state': 'Empty State',
  notification: 'Notification',
};

export const FLOW_CATEGORY_LABEL: Record<FlowCategory, string> = {
  onboarding: 'Onboarding',
  checkout: 'Checkout',
  authentication: 'Authentication',
  search: 'Search',
  settings: 'Settings',
  creation: 'Creation',
  discovery: 'Discovery',
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

/** The quick industry chips shown on the explore page, in display order. */
export const QUICK_INDUSTRIES: Industry[] = [
  'saas',
  'fintech',
  'ai',
  'ecommerce',
  'productivity',
  'healthcare',
  'travel',
  'finance',
];

/** Compact "116K" style counts — never dominant, always readable. */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}K`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(n);
}
