/**
 * The crawler's screen taxonomy, and how it maps onto what the Inspirations
 * store publishes.
 *
 * Two vocabularies are in play and they are deliberately different sizes:
 *
 *   SCREEN_TYPES    — this file. Fine-grained, what a designer browsing a
 *                     library wants to filter by. Stored verbatim in
 *                     analysis/<screen-id>.json and in the sidecar's fineType.
 *   PUBLISHED_TYPES — the values manifest.builder.ts accepts in a sidecar's
 *                     screenType and in a filename prefix. Anything else makes
 *                     the builder reject the screen.
 *
 * So every crawler type declares which published type it files under. Adding
 * a new screen type is one entry in SCREEN_TYPES; nothing else has to change.
 *
 * A type also declares its `state`, when it is one: a loading screen, an empty
 * state, a dialog and a success message are not destinations someone
 * navigates to but conditions a screen can be in. The gallery filters on state
 * separately from type, so "empty states across all apps" is one click.
 *
 * `publish: false` marks a type the pipeline recognises but never files as a
 * real screen — reserved for a future type nobody should see in the gallery
 * at all. A Google/Apple/Facebook sign-in page used to be one of these; it
 * is published like any other screen now, at the admin's request, so its
 * place in the user's journey isn't lost.
 */

/** The values motvin-backend/src/modules/inspirations/manifest.builder.ts accepts. */
export const PUBLISHED_TYPES = [
  'landing', 'splash', 'onboarding', 'permission', 'login', 'signup', 'home',
  'dashboard', 'feed', 'search', 'detail', 'product', 'cart', 'checkout',
  'pricing', 'profile', 'settings', 'notifications', 'messages', 'map',
  'calendar', 'player', 'form', 'modal', 'success', 'error', 'empty', 'loading',
  'other',
];

/** Screen states the builder accepts on a sidecar. */
export const PUBLISHED_STATES = [
  'loading', 'empty', 'error', 'success', 'modal', 'bottom-sheet', 'toast',
  'coach-mark', 'permission', 'scrolled', 'keyboard',
];

/**
 * Extend by adding a row. `publishedAs` must stay inside PUBLISHED_TYPES.
 * `flow` is the default flow bucket a screen of this type belongs to, used
 * when grouping a crawl into flows.json entries. `state`, when set, is the
 * screen state the type implies.
 */
export const SCREEN_TYPES = {
  splash:           { publishedAs: 'splash',       flow: 'onboarding',     label: 'Splash' },
  onboarding:       { publishedAs: 'onboarding',   flow: 'onboarding',     label: 'Onboarding' },
  coach_mark:       { publishedAs: 'onboarding',   flow: 'onboarding',     label: 'Coach mark',      state: 'coach-mark' },
  permission:       { publishedAs: 'permission',   flow: 'onboarding',     label: 'Permission',      state: 'permission' },
  login:            { publishedAs: 'login',        flow: 'authentication', label: 'Login' },
  otp:              { publishedAs: 'login',        flow: 'authentication', label: 'Verification code' },
  signup:           { publishedAs: 'signup',       flow: 'authentication', label: 'Sign up' },
  external_auth:    { publishedAs: 'login',        flow: 'authentication', label: 'External sign-in' },
  home:             { publishedAs: 'home',         flow: 'discovery',      label: 'Home' },
  dashboard:        { publishedAs: 'dashboard',    flow: 'discovery',      label: 'Dashboard' },
  feed:             { publishedAs: 'feed',         flow: 'discovery',      label: 'Feed' },
  category:         { publishedAs: 'feed',         flow: 'discovery',      label: 'Category' },
  search:           { publishedAs: 'search',       flow: 'search',         label: 'Search' },
  search_results:   { publishedAs: 'search',       flow: 'search',         label: 'Search results' },
  detail:           { publishedAs: 'detail',       flow: 'discovery',      label: 'Detail' },
  product_detail:   { publishedAs: 'product',      flow: 'shopping',       label: 'Product detail' },
  cart:             { publishedAs: 'cart',         flow: 'checkout',       label: 'Cart' },
  checkout:         { publishedAs: 'checkout',     flow: 'checkout',       label: 'Checkout' },
  payment:          { publishedAs: 'checkout',     flow: 'checkout',       label: 'Payment' },
  paywall:          { publishedAs: 'pricing',      flow: 'checkout',       label: 'Paywall' },
  profile:          { publishedAs: 'profile',      flow: 'settings',       label: 'Profile' },
  settings:         { publishedAs: 'settings',     flow: 'settings',       label: 'Settings' },
  notifications:    { publishedAs: 'notifications',flow: 'discovery',      label: 'Notifications' },
  messages:         { publishedAs: 'messages',     flow: 'discovery',      label: 'Messages' },
  map:              { publishedAs: 'map',          flow: 'discovery',      label: 'Map' },
  calendar:         { publishedAs: 'calendar',     flow: 'creation',       label: 'Calendar' },
  media:            { publishedAs: 'feed',         flow: 'discovery',      label: 'Media' },
  player:           { publishedAs: 'player',       flow: 'discovery',      label: 'Player' },
  form:             { publishedAs: 'form',         flow: 'creation',       label: 'Form' },
  dialog:           { publishedAs: 'modal',        flow: 'discovery',      label: 'Dialog',          state: 'modal' },
  bottom_sheet:     { publishedAs: 'modal',        flow: 'discovery',      label: 'Bottom sheet',    state: 'bottom-sheet' },
  toast:            { publishedAs: 'modal',        flow: 'discovery',      label: 'Toast',           state: 'toast' },
  confirmation:     { publishedAs: 'success',      flow: 'checkout',       label: 'Success',         state: 'success' },
  error:            { publishedAs: 'error',        flow: 'discovery',      label: 'Error',           state: 'error' },
  empty_state:      { publishedAs: 'empty',        flow: 'discovery',      label: 'Empty state',     state: 'empty' },
  loading:          { publishedAs: 'loading',      flow: 'discovery',      label: 'Loading',         state: 'loading' },
  other:            { publishedAs: 'other',        flow: 'discovery',      label: 'Other' },
};

