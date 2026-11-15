/**
 * An emoji for each taxonomy value, shown after its name when the Explore
 * heading types it in (hovering a link under the heading). Values are
 * open-ended — a sidecar can record a kind this table has never seen — so
 * every group falls back to an emoji of its own.
 */

export type TaxonomyGroup = 'industry' | 'screen' | 'element' | 'flow';

const INDUSTRY: Record<string, string> = {
  saas: '☁️',
  fintech: '💳',
  healthcare: '🩺',
  ecommerce: '🛍️',
  education: '🎓',
  travel: '✈️',
  productivity: '✅',
  ai: '✨',
  social: '💬',
  finance: '💰',
  food: '🍔',
  entertainment: '🎬',
  lifestyle: '🌿',
  unsorted: '🗂️',
};

const SCREEN: Record<string, string> = {
  landing: '🏁',
  splash: '💦',
  onboarding: '👋',
  permission: '🔐',
  login: '🔑',
  signup: '📝',
  home: '🏠',
  dashboard: '📊',
  feed: '📰',
  search: '🔍',
  detail: '🔎',
  product: '📦',
  cart: '🛒',
  checkout: '💳',
  pricing: '🏷️',
  profile: '👤',
  settings: '⚙️',
  notifications: '🔔',
  messages: '💬',
  map: '🗺️',
  calendar: '📅',
  player: '🎵',
  form: '📝',
  modal: '🪟',
  success: '🎉',
  error: '⚠️',
  empty: '🫙',
  loading: '⏳',
};

const ELEMENT: Record<string, string> = {
  button: '🔘',
  input: '⌨️',
  search: '🔍',
  'search-bar': '🔍',
  card: '🃏',
  navigation: '🧭',
  'nav-bar': '🧭',
  sidebar: '📑',
  'bottom-nav': '🧭',
  tabs: '🗂️',
  'tab-bar': '🗂️',
  table: '📋',
  chart: '📈',
  'kpi-card': '📊',
  'progress-ring': '⭕',
  form: '📝',
  modal: '🪟',
  'bottom-sheet': '📄',
  toggle: '🎚️',
  avatar: '🙂',
  badge: '🏅',
  banner: '🎌',
  icon: '⭐',
  image: '🖼️',
  list: '📃',
  chip: '🏷️',
  stepper: '🪜',
  'date-picker': '📅',
  'filter-panel': '🎛️',
  cta: '👉',
  'empty-state': '🫙',
  'success-state': '🎉',
  notification: '🔔',
};

const FLOW: Record<string, string> = {
  onboarding: '👋',
  checkout: '🛒',
  authentication: '🔐',
  search: '🔍',
  settings: '⚙️',
  creation: '🎨',
  discovery: '🧭',
};

const TABLES: Record<TaxonomyGroup, Record<string, string>> = {
  industry: INDUSTRY,
  screen: SCREEN,
  element: ELEMENT,
  flow: FLOW,
};

const FALLBACK: Record<TaxonomyGroup, string> = {
  industry: '📱',
  screen: '📱',
  element: '🧩',
  flow: '🔀',
};

export function taxonomyEmoji(group: TaxonomyGroup, key: string): string {
  return TABLES[group][key] ?? FALLBACK[group];
}
