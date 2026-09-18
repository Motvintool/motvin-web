/**
 * The crawler's screen taxonomy, and how it maps onto what the Inspirations
 * store actually publishes.
 *
 * Two vocabularies are in play and they are deliberately different sizes:
 *
 *   SCREEN_TYPES  — this file. Fine-grained, 29 entries, what a designer
 *                   browsing a library wants to filter by. Stored verbatim in
 *                   analysis/<screen-id>.json.
 *   PUBLISHED_TYPES — the 13 values manifest.builder.ts accepts in a sidecar's
 *                   screenType and in a filename prefix. Anything else makes
 *                   the builder reject the screen.
 *
 * So every crawler type declares which published type it files under. Adding a
 * new screen type is one entry in SCREEN_TYPES; nothing else has to change.
 */

/** The 13 values motvin-backend/src/modules/inspirations/manifest.builder.ts accepts. */
export const PUBLISHED_TYPES = [
  'landing', 'login', 'signup', 'dashboard', 'search', 'pricing', 'checkout',
  'settings', 'profile', 'onboarding', 'feed', 'product', 'other',
];

/**
 * Extend by adding a row. `publishedAs` must stay inside PUBLISHED_TYPES.
 * `flow` is the default flow bucket a screen of this type belongs to, used
 * when grouping a crawl into flows.json entries.
 */
export const SCREEN_TYPES = {
  splash:           { publishedAs: 'other',      flow: 'launch',        label: 'Splash' },
  onboarding:       { publishedAs: 'onboarding', flow: 'onboarding',    label: 'Onboarding' },
  permission:       { publishedAs: 'other',      flow: 'onboarding',    label: 'Permission' },
  login:            { publishedAs: 'login',      flow: 'authentication',label: 'Login' },
  signup:           { publishedAs: 'signup',     flow: 'authentication',label: 'Signup' },
  home:             { publishedAs: 'dashboard',  flow: 'discovery',     label: 'Home' },
  dashboard:        { publishedAs: 'dashboard',  flow: 'discovery',     label: 'Dashboard' },
  feed:             { publishedAs: 'feed',       flow: 'discovery',     label: 'Feed' },
  category:         { publishedAs: 'feed',       flow: 'discovery',     label: 'Category' },
  search:           { publishedAs: 'search',     flow: 'search',        label: 'Search' },
  search_results:   { publishedAs: 'search',     flow: 'search',        label: 'Search Results' },
  detail:           { publishedAs: 'product',    flow: 'discovery',     label: 'Detail' },
  product_detail:   { publishedAs: 'product',    flow: 'shopping',      label: 'Product Detail' },
  cart:             { publishedAs: 'checkout',   flow: 'checkout',      label: 'Cart' },
  checkout:         { publishedAs: 'checkout',   flow: 'checkout',      label: 'Checkout' },
  payment:          { publishedAs: 'checkout',   flow: 'checkout',      label: 'Payment' },
  paywall:          { publishedAs: 'pricing',    flow: 'checkout',      label: 'Paywall' },
  profile:          { publishedAs: 'profile',    flow: 'settings',      label: 'Profile' },
  settings:         { publishedAs: 'settings',   flow: 'settings',      label: 'Settings' },
  notifications:    { publishedAs: 'feed',       flow: 'discovery',     label: 'Notifications' },
  messages:         { publishedAs: 'feed',       flow: 'discovery',     label: 'Messages' },
  map:              { publishedAs: 'other',      flow: 'discovery',     label: 'Map' },
  calendar:         { publishedAs: 'other',      flow: 'creation',      label: 'Calendar' },
  media:            { publishedAs: 'feed',       flow: 'discovery',     label: 'Media' },
  player:           { publishedAs: 'other',      flow: 'discovery',     label: 'Player' },
  form:             { publishedAs: 'other',      flow: 'creation',      label: 'Form' },
  confirmation:     { publishedAs: 'other',      flow: 'checkout',      label: 'Confirmation' },
  error:            { publishedAs: 'other',      flow: 'discovery',     label: 'Error' },
  empty_state:      { publishedAs: 'other',      flow: 'discovery',     label: 'Empty State' },
  other:            { publishedAs: 'other',      flow: 'discovery',     label: 'Other' },
};

export const SCREEN_TYPE_NAMES = Object.keys(SCREEN_TYPES);

/** Flow categories manifest.builder.ts accepts for a flows.json entry. */
export const PUBLISHED_FLOW_CATEGORIES = [
  'onboarding', 'checkout', 'authentication', 'search', 'settings', 'creation', 'discovery',
];

/** Industries manifest.builder.ts accepts on an app record. */
export const INDUSTRIES = [
  'saas', 'fintech', 'healthcare', 'ecommerce', 'education', 'travel',
  'productivity', 'ai', 'social', 'finance',
];

/** Styles manifest.builder.ts accepts on a sidecar. Anything else is dropped. */
export const STYLES = [
  'minimal', 'editorial', 'bold', 'dark', 'light', 'playful', 'corporate', 'experimental',
];

/**
 * UI element vocabulary. Free-form in the manifest (it counts whatever it is
 * given), so this is a suggestion list that keeps the facet from fragmenting
 * into fifty spellings of "nav bar".
 */
export const ELEMENTS = [
  'navigation', 'tab-bar', 'nav-bar', 'search-bar', 'button', 'card', 'list',
  'grid', 'carousel', 'chart', 'table', 'kpi-card', 'form', 'text-field',
  'toggle', 'slider', 'stepper', 'chip', 'badge', 'avatar', 'modal',
  'bottom-sheet', 'alert', 'toast', 'banner', 'empty-state', 'map', 'calendar',
  'media-player', 'progress', 'skeleton', 'rating', 'price', 'cta',
];

export function isKnownScreenType(type) {
  return Object.prototype.hasOwnProperty.call(SCREEN_TYPES, type);
}

/** Crawler type → the type the builder will accept. Unknown types file as "other". */
export function publishedTypeFor(screenType) {
  return SCREEN_TYPES[screenType]?.publishedAs ?? 'other';
}

/** Crawler type → default flows.json category. */
export function flowCategoryFor(screenType) {
  const flow = SCREEN_TYPES[screenType]?.flow ?? 'discovery';
  return PUBLISHED_FLOW_CATEGORIES.includes(flow) ? flow : 'discovery';
}

/** Keeps only styles the builder will publish; the rest would just warn. */
export function filterStyles(styles) {
  return (styles || []).filter((style) => STYLES.includes(style));
}