export const SCREEN_TYPE_NAMES = Object.keys(SCREEN_TYPES);

/** Flow categories manifest.builder.ts accepts for a flows.json entry. */
export const PUBLISHED_FLOW_CATEGORIES = [
  'onboarding', 'checkout', 'authentication', 'search', 'settings', 'creation', 'discovery',
];

/** Industries manifest.builder.ts accepts on an app record. */
export const INDUSTRIES = [
  'saas', 'fintech', 'healthcare', 'ecommerce', 'education', 'travel',
  'productivity', 'ai', 'social', 'finance', 'food', 'entertainment', 'lifestyle',
  // "Could not work it out" — see category.js. Accepted by the builder so the app
  // can still be published, but never offered to a model or a person as a choice.
  'unsorted',
];

/** The categories a model or a person can actually pick — everything but `unsorted`. */
export const PICKABLE_INDUSTRIES = INDUSTRIES.filter((industry) => industry !== 'unsorted');

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
  'keyboard', 'toggle', 'slider', 'stepper', 'chip', 'badge', 'avatar', 'modal',
  'bottom-sheet', 'alert', 'toast', 'banner', 'empty-state', 'map', 'calendar',
  'media-player', 'progress', 'skeleton', 'rating', 'price', 'cta', 'coach-mark',
  'segmented-control', 'page-indicator', 'legal-text',
];

export function isKnownScreenType(type) {
  return Object.prototype.hasOwnProperty.call(SCREEN_TYPES, type);
}

/** Crawler type → the type the builder will accept. Unknown types file as "other". */
export function publishedTypeFor(screenType) {
  return SCREEN_TYPES[screenType]?.publishedAs ?? 'other';
}

/** Crawler type → the screen state it implies, or null. */
export function stateFor(screenType) {
  return SCREEN_TYPES[screenType]?.state ?? null;
}

/** Whether screens of this type belong in the library at all. */
export function isPublishable(screenType) {
  return SCREEN_TYPES[screenType]?.publish !== false;
}

/** Crawler type → default flows.json category. */
export function flowCategoryFor(screenType) {
  const flow = SCREEN_TYPES[screenType]?.flow ?? 'discovery';
  return PUBLISHED_FLOW_CATEGORIES.includes(flow) ? flow : 'discovery';
}

/** Human label for a crawler type. */
export function labelFor(screenType) {
  return SCREEN_TYPES[screenType]?.label ?? String(screenType).replace(/_/g, ' ');
}

/** Keeps only styles the builder will publish; the rest would just warn. */
export function filterStyles(styles) {
  return (styles || []).filter((style) => STYLES.includes(style));
}

/** Keeps only states the builder will publish. */
export function filterStates(states) {
  return [...new Set((states || []).filter((state) => PUBLISHED_STATES.includes(state)))];
}

/**
 * The type a screen's name says it is, for a screen the rules could only
 * call "other": "Actions menu" is a modal, "AI chat interface" messages,
 * "Enter your password" a login. Earlier words decide over later ones only
 * through the order below — a sheet or menu first (it sits over a page,
 * whatever the page is), then what the page is for. Returns a published
 * type, or null when the name says nothing a library files by.
 */
const TYPE_BY_NAME = [
  ['loading', /\b(loading|thinking|syncing|processing|spinner)\b/],
  // A permission prompt is a permission before it is a prompt.
  ['permission', /\b(permissions?|allow access|access request)\b/],
  ['modal', /\b(menu|actions?|options|sheet|picker|selector|dropdown|popup|pop-up|dialog|prompt|share settings|context menu|action sheet|overlay)\b/],
  ['error', /\b(error|failed|failure|went wrong)\b/],
  ['empty', /\b(empty|no results|nothing here)\b/],
  ['success', /\b(success|confirmed|confirmation|done|booked|completed|all set)\b/],
  ['splash', /\b(splash|launch screen)\b/],
  ['signup', /\b(sign ?up|create (an )?account|registration|register)\b/],
  ['login', /\b(log ?in|sign ?in|password|verification|otp|passcode|authenticat\w*)\b/],
  ['checkout', /\b(checkout|payment|pay now|billing)\b/],
  ['pricing', /\b(pricing|plans?|subscription|upgrade|premium|super \w+|pro plan|trial)\b/],
  ['cart', /\b(cart|basket|bag)\b/],
  ['notifications', /\b(notifications?|alerts?|activity|inbox)\b/],
  ['messages', /\b(chat|conversation|thread|messages?|comments?|ai assistant)\b/],
  ['search', /\b(search|filters?|sort|results)\b/],
  ['settings', /\b(settings|preferences|language|members|account|privacy|appearance|theme)\b/],
  ['profile', /\b(profile|my account)\b/],
  ['calendar', /\b(calendar|schedule|date|time of day|booking dates?)\b/],
  ['map', /\b(map|location|address|directions)\b/],
  ['player', /\b(player|video|audio|now playing|lesson)\b/],
  ['onboarding', /\b(welcome|onboarding|intro|tour|get(ting)? started|tutorial|goal|level|guide)\b/],
  ['form', /\b(form|entry|input|enter|edit|compose|new item|naming)\b/],
  ['home', /\b(home( screen| feed)?|dashboard|recents?|recently viewed)\b/],
  ['detail', /\b(details?|overview|page|note|notes|summary|item|listing)\b/],
];

export function typeFromName(name) {
  const text = String(name ?? '').toLowerCase().replace(/\s*\(\d+\)\s*$/, '').replace(/\s+—.*$/, '');
  if (!text || /^other$/.test(text)) return null;
  for (const [type, test] of TYPE_BY_NAME) if (test.test(text)) return type;
  return null;
}

/**
 * The type a screen is filed under, from the strongest word on it: the model
 * that saw the screenshot, else — when the rules could only say "other" —
 * what its name says, else the rules' own guess.
 */
export function settledType({ classified, modelType, name }) {
  if (modelType && PUBLISHED_TYPES.includes(modelType) && modelType !== 'other') return modelType;
  if (!classified || classified === 'other') return typeFromName(name) ?? classified ?? 'other';
  return classified;
}

/**
 * A screen's name the way a designer files it: no state tacked on after a
 * "·" or " - " ("Main menu · bottom sheet" is "Main menu" — the state is its
 * own field), and no trailing "screen" ("Welcome screen" is "Welcome").
 */
export function plainScreenName(name) {
  if (!name) return name;
  let plain = String(name).split(/\s+[·|]\s+|\s+-\s+/)[0].trim();
  plain = plain.replace(/\s+screen$/i, '').trim();
  return plain || String(name).trim();
}
