import { inspirationsApi } from '../api';
import { correctText } from './fuzzy';
import { appsUsingPattern, loadIndex, type LibraryIndex } from './guideIndex';
import { asksElements, findElements, findFlowCategory, findNegations, findNumberFilter, findOrdinal, findPatternCategory, findPatterns, findStates, findStyles, findTopN, matchesNumber, splitIntents, stripElements, withoutNegations, type NumberFilter } from './guideParse';
import { countedPlatforms, countsOn, PLATFORM_ONE } from '../appCounts';
import { INSPIRATIONS_ROUTES } from '../routes';
import { suggestQueries, type SearchSuggestion } from '../search';
import { browsedPlatforms, EMPTY_FILTERS, isWebsPlatforms, WEBS_PLATFORMS } from '../filters';
import { isPlatformMove, readPlatformAsk, withoutPlatform, type PlatformAsk } from './platformAsk';
import { applySynonyms, findIndustry, findPlatform, findPlatforms, PLATFORM_ADJECTIVE, PLATFORM_LABEL, PLATFORM_QUERY, stripChatter } from './synonyms';
import { elementLabel, flowCategoryLabel, INDUSTRY_LABEL, pageTypeLabel, SCREEN_TYPE_LABEL, screenStateLabel, sectionTypeLabel, styleLabel } from '../taxonomy';
import { FLOW_CATEGORY_PRESETS, isDesktopPlatform, type App, type Flow, type Pattern, type Platform, type ScreenState, type ScreenType, type Style } from '../types';

/**
 * The visitor-facing assistant: it answers "where do you want to go?" and the
 * plain facts a visitor asks on the way — how many screens an app has, which
 * app has the most flows, where a pattern is used — from the same public
 * library data the search box uses. It can open a page, answer, ask which of
 * several things was meant, or offer a small safe action (save, copy a link).
 * No admin tools, no server call, no model.
 */

/** A button: a link to go to, or (with `ask`) a follow-up question to send as if typed. */
export type NavTarget = { label: string; hint: string; href: string; iconSrc?: string; ask?: string };
/** A card under an answer: one thing's facts, or (with `columns`/`rows`) a side-by-side comparison. */
/** A comparison's apps head its columns; `lead` in a row is the column with the most, when one alone has it. */
export type NavCard = { title: string; iconSrc?: string; facts: string[]; href?: string; columns?: string[]; apps?: { name: string; iconSrc?: string; href: string; subtitle: string }[]; rows?: { label: string; values: string[]; lead?: number }[] };
/** Something the guide may do for the visitor, once they confirm it. */
/** The one thing Buddy does beyond showing: copy a link, after the visitor says yes. */
export type GuideAction = { kind: 'copy'; href: string; label: string };
export type ReplyKind = 'nav' | 'answer' | 'clarify' | 'fallback' | 'smalltalk' | 'error' | 'action';
/** `asked`: the question as it was answered — a platform move ("for web") joined to the question before it. */
export type NavReply = { text: string; targets: NavTarget[]; go?: NavTarget; card?: NavCard; app?: App; error?: boolean; kind?: ReplyKind; action?: GuideAction; results?: NavTarget[]; asked?: string };
/** What the guide knows going in: the app being talked about, what it last listed, and the page the visitor is on. */
/**
 * `previous`: the last question that was about something (not a greeting), for a move like "for web"; `ask`: the
 * platform the message names (platformAsk), worked out once for the whole message.
 */
export type NavContext = { app: App | null; results?: NavTarget[] | null; page?: { pathname: string; search?: string } | null; previous?: string | null; ask?: PlatformAsk | null };

const PAGES: { keys: string[]; target: NavTarget }[] = [
  { keys: ['explore', 'home', 'inspirations', 'start'], target: { label: 'Explore', hint: 'Home', href: INSPIRATIONS_ROUTES.explore } },
  { keys: ['apps', 'all apps', 'app list', 'browse apps'], target: { label: 'Apps', hint: 'Page', href: INSPIRATIONS_ROUTES.apps } },
  { keys: ['screens', 'all screens'], target: { label: 'Screens', hint: 'Page', href: INSPIRATIONS_ROUTES.screens } },
  { keys: ['flows', 'flow', 'user flows', 'all flows'], target: { label: 'Flows', hint: 'Page', href: INSPIRATIONS_ROUTES.flows } },
  { keys: ['ui elements', 'ui element', 'elements', 'components', 'ui', 'ui kit', 'ui components'], target: { label: 'UI elements', hint: 'Page', href: INSPIRATIONS_ROUTES.uiElements } },
  { keys: ['patterns', 'pattern'], target: { label: 'Patterns', hint: 'Page', href: INSPIRATIONS_ROUTES.patterns } },
  { keys: ['collections', 'collection', 'boards', 'saved', 'my boards', 'my collections', 'my collection', 'my saved', 'saved items', 'saved apps', 'saved screens', 'what did i save', 'what have i saved', 'my saves', 'bookmarks', 'my bookmarks', 'favorites', 'favourites', 'my favorites', 'my favourites'], target: { label: 'Collections', hint: 'Page', href: INSPIRATIONS_ROUTES.collections } },
  { keys: ['icons', 'icon library'], target: { label: 'Icon library', hint: 'Page', href: '/icons' } },
  // After the quick pages (QUICK_PAGES takes 1–6), so their order stays.
  // Not plain "settings": that's the settings screens (as "login" is login screens), of the app being talked
  // about if there is one. The visitor's own page is "my settings", "account settings" and the like.
  { keys: ['my settings', 'account settings', 'motvin settings', 'my account', 'preferences', 'profile settings'], target: { label: 'Settings', hint: 'Page', href: INSPIRATIONS_ROUTES.settings } },
  { keys: ['search', 'search page', 'advanced search'], target: { label: 'Search', hint: 'Page', href: INSPIRATIONS_ROUTES.search } },
];

/** "app store screenshots", "store screenshots", "marketing screenshots", "app store screens": an app's store set. */
const STORE_SHOTS = /\b(?:app ?store|play ?store|store|marketing|listing)\s+(?:screenshots?|screen ?shots?|screens?|images?|shots)\b|\bstore ?shots\b/;

export const QUICK_PAGES: NavTarget[] = PAGES.slice(1, 7).map((page) => page.target);

const pageFor = (query: string) => PAGES.find((entry) => entry.keys.some((key) => key === query || (query.length > 3 && key === `${query}s`)));

const FILLER = /\b(please|can you|could you|take me to|take me|go to|open|show me|show|find me|find|look for|navigate to|navigate|bring me to|i want to see|i want|the|a|an|page|section|app|apps called)\b/g;

const clean = (text: string) =>
  text
    .toLowerCase()
    .replace(FILLER, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const toTarget = (suggestion: SearchSuggestion): NavTarget => ({ label: suggestion.label, hint: suggestion.hint, href: suggestion.href, iconSrc: suggestion.iconSrc });

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);

/** A different phrasing each time, so repeated answers don't read like a template. */
const pick = (options: string[]) => options[Math.floor(Math.random() * options.length)];

type Section = { tab: 'screens' | 'ui-elements' | 'patterns' | 'flows'; label: string };
const SECTIONS: { words: string[]; section: Section }[] = [
  { words: ['flows', 'flow', 'journeys', 'journey'], section: { tab: 'flows', label: 'flows' } },
  { words: ['ui elements', 'ui element', 'elements', 'components'], section: { tab: 'ui-elements', label: 'UI elements' } },
  { words: ['patterns', 'pattern'], section: { tab: 'patterns', label: 'patterns' } },
  { words: ['screens', 'screen', 'screenshots'], section: { tab: 'screens', label: 'screens' } },
];

// Screen types that are unambiguous even without the word "screen".
// "settings" too: the visitor's own Settings page is "my settings" / "account settings" (see PAGES).
const SAFE_TYPES = new Set(['splash', 'onboarding', 'login', 'signup', 'checkout', 'cart', 'pricing', 'permission', 'landing', 'dashboard', 'settings']);

function findSection(text: string): Section | null {
  const found = SECTIONS.find((entry) => entry.words.some((word) => hasWord(text, word)));
  return found?.section ?? null;
}

type TypeHit = { key: string; label: string };

function findScreenType(text: string): TypeHit | null {
  const mentionsScreen = hasWord(text, 'screen') || hasWord(text, 'screens') || hasWord(text, 'page') || hasWord(text, 'pages');
  for (const [key, label] of Object.entries(SCREEN_TYPE_LABEL)) {
    if (key === 'other') continue;
    const spoken = [key, label.toLowerCase()];
    if (!spoken.some((word) => hasWord(text, word))) continue;
    if (mentionsScreen || SAFE_TYPES.has(key)) return { key, label };
  }
  return null;
}

function findApps(text: string, apps: App[]): App[] {
  const lower = text.toLowerCase();
  const full = apps.filter((app) => hasWord(lower, app.name.toLowerCase()) || hasWord(lower, `${app.name.toLowerCase()}s`));
  if (full.length) return full;
  // "Zoho Corporation" is just "zoho" to a visitor, and "swiggys flows" is Swiggy's.
  return apps.filter((app) => {
    const first = app.name.toLowerCase().split(/\s+/)[0];
    return first.length >= 4 && (hasWord(lower, first) || hasWord(lower, `${first}s`));
  });
}

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

// A website's page types by the words people use for them ("pricing", "prices", "home page", "jobs").
const SITE_PAGE_WORDS: [string, RegExp][] = [
  ['pricing', /\b(?:pricing|prices?|price|plans?)\b/],
  ['landing', /\b(?:landing|home ?pages?|homepage|front ?page)\b/],
  ['about', /\babout(?: us)? pages?\b|\babout us\b/],
  ['features', /\bfeatures?\b/],
  ['solutions', /\b(?:solutions?|use cases?)\b/],
  ['customers', /\b(?:customers?|case stud(?:y|ies)|testimonials?)\b/],
  ['careers', /\b(?:careers?|jobs?|hiring)\b/],
  ['contact', /\b(?:contact(?: us)?|talk to sales)\b/],
  ['blog-post', /\b(?:blog post|article)s?\b/],
  ['blog', /\bblogs?\b/],
  ['docs', /\b(?:docs|documentation|help cent(?:er|re))\b/],
  ['changelog', /\b(?:changelog|release notes|what'?s new)\b/],
  ['integrations', /\bintegrations?\b/],
  ['legal', /\b(?:legal|privacy|terms)\b/],
  ['login', /\b(?:log ?in|sign ?in)\b/],
  ['signup', /\b(?:sign ?up|register)\b/],
  ['not-found', /\b(?:404|not found)\b/],
  ['product', /\bproducts?\b/],
];
/** "a Pricing Page", "an About Page". */
const aOrAn = (word: string) => `${/^[aeiou]/i.test(word) ? 'an' : 'a'} ${word}`;
const findSitePageType = (lower: string) => SITE_PAGE_WORDS.find(([, re]) => re.test(lower))?.[0] ?? null;
// A website's sections by the words people use ("hero", "footer", "mega menu", "faq").
const SITE_SECTION_WORDS: [string, RegExp][] = [
  ['nav-menu', /\b(?:nav(?:igation)? menus?|mega ?menus?|drop ?down menus?|menus?)\b/],
  ['navigation', /\b(?:nav ?bars?|navigation(?: bars?)?|headers?|top bars?)\b/],
  ['hero', /\bheros?(?: sections?| banners?)?\b/],
  ['logos', /\b(?:logos?(?: clouds?| walls?| strips?)?|trusted by)\b/],
  ['how-it-works', /\bhow it works\b/],
  ['testimonials', /\b(?:testimonials?|reviews?|quotes?)\b/],
  ['stats', /\b(?:stats|statistics|numbers)\b/],
  ['faq', /\b(?:faqs?|questions)\b/],
  ['cta', /\b(?:ctas?|call to actions?|calls to action)\b/],
  ['footer', /\bfooters?\b/],
  ['comparison', /\b(?:comparisons?|compare tables?)\b/],
  ['team', /\bteams?\b/],
  ['features', /\bfeatures?\b/],
  ['pricing', /\b(?:pricing(?: tables?)?|plans?)\b/],
  ['blog', /\bblogs?\b/],
  ['contact', /\bcontact\b/],
];
// Words that only ever mean a website's section, so they need no "section" beside them.
const EXCLUSIVE_SECTION = /\b(?:heros?|footers?|mega ?menus?|faqs?|testimonials?|logo clouds?|call to actions?|ctas?|how it works)\b/;
const findSiteSectionType = (lower: string) => SITE_SECTION_WORDS.find(([, re]) => re.test(lower))?.[0] ?? null;
/**
 * The three platforms, as people say them: Apps (iOS), Web Apps ("web apps") and Webs — websites ("web", "webs",
 * "websites"). A website is an app captured on Webs alone: its pages are what is asked for, not screens.
 */
const isWebsite = (app: App | null | undefined): app is App => Boolean(app?.platforms?.length && app.platforms.every((platform) => platform === 'site'));

// A website's pages, by app id: kept apart from screens (see withoutWebsitePages), said as pages.
const websitePages = new Map<string, number>();

/**
 * An app as Buddy counts it: a website's pages taken out of its screens — they are pages, not screens, and
 * never add into a screen total or ranking. Kept in websitePages for the app's own count ("2 pages").
 */
function withoutWebsitePages(app: App): App {
  const pages = app.platformCounts?.site?.screens ?? 0;
  if (!app.platformCounts?.site) return app;
  websitePages.set(app.id, pages);
  const platformCounts = { ...app.platformCounts };
  delete platformCounts.site;
  return { ...app, screenCount: Math.max(0, app.screenCount - pages), platformCounts };
}

/** An app on several platforms says its counts per platform ("117 screens on iOS and 33 screens on Web Apps"), never one added-up total. */
function countPhrase(app: App, kind: 'screens' | 'flows'): string {
  const unit = kind === 'screens' ? 'screen' : 'flow';
  const on = countedPlatforms(app);
  const pages = kind === 'screens' ? websitePages.get(app.id) ?? 0 : 0;
  // A website alone: its pages. A website beside an app: the app's screens, and the website's pages.
  if (pages && !on.length) return plural(pages, 'page');
  const sitePart = pages ? ` and ${plural(pages, 'page')} on its site` : '';
  if (on.length < 2) return `${plural(kind === 'screens' ? app.screenCount : app.flowCount, unit)}${sitePart}`;
  return on.map((platform) => `${plural(app.platformCounts?.[platform]?.[kind] ?? 0, unit)} on ${PLATFORM_LABEL[platform]}`).join(' and ') + sitePart;
}

const appTarget = (app: App, tab?: Section['tab'], platform?: Platform): NavTarget => ({
  label: app.name,
  // Its platform in place of a plain "App" ("iOS · 117 screens"); an app on several names each with its count.
  hint: countedPlatforms(app).length > 1 ? countPhrase(app, 'screens') : `${app.platforms[0] ? PLATFORM_ONE[app.platforms[0]] : 'App'} · ${countPhrase(app, 'screens')}`,
  href: ((base) => (tab && tab !== 'screens' ? `${base}${base.includes('?') ? '&' : '?'}tab=${tab}` : base))(INSPIRATIONS_ROUTES.app(app, platform)),
  iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
});

/**
 * A search for screens of one app, in a section the app is in: the one being browsed if it has the app, else
 * the app's own — Webs for an app that isn't on iOS. Always named in the link (`?platform=web` / `ios`), so
 * keepSection doesn't move it to the section being browsed: "Canva settings" asked from Apps found other apps'
 * settings screens (Canva is only in Webs), and an iOS-only app asked about from Webs would have gone to Webs.
 */
function appSearch(app: App, query: string, scope?: readonly Platform[] | null): string {
  const inWebs = app.platforms.some((platform) => WEBS_PLATFORMS.includes(platform));
  const webs = scope?.length && isWebsPlatforms(scope) ? inWebs : inWebs && !app.platforms.includes('ios');
  return `${INSPIRATIONS_ROUTES.searchFor(query)}&platform=${webs ? 'web' : 'ios'}`;
}

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

/** "Swiggy", "Swiggy and Zomato", "Swiggy, Zomato and 3 more". */
function listNames(names: string[], show = 3): string {
  if (names.length <= show) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  return `${names.slice(0, show).join(', ')} and ${names.length - show} more`;
}

/** Likely next questions about an app, minus the one just answered. */
function followUps(app: App, used: Section['tab'] | 'count' | null): NavTarget[] {
  // A website has pages and sections, not screens and flows: what to ask next about it.
  if (app.platforms?.length && app.platforms.every((platform) => platform === 'site')) {
    const site: { key: Section['tab'] | 'count' | 'sections' | 'pricing'; target: NavTarget }[] = [
      { key: 'sections', target: { label: `${app.name} sections`, hint: 'Ask', href: '', ask: `${app.name} sections` } },
      { key: 'count', target: { label: 'How many pages?', hint: 'Ask', href: '', ask: `how many pages does ${app.name} have` } },
      { key: 'pricing', target: { label: 'Pricing page', hint: 'Ask', href: '', ask: `${app.name} pricing page` } },
    ];
    return site.filter((entry) => entry.key !== used).slice(0, 3).map((entry) => entry.target);
  }
  const all: { key: Section['tab'] | 'count'; target: NavTarget }[] = [
    { key: 'flows', target: { label: `${app.name} flows`, hint: 'Ask', href: '', ask: `${app.name} flows` } },
    { key: 'count', target: { label: 'How many screens?', hint: 'Ask', href: '', ask: `how many screens does ${app.name} have` } },
    { key: 'ui-elements', target: { label: 'UI elements', hint: 'Ask', href: '', ask: `${app.name} ui elements` } },
    { key: 'patterns', target: { label: 'Patterns', hint: 'Ask', href: '', ask: `${app.name} patterns` } },
  ];
  return all.filter((entry) => entry.key !== used).slice(0, 3).map((entry) => entry.target);
}

const COMPARE = /\b(compare|versus|vs\.?|difference between|differences between)\b/i;

/** Apps listed as chips, remembered so "the second one" has something to point at. */
const appResults = (list: App[]) => list.map((app) => appTarget(app));

/** The Apps page, introduced by naming what is in it — the answer to "apps", "i want app", "which apps do you have". */
function allApps(apps: App[]): NavReply {
  if (apps.length === 0) return { text: 'Opening Apps.', targets: [], go: QUICK_PAGES[0] };
  const byScreens = [...apps].sort((a, b) => b.screenCount - a.screenCount);
  return { text: `The library has ${plural(apps.length, 'app')} — ${listNames(byScreens.map((app) => app.name), 4)}. Opening Apps.`, targets: appResults(byScreens.slice(0, 4)), go: QUICK_PAGES[0], results: appResults(byScreens) };
}

/** Words left once the app name and generic words are gone — what the visitor is naming. */
function leftoverWords(text: string, apps: App[]): string[] {
  let rest = clean(text);
  for (const app of apps) rest = rest.replace(new RegExp(escape(app.name.toLowerCase()), 'g'), ' ').replace(new RegExp(`\\b${escape(app.name.toLowerCase().split(/\s+/)[0])}\\b`, 'g'), ' ');
  return rest
    .replace(/\b(flows?|journeys?|how|many|much|does|do|have|has|what|are|is|of|in|for|and|with|its|it)\b/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

const flowTarget = (flow: Flow, index: LibraryIndex, withApp: boolean): NavTarget => ({
  label: withApp ? `${flow.name} · ${index.appById.get(flow.appId)?.name ?? 'Flow'}` : flow.name,
  hint: 'Flow',
  href: `${INSPIRATIONS_ROUTES.flows}?flow=${encodeURIComponent(flow.id)}`,
});

function flowCard(flow: Flow, index: LibraryIndex): NavCard {
  const app = index.appById.get(flow.appId);
  const steps = flow.screenIds?.length ?? 0;
  return { title: flow.name, iconSrc: app ? (inspirationsApi.mediaUrl(app.logo) ?? undefined) : undefined, facts: [...(app ? [app.name] : []), ...(flow.category ? [flowCategoryLabel(flow.category)] : []), ...(steps ? [plural(steps, 'step')] : [])], href: `${INSPIRATIONS_ROUTES.flows}?flow=${encodeURIComponent(flow.id)}` };
}

function matchFlows(searchWords: string[], app: App | null, index: LibraryIndex): Flow[] {
  if (!searchWords.length) return [];
  return index.flows.filter((flow) => (!app || flow.appId === app.id) && searchWords.every((word) => flow.name.toLowerCase().includes(word))).slice(0, 6);
}

const patternTarget = (pattern: Pattern): NavTarget => ({ label: pattern.name, hint: `Pattern · ${pattern.category}`, href: INSPIRATIONS_ROUTES.pattern(pattern) });

function patternCard(pattern: Pattern, index: LibraryIndex): NavCard {
  const used = appsUsingPattern(index, pattern);
  return { title: pattern.name, facts: [pattern.category, plural(pattern.screenIds?.length ?? 0, 'screen'), ...(used.length ? [`In ${listNames(used.map((app) => app.name), 3)}`] : [])], href: INSPIRATIONS_ROUTES.pattern(pattern) };
}

async function countScreens(filters: { type?: string; states?: ScreenState[]; styles?: Style[]; element?: string }, app: App | null, platforms: readonly Platform[] | null): Promise<number | null> {
  try {
    const page = await inspirationsApi.listScreens({ ...EMPTY_FILTERS, platforms: platforms ? [...platforms] : [], screenTypes: filters.type ? [filters.type as ScreenType] : [], states: filters.states ?? [], styles: filters.styles ?? [] }, 0, 'curated', { ...(app ? { app: app.id } : {}), ...(filters.element ? { element: filters.element } : {}) });
    return page.total;
  } catch {
    return null;
  }
}

/** The apps a kind of screen appears in, read off the first page of matching screens. */
async function appsWithScreens(filters: { type?: string; states?: ScreenState[]; styles?: Style[]; element?: string }, index: LibraryIndex, platforms: readonly Platform[] | null): Promise<{ apps: App[]; total: number } | null> {
  try {
    const page = await inspirationsApi.listScreens({ ...EMPTY_FILTERS, platforms: platforms ? [...platforms] : [], screenTypes: filters.type ? [filters.type as ScreenType] : [], states: filters.states ?? [], styles: filters.styles ?? [] }, 0, 'curated', filters.element ? { element: filters.element } : {});
    const seen = new Map<string, App>();
    for (const screen of page.items) {
      const app = index.appById.get(screen.appId);
      if (app) seen.set(app.id, app);
    }
    return { apps: [...seen.values()], total: page.total };
  } catch {
    return null;
  }
}

type Ranking = { metric: 'screens' | 'flows' | 'rating' | 'newest'; order: 'high' | 'low' };

/** "which app has the most flows", "top rated apps", "smallest app", "newest app" — a question about apps, ranked. */
function findRanking(raw: string): Ranking | null {
  const text = raw.replace(/\bat (?:least|most)\b/g, ' ');
  // "least flows", "which has the most screens": a ranking of apps even without the word.
  const bare = /^(?:which (?:one |app )?(?:has|have) )?(?:the )?(most|least|fewest|biggest|largest|smallest|highest|lowest)\s+(flows|screens|rated|rating)\s*\??$/.exec(text.trim());
  if (bare) return { metric: bare[2].startsWith('rat') ? 'rating' : (bare[2] as 'flows' | 'screens'), order: /^(?:least|fewest|smallest|lowest)$/.test(bare[1]) ? 'low' : 'high' };
  if (!/\bapps?\b/.test(text)) return null;
  if (/\b(newest|latest|most recent|recently added|new)\b/.test(text)) return { metric: 'newest', order: 'high' };
  if (/\b(oldest|earliest|first added)\b/.test(text)) return { metric: 'newest', order: 'low' };
  const high = /\b(most|biggest|largest|highest|top|best)\b/.test(text);
  const low = /\b(least|fewest|smallest|lowest)\b/.test(text);
  if (!high && !low) return null;
  const metric = /\brat(?:ed|ing|ings)\b|\bbest\b/.test(text) ? 'rating' : hasWord(text, 'flows') || hasWord(text, 'flow') ? 'flows' : 'screens';
  return { metric, order: low ? 'low' : 'high' };
}

const latestOf = (app: App) => Math.max(0, ...(app.versions ?? []).map((version) => Date.parse(version.capturedAt) || 0));

function answerRanking(all: App[], ranking: Ranking, scopeLabel: string | null, topN: number | null): NavReply {
  // Sites alone are ranked by their pages; they have no flows. Beside apps, a site (pages, no flows) is no part of
  // a screens or flows ranking, and the apps ranked are said as what they are ("Among web apps").
  const sitesOnly = all.length > 0 && all.every(isWebsite);
  const counting = ranking.metric === 'screens' || ranking.metric === 'flows';
  if (sitesOnly && ranking.metric === 'flows') return { text: 'Sites have pages and sections, not flows.', targets: [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }] };
  const list: App[] = sitesOnly || !counting ? all : all.filter((app) => !isWebsite(app as App | null));
  const label = scopeLabel && list.length < all.length ? scopeLabel.replace(/\bWebs\b/, 'web') : scopeLabel;
  const scope = label ? `Among ${label}, ` : '';
  // After "Among … apps," a leading "The" drops to lower case; a brand name keeps its capital.
  const sentence = (text: string) => (scope ? `${scope}${text.startsWith('The ') ? `the${text.slice(3)}` : text}` : text);
  if (ranking.metric === 'rating') {
    const rated = list.filter((app) => app.rating !== null).sort((a, b) => (ranking.order === 'high' ? (b.rating ?? 0) - (a.rating ?? 0) : (a.rating ?? 0) - (b.rating ?? 0)));
    if (rated.length === 0) {
      // No ratings to rank by: the biggest apps instead, said as what they are.
      const biggest = [...list].sort((a, b) => b.screenCount - a.screenCount).slice(0, 3);
      if (!biggest.length) return { text: 'No ratings have been recorded yet.', targets: QUICK_PAGES.slice(0, 3) };
      return { text: `Apps aren’t rated here yet, so I can’t say which is best. The biggest are ${listNames(biggest.map((app) => `${app.name} (${plural(app.screenCount, 'screen')})`), 3)}.`, targets: appResults(biggest), results: appResults(biggest) };
    }
    const shown = rated.slice(0, topN ?? 3).map((app) => `${app.name} (${(app.rating ?? 0).toFixed(1)})`);
    return { text: sentence(`The ${ranking.order === 'high' ? 'top rated' : 'lowest rated'} ${rated.length === 1 ? 'app is' : 'apps are'} ${listNames(shown, topN ?? 3)}.`), targets: appResults(rated.slice(0, topN ?? 3)), app: rated[0], results: appResults(rated) };
  }
  if (ranking.metric === 'newest') {
    const dated = list.filter((app) => latestOf(app) > 0).sort((a, b) => (ranking.order === 'high' ? latestOf(b) - latestOf(a) : latestOf(a) - latestOf(b)));
    if (dated.length === 0) return { text: 'No capture dates have been recorded yet.', targets: QUICK_PAGES.slice(0, 3) };
    const first = dated[0];
    const when = new Date(latestOf(first)).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    return { text: sentence(`The ${ranking.order === 'high' ? 'newest' : 'oldest'} app is ${first.name}, captured ${when}.`), targets: appResults(dated.slice(0, topN ?? 3)), app: first, results: appResults(dated) };
  }
  const count = (app: App) => (ranking.metric === 'flows' ? app.flowCount : sitesOnly ? websitePages.get(app.id) ?? app.screenCount : app.screenCount);
  const ordered = [...list].sort((a, b) => (ranking.order === 'high' ? count(b) - count(a) : count(a) - count(b)));
  const noun = sitesOnly ? 'pages' : ranking.metric;
  if (topN && topN > 1) {
    const shown = ordered.slice(0, topN).map((app) => `${app.name} (${count(app).toLocaleString()})`);
    return { text: sentence(`The top ${Math.min(topN, ordered.length)} by ${noun}: ${listNames(shown, topN)}.`), targets: appResults(ordered.slice(0, topN)), app: ordered[0], results: appResults(ordered) };
  }
  const [first, second] = ordered;
  const lead = `${first.name} has the ${ranking.order === 'high' ? 'most' : 'fewest'} ${noun} (${count(first).toLocaleString()})`;
  const tail = second ? `, followed by ${second.name} (${count(second).toLocaleString()})` : '';
  return { text: sentence(`${lead}${tail}.`), targets: appResults(ordered.slice(0, 3)), app: first, results: appResults(ordered) };
}

/**
 * Two or three apps side by side: a sentence on who has more (the card has
 * the numbers, so the sentence doesn't repeat them all), and a card with the
 * apps heading the columns and the numbers lined up under them.
 */
function compareApps(list: App[]): NavReply {
  // A site has pages, not screens or flows: it is said apart, never lined up against an app's numbers.
  const sitesHere = list.slice(0, 3).filter(isWebsite);
  if (sitesHere.length && sitesHere.length < Math.min(list.length, 3)) {
    const appsHere: App[] = list.slice(0, 3).filter((app) => !isWebsite(app as App | null));
    const siteText = sitesHere.map((app) => `${app.name} is a site, with ${plural(websitePages.get(app.id) ?? app.screenCount, 'page')}`).join('; ');
    const appText = appsHere.length >= 2 ? compareApps(appsHere).text : `${appsHere[0].name} has ${countPhrase(appsHere[0], 'screens')} and ${countPhrase(appsHere[0], 'flows')}`;
    return { text: `${siteText}. ${appText.replace(/\.$/, '')}. Sites and apps aren’t counted the same way.`, targets: appResults(list.slice(0, 3)), results: appResults(list.slice(0, 3)) };
  }
  const shown = list.slice(0, 3);
  const kind = (app: App) => INDUSTRY_LABEL[app.industry] ?? app.industry;
  const where = (app: App) => (app.platforms?.length ? app.platforms.map((platform) => PLATFORM_LABEL[platform]).join(', ') : '—');
  const rated = shown.some((app) => app.rating !== null && app.rating !== undefined);
  // The one column with the highest number, or none when it's shared.
  const leader = (values: number[]) => {
    const top = Math.max(...values);
    return values.filter((value) => value === top).length === 1 ? values.indexOf(top) : undefined;
  };
  const screens = shown.map((app) => app.screenCount);
  const flows = shown.map((app) => app.flowCount);
  const ratings = shown.map((app) => app.rating ?? -1);
  const more = shown.length === 2 ? 'more' : 'the most';
  const byScreens = leader(screens);
  const byFlows = leader(flows);
  const part = (lead: number | undefined, noun: string, values: number[]) =>
    lead === undefined ? `they're level on ${noun} (${Math.max(...values).toLocaleString()})` : `${shown[lead].name} has ${more} ${noun} (${values[lead].toLocaleString()})`;
  const text =
    byScreens !== undefined && byScreens === byFlows
      ? `${shown[byScreens].name} has ${more} screens (${screens[byScreens].toLocaleString()}) and flows (${flows[byFlows].toLocaleString()}).`
      : `${part(byScreens, 'screens', screens).replace(/^t/, 'T')}, and ${part(byFlows, 'flows', flows)}.`;
  // Apps from different sections are counted on different platforms: say so, rather than pass it off as like for like.
  const countedOn = shown.map((app) => countedPlatforms(app).map((platform) => PLATFORM_ONE[platform]).join(' and ') || '—');
  const mixed = new Set(countedOn).size > 1;
  const note = mixed ? ` Note: these count different platforms — ${listNames(shown.map((app, i) => `${app.name} on ${countedOn[i]}`), 3)}.` : '';
  return {
    text: `${text}${note}`,
    targets: appResults(shown),
    card: {
      title: 'Side by side',
      facts: [],
      columns: shown.map((app) => app.name),
      apps: shown.map((app) => ({ name: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, href: INSPIRATIONS_ROUTES.app(app), subtitle: kind(app) })),
      rows: [
        { label: 'Screens', values: screens.map((count) => count.toLocaleString()), lead: byScreens },
        { label: 'Flows', values: flows.map((count) => count.toLocaleString()), lead: byFlows },
        { label: 'Platforms', values: shown.map(where) },
        ...(mixed ? [{ label: 'Counted on', values: countedOn }] : []),
        ...(rated ? [{ label: 'Rating', values: shown.map((app) => (app.rating === null || app.rating === undefined ? '—' : `★ ${app.rating.toFixed(1)}`)), lead: leader(ratings) }] : []),
      ],
    },
    results: appResults(shown),
  };
}

const GREETING = /^((hi+|hello+|hey+|hola|yo|howdy|good (morning|afternoon|evening)|sup|namaste|vanakkam)(,?\s+(there|buddy|motvin( buddy)?|friend))?|(motvin )?buddy)\b[\s!.?]*$/i;
const THANKS = /^(?:thanks?|thank you|thx|ty|tysm|cheers|nanri|nandri|dhanyavad|dhanyawad|shukriya|gracias|merci|danke|arigato|ok(?:ay)?|cool|great|nice|awesome|perfect|got it|brilliant|wonderful|love it)\b(?:[\s,!.]+(?:so much|a lot|very much|a ton|again|buddy|mate|man|bro|you|guide|motvin|that'?s (?:great|perfect|helpful)|for (?:the )?help|for that|thanks?|thank you))*[\s!.?]*$/i;
const BYE = /^(?:(?:ok(?:ay)?|alright|cool|thanks?|thank you)[\s,!.]*)?(?:bye+|goodbye|good bye|see (?:you|ya)(?: later)?|cya|later|good night|take care|talk (?:to you )?later)[\s!.]*$/i;
const HELP = /^(?:help|what can you do|what do you do|how (?:does this|do you) work|what is this|what can i (?:find|do|see|ask)(?: here| in here| on here)?|what(?:'s| is| are)? (?:in )?here|what do you have|what have you got|how can you help(?: me)?|what can you help (?:me )?with|how do i use (?:this|you|it)|how to use (?:this|you)|what is this for|what are you for)\b[\s!.?]*$/i;
/** The guide only takes people around; it never changes the library. */
/** "what is Webs", "difference between Apps and Webs". */
// The Webs section's two lists, as its content menu opens them: web apps alone, and websites alone.
const WEB_APPS_LIST = `${INSPIRATIONS_ROUTES.apps}?show=webapps&platform=web`;
const WEBSITES_LIST = `${INSPIRATIONS_ROUTES.apps}?show=sites&platform=web`;

/** Motvin's three platforms, and the two sections they sit in. */
function aboutPlatforms(apps: App[] = []): NavReply {
  // Its examples are the library's own, biggest first, so they stay true as apps and websites come and go.
  // An app on that platform alone first (so one name never stands for two platforms), and never the same name twice.
  const used = new Set<string>();
  const biggest = (platform: Platform) => {
    const on = [...apps].filter((app) => app.platforms.includes(platform) && !used.has(app.name)).sort((a, b) => Number(b.platforms.length === 1) - Number(a.platforms.length === 1) || b.screenCount - a.screenCount);
    const name = on[0]?.name;
    if (name) used.add(name);
    return name;
  };
  const iosApp = biggest('ios');
  const webApp = biggest('webapp');
  const website = biggest('site');
  const like = (name: string | undefined) => (name ? `, like ${name}` : '');
  return {
    text: `Motvin has three platforms. Apps are iPhone apps (iOS)${like(iosApp)}. Web Apps are tools you use in a browser${like(webApp)}. Sites are websites${like(website)}, kept as whole pages and their sections. Apps has its own section at the top; Web Apps and Sites are together in Webs.`,
    targets: [
      { label: 'Apps', hint: 'iOS', href: INSPIRATIONS_ROUTES.apps },
      { label: 'Web Apps', hint: 'Webs', href: WEB_APPS_LIST },
      { label: 'Sites', hint: 'Webs', href: WEBSITES_LIST },
    ],
    kind: 'answer',
  };
}

const PLATFORM_NAME = String.raw`(?:apps?|web ?apps?|webs?|web ?sites?|ios|iphone)`;
const ABOUT_SECTIONS = new RegExp(
  [
    String.raw`\bwhat(?:'s| is| are| does)? (?:a |an |the )?(?:webs?|web ?apps?|web ?sites?)\b(?: (?:section|tab|mean|in motvin))?\s*\??$`,
    String.raw`\bdifferences? between\b.*\b${PLATFORM_NAME}\b.*\b${PLATFORM_NAME}\b`,
    String.raw`^\s*${PLATFORM_NAME}\s+(?:vs\.?|versus|or)\s+${PLATFORM_NAME}\s*\??$`,
    String.raw`\bplatforms? (?:do you|does motvin) (?:have|support|cover)\b|^\s*(?:what|which) platforms?(?: are there| do you have| does motvin have)?\s*\??$`,
  ].join('|'),
  'i',
);
/** "how do I save", "how do collections work" — how saving works, not a request to save. */
const HOW_SAVE = /\bhow (?:do|can|to|would|should) (?:i |you |we )?(?:save|bookmark|collect|add (?:\w+ )?to (?:a |my )?collection)|\bhow (?:do|does) (?:collections?|saving|bookmarks?) work\b|\bwhat (?:are|is) (?:a )?collections?\b/i;
const CLEAR_HISTORY = /^(?:please\s+)?(?:clear|delete|erase|remove|wipe)\s+(?:all\s+)?(?:my\s+)?(?:chat\s+)?(?:history|chats?|conversations?|messages)\b/i;
const CREATE_WORD = /^(?:please\s+)?(?:(?:how (?:do|can) i|can i|i want to|i wanna|i'd like to|let me|help me)\s+)?(?:upload|add|create|submit|import)\s+(?:an?\s+|my\s+|the\s+|new\s+|some\s+)*(?:apps?|videos?|screens?|screenshots?|flows?|patterns?)\b/i;
const DELETE_WORD = /^(?:please\s+)?(?:how (?:do|can) i\s+|can i\s+)?(?:delete|remove|erase|rename|edit|destroy)\b/i;
const GO_BACK = /^(?:go back|back|go to the previous page|previous page|take me back|go back please|back please)[\s!.?]*$/i;
const REOPEN = /^(?:(?:please\s+)?(?:open|show|take me to|go to|take me back to|go back to|back to)\s+(?:me\s+)?(?:the\s+)?(?:last|previous|same|that|this)(?:\s+one|\s+app)?(?:\s+again)?|(?:open|show)\s+(?:it|that|this)\s+again|back to (?:it|that|this))[\s!.?]*$/i;
/** "what about web apps", "and websites?", "only ios ones": the same question, for another platform. */
const FOLLOW_PLATFORM = /^(?:and|what about|how about|only|just|but|now|then|also)\s+(?:me\s+)?(?:the\s+)?(web ?apps?|webs|web|ios|iphone|websites?)(?:\s+(?:ones?|version|too|also))*\s*[?!.]*$/i;
/** A judgement of taste is not something the library can answer. */
const JUDGE = /\b(?:better|worse|nicer|prettier|best looking|best designed|good design|best ui|best ux|most beautiful|ugliest)\b/i;
const POPULAR = /\b(?:popular|trending|trends?|famous|viral|most used|most viewed|most downloaded|hottest)\b/i;
const UNTRACKED = /\b(?:free|paid|premium|open[- ]source)\s+apps?\b|\bhow many (?:users|downloads)\b/i;
// The apps added this week: the "New this week" page (not a sort of all apps — that's "newest apps").
const THIS_WEEK = /\b(?:new this week|this week['’]?s apps|this week|new apps|newly added apps|recently added apps|just added apps|what['’]?s new|what is new|anything new|new arrivals?)\b/i;
const RECENT = /\b(?:recently added|newly added|just added|latest|newest|what'?s new|whats new|what is new|anything new|new arrivals?|recent(?:ly)?)\b/i;
/** "what is a bottom sheet", "explain filter chips". */
const DEFINE = /^(?:what(?:'s| is| are)|whats|explain|define|meaning of)\b/i;
const ABOUT_MOTVIN = /\bwho (?:built|made|created|owns|runs|is behind) (?:motvin|this|the (?:library|site|app|website))\b|\bwhat is motvin\b/i;
const PLAN_Q = /\bis (?:this|it|motvin) (?:free|paid|cheap|expensive)\b|\bhow much does (?:this|it|motvin) cost\b|\bwhat does (?:this|it|motvin) cost\b/i;
const RECOMMEND = /\b(?:recommend|suggest)\b|\bwhat should i (?:look|see|start|check)|\bwhere (?:do|should) i (?:start|begin)\b|\bi(?:'m| am) (?:lost|stuck|not sure)\b|\bi don'?t know\b|\bshow (?:me )?everything\b|\bnot sure what\b/i;
/** Words that are not a subject, so they never turn "Zomato" into a search. */
const NOT_A_SUBJECT = new Set(['everything', 'anything', 'something', 'about', 'please', 'thanks', 'thank', 'kindly', 'quickly', 'today', 'again', 'there', 'where', 'which', 'these', 'those', 'would', 'could', 'should', 'want', 'need', 'like', 'give', 'bring', 'take', 'have', 'with', 'that', 'this', 'from', 'into', 'just', 'only', 'also', 'then', 'them', 'some', 'your', 'show', 'check', 'looks', 'looking', 'display', 'details', 'information', 'more', 'tell', 'screens', 'screen', 'pages', 'flows', 'while', 'inside', 'within']);
const WHO = /\b(who are you|who made you|who built you|what are you|what(?:'?s| is) your name|are you (?:an? )?(?:ai|bot|robot|human|person|real|chat ?gpt|gpt|claude|gemini|copilot|siri|alexa))\b/i;
/** A filler reply with nothing to look up — "lol", "hmm", "ok", "yes" — gets a friendly nudge, not "couldn't find". */
const FILLER_REPLY = /^(?:lo+l+|lmao|ha(?:ha)+h?|he(?:he)+|hm+|k+|ok+|okay|oh+|ah+|yes|yeah|yep|yup|no|nope|nah|wow+|hmm+ok|sure|fine|alright)[\s!.?]*$/i;
/** Only emoji (or other pictographs): read as a hello. */
/** A wish for ideas with nothing specific named: "inspire me", "something cool", "where do I start". */
const INSPIRE = /\b(?:inspir(?:e|ed|ation|ations|ing)|something (?:cool|nice|new|good|interesting|fun|beautiful)|surprise me|anything|i'?m bored|where (?:do|should) i (?:start|begin)|random(?:ly)?|show me something|ideas?)\b/i;
/** Unhappy with Buddy ("you are useless", "this is not helpful", "doesn't work"): a kind reply, not a search. */
const UNHAPPY = /^(?:(?:you(?:'re| are)?|u r|this(?: is)?|buddy(?: is)?|that(?:'s| is| was)?|it(?:'s| is)?)\s+(?:so\s+|really\s+|very\s+|totally\s+)?(?:useless|stupid|dumb|bad|terrible|rubbish|annoying|wrong|not (?:helpful|useful|working|good))\b|.*\b(?:you suck|this sucks|hate you|not helpful|doesn'?t (?:help|work)|not working)\b)/i;
const ONLY_EMOJI = /^[\p{Extended_Pictographic}\u200d\ufe0f\s]+$/u;
const HOW_ARE_YOU = /\bhow are you\b/i;
const APOLOGY = /^(?:sorry|my bad|oops)[\s!.]*$/i;
// "it", "this", "the one you showed me": the app from the last answer.
const REFERS_BACK = /\b(it|its|it's|this|this app|that app|this one|that one|same app|the one|you (?:just )?(?:showed|opened|gave|mentioned)|showed me|last (?:one|app)|previous (?:one|app))\b/i;
/** A question that wants yes or no. */
const YES_NO = /^(?:is|are|does|do|did|was|were|can|could|will|would|has|have|am|isn't|aren't|doesn't|don't)\b/i;
/** A question that wants a fact. */
// "how about Zomato" is a change of subject, not a question.
const WH = /^(?:what|which|where|when|who|why|what's|where's|who's|how(?!\s+about\b))\b/i;
/** "tell me about Swiggy", "what is Zomato" — a request for the app's details, not its page. */
const INFO = /\b(?:tell me (?:more )?about|what is|what's|whats|who is|info(?:rmation)? (?:on|about)|details (?:on|about|of)|describe|overview of|more about|know about)\b|\b(?:details|info|information|overview|summary)\s*\??$/i;
/** Asks where an app runs, without naming a platform. */
const PLATFORM_ASKED = /\b(?:platforms?|runs? on|running on|available on|works? on|supported on|support|device|mobile|phone|where (?:does|do|is|can) (?:it|this|that|\w+) (?:run|work|live))\b/i;
/** Asks what kind of app it is, without naming a kind. */
const INDUSTRY_ASKED = /\b(?:kind of app|type of app|sort of app|category|categories|industry|what kind|what type|what sort)\b/i;
const RATING_ASKED = /\b(?:rating|ratings|rated|stars?|score|how good|any good|good)\b/i;
const MOBILE = /\b(?:mobile|phone|phones|smartphone)\b/i;
/** Words that widen a question from the app being talked about to the whole library. */
const LIBRARY_SCOPE = /\b(?:library|in total|total|overall|altogether|all (?:the )?apps|every app|across|everything|whole)\b/i;
/** "which apps use …", "where is … used", "who has …": asks for the apps that have a thing. */
const WHICH_APPS = /\b(?:which|what|who)\s+(?:apps?|ones?)\b|\bwhere (?:is|are) .+? used\b|\bapps? (?:that|which|with|using|have|has)\b/i;
/** "save Swiggy", "add this to my collection", "bookmark it". */
const SAVE = /\b(?:save|bookmark|add (?:\w+ )?to (?:my )?(?:collection|board|saved)|keep)\b/i;
/** "copy link", "share this", "link to Swiggy". */
const COPY = /\b(?:copy (?:the )?(?:link|url)|share (?:this|it|\w+)|get (?:the |a )?link|link to)\b/i;
/** "apps like Swiggy", "similar to Zomato", "alternatives to …". */
const SIMILAR = /\b(?:similar(?: to)?|like|alternatives? (?:to|for)|competitors? (?:of|to)|comparable (?:to|with))\b/i;
const WHERE_AM_I = /\b(?:which app is this|what app is this|where am i|what page is this|what is this page|what am i looking at)\b/i;
const RANDOM = /\b(?:random|surprise me|anything|pick one for me|something)\b/i;

const ON_LABEL: Record<Platform, string> = { ios: 'iOS', webapp: 'Web Apps', site: 'Sites' };
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const platformList = (app: App) => listNames((app.platforms ?? []).map((platform) => ON_LABEL[platform]));

/** The text with the named apps taken out, so "Apple Music" is never read as "on iOS". */
function withoutNames(text: string, named: App[]): string {
  let rest = text;
  for (const app of named) {
    rest = rest.replace(new RegExp(escape(app.name.toLowerCase()), 'g'), ' ');
    const first = app.name.toLowerCase().split(/\s+/)[0];
    if (first.length >= 4) rest = rest.replace(new RegExp(`\\b${escape(first)}\\b`, 'g'), ' ');
  }
  return rest;
}

/** One app's details in a sentence and a card, for "tell me about Swiggy" and for questions that need no page. */
function describeApp(app: App): NavReply {
  const kind = INDUSTRY_LABEL[app.industry] ?? app.industry;
  const where = app.platforms?.length ? ` on ${platformList(app)}` : '';
  // A website: "a SaaS website, with 2 pages" — never an app with screens and flows.
  const site = Boolean(app.platforms?.length && app.platforms.every((platform) => platform === 'site'));
  return {
    text: site
      ? `${app.name} is ${article(kind)} ${kind} site, with ${countPhrase(app, 'screens')}.`
      : `${app.name} is ${article(kind)} ${kind} app${where}, with ${countPhrase(app, 'screens')} and ${countPhrase(app, 'flows')}.`,
    targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)],
    card: {
      title: app.name,
      iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
      facts: site
        ? [kind, 'Site', countPhrase(app, 'screens')]
        : [kind, ...(app.platforms?.length ? [app.platforms.map((platform) => PLATFORM_LABEL[platform]).join(' · ')] : []), countPhrase(app, 'screens'), countPhrase(app, 'flows')],
      href: INSPIRATIONS_ROUTES.app(app),
    },
    app,
  };
}

/** The app the visitor is looking at, read off the address. */
function appOnPage(context: NavContext | undefined, index: LibraryIndex): App | null {
  const match = /^\/inspirations\/app\/([^/?#]+)/.exec(context?.page?.pathname ?? '');
  return match ? (index.appBySlug.get(decodeURIComponent(match[1])) ?? null) : null;
}

/** The apps the last answer listed, in the order they were shown. */
function listedApps(context: NavContext | undefined, index: LibraryIndex): App[] {
  return (context?.results ?? [])
    .map((target) => /^\/inspirations\/app\/([^/?#]+)/.exec(target.href)?.[1])
    .map((slug) => (slug ? index.appBySlug.get(decodeURIComponent(slug)) : undefined))
    .filter((app): app is App => Boolean(app));
}

/**
 * A question about one app's facts — where it runs, what kind it is, how it is
 * rated, whether it has flows or a certain screen — answered from the app's own
 * record. Null when the message is not that kind of question.
 */
async function answerAboutApp(app: App, text: string, question: boolean, yesNo: boolean, section: Section | null, screenType: TypeHit | null, asksCount: boolean, platforms: readonly Platform[] | null): Promise<NavReply | null> {
  const rest = withoutNames(text, [app]);
  // "open Claude iOS": the platform word left over once the app is named is the platform asked for.
  const platformsAsked = findPlatforms(rest).length ? findPlatforms(rest) : findPlatforms(clean(rest));
  const wantsMobile = MOBILE.test(rest) && platformsAsked.length === 0;
  const kind = INDUSTRY_LABEL[app.industry] ?? app.industry;

  // Where it runs.
  if (platformsAsked.length > 0 || wantsMobile || PLATFORM_ASKED.test(rest)) {
    if (!app.platforms?.length) return { text: `${app.name} doesn’t list a platform yet.`, targets: [appTarget(app)], app };
    const onAll = `${app.name} is on ${platformList(app)}.`;
    if (wantsMobile) {
      const mobile = app.platforms.some((platform) => !isDesktopPlatform(platform));
      return { text: mobile ? `Yes — ${onAll}` : `No — ${app.name} isn’t on mobile. It’s on ${platformList(app)}.`, targets: [appTarget(app)], app };
    }
    if (platformsAsked.length === 1) {
      // "the web version of Claude": a web app and a website are both the web, so either one answers it.
      // "Website" asked by name stays a website.
      const loose = platformsAsked[0] === 'site' && !/\b(?:web ?sites?|sites?)\b/.test(rest);
      const asked = app.platforms.includes(platformsAsked[0]) ? platformsAsked[0] : (loose && app.platforms.find(isDesktopPlatform)) || platformsAsked[0];
      const on = app.platforms.includes(asked);
      // "canva login" then "web app": its login screens there, not where Canva runs.
      if (on && !question && (screenType || section)) return null;
      const text = on ? (yesNo ? `Yes — ${onAll}` : onAll) : `${yesNo ? 'No — ' : ''}${app.name} ${asked === 'site' ? (loose ? 'has no web app or site here' : 'has no site here') : `isn’t on ${ON_LABEL[asked]}`}. It’s on ${platformList(app)}.`;
      // "show Swiggy on iOS" still opens Swiggy when it is there; a question never navigates.
      // It opens on that platform: "Claude on web" from iOS goes to Claude's web screens.
      return { text: !question && on && app.platforms.length > 1 ? `Opening ${app.name} on ${PLATFORM_ONE[asked]}.` : text, targets: [appTarget(app, undefined, on ? asked : undefined), ...followUps(app, null).slice(0, 2)], go: !question && on ? appTarget(app, undefined, asked) : undefined, app };
    }
    return { text: onAll, targets: [appTarget(app), ...followUps(app, null).slice(0, 2)], app };
  }

  // What kind of app it is.
  const industryAsked = question || /\bapps?\b/.test(rest) ? findIndustry(rest) : null;
  if (industryAsked || INDUSTRY_ASKED.test(rest)) {
    const is = `${app.name} is ${article(kind)} ${kind} app.`;
    if (industryAsked && industryAsked !== app.industry) return { text: `No — ${app.name} is ${article(kind)} ${kind} app, not ${INDUSTRY_LABEL[industryAsked]}.`, targets: [appTarget(app)], app };
    return { text: yesNo ? `Yes — ${is}` : is, targets: [appTarget(app), ...followUps(app, null).slice(0, 2)], app };
  }

  if (RATING_ASKED.test(rest)) {
    if (app.rating === null || app.rating === undefined) return { text: `No one has rated ${app.name} yet.`, targets: [appTarget(app)], app };
    const from = app.ratingCount ? ` from ${plural(app.ratingCount, 'rating')}` : '';
    return { text: `${app.name} is rated ${app.rating.toFixed(1)} out of 5${from}.`, targets: [appTarget(app)], app };
  }

  if (INFO.test(rest)) return describeApp(app);

  // "Does it have flows?", "does Swiggy have a login screen?"
  if (yesNo && !asksCount) {
    if (screenType) {
      const total = await countScreens({ type: screenType.key }, app, platforms);
      if (total !== null) {
        const see: NavTarget = { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: appSearch(app, `${app.name} ${screenType.label.toLowerCase()}`, platforms) };
        return total > 0
          ? { text: `Yes — ${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`, targets: [see, ...followUps(app, 'count').slice(0, 2)], app }
          : { text: `No — ${app.name} has no ${screenType.label.toLowerCase()} screens.`, targets: followUps(app, null), app };
      }
    }
    if (section?.tab === 'flows') {
      return app.flowCount > 0
        ? { text: `Yes — ${app.name} has ${countPhrase(app, 'flows')}.`, targets: [{ ...appTarget(app, 'flows'), label: `${app.name} flows` }, ...followUps(app, 'flows').slice(0, 2)], app }
        : { text: `No — ${app.name} has no flows yet.`, targets: followUps(app, 'flows'), app };
    }
    if (section?.tab === 'screens') return { text: `Yes — ${app.name} has ${countPhrase(app, 'screens')}.`, targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)], app };
  }
  return null;
}

/** Marks a reply with what sort of thing it was, for the log and the UI. */
function classify(reply: NavReply): NavReply {
  if (reply.kind) return reply;
  if (reply.error) return { ...reply, kind: 'error' };
  if (reply.action) return { ...reply, kind: 'action' };
  if (reply.go) return { ...reply, kind: 'nav' };
  if (/^(Which app do you mean\?|Which one\?|A few (?:matches|flows match) — which one\?|Did you mean this\?|.* — which one\?)$/.test(reply.text)) return { ...reply, kind: 'clarify' };
  return { ...reply, kind: 'answer' };
}

export async function resolveNavigation(raw: string, incoming?: NavContext): Promise<NavReply> {
  // Short slips the spelling fixer leaves alone (it only guesses at words of five letters or more): the few
  // that can only mean one thing — "logn" is login, "webb" is web, "aps" is apps.
  let asked = stripChatter(raw.trim().slice(0, 240))
    .replace(/\b(?:logn|lgin|lgon|loign)\b/gi, 'login')
    .replace(/\b(?:webb|wbe)\b/gi, 'web')
    .replace(/\baps\b/gi, 'apps');
  // "what is the difference between web apps and webs": the three platforms, before any is read as a place.
  if (ABOUT_SECTIONS.test(asked)) return classify({ ...aboutPlatforms((await loadIndex().catch(() => null))?.apps ?? []), asked });
  // How people say pricing and full pages: "price page", "prices", "plans page" are the pricing screens or pages
  // (the Price UI element only when its label or tag is meant); "full page" is a website's whole page.
  asked = asked
    .replace(/\bprices?\b(?!\s*(?:tags?|labels?|elements?|components?|texts?|fields?))/gi, 'pricing')
    .replace(/\b(?:plans?|subscriptions?)\s+(?=pages?\b|screens?\b)/gi, 'pricing ')
    .replace(/\bfull ?pages?\b/gi, 'site pages');
  // "section", "pages", "screens": the last question again, as that kind — "pricing page web" then "sections"
  // is the websites' pricing sections; then "screens", the Web App pricing screens.
  const kindMove = /^\s*(?:(?:and|or|what about|how about|now|then|only|just|show(?: me)?|the|in|as|its)\s+)*(sections?|site pages|pages?|screens?)\s*\??\s*$/i.exec(asked);
  if (incoming?.previous && kindMove) {
    const kind = kindMove[1].toLowerCase();
    const topic = incoming.previous.replace(/\b(?:full ?pages?|(?:web|site) pages|pages?|sections?|screens?)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const as = kind.startsWith('section') ? 'sections' : kind.startsWith('screen') ? 'screens' : 'site pages';
    // Pages and sections are websites' alone: an earlier "web app" or "ios" goes; screens keep their platform.
    const bare = as === 'screens' ? topic : withoutPlatform(topic);
    // A topic that is no such kind ("hero" as a page, "login" as a section) opens all of that kind instead.
    const lowTopic = bare.toLowerCase();
    const fits = as === 'sections' ? Boolean(findSiteSectionType(lowTopic)) : as === 'site pages' ? Boolean(findSitePageType(lowTopic)) : true;
    if (bare) asked = fits ? `${bare} ${as}` : as;
  }
  // "for web", "on ios", "what about websites": the last question again, on that platform. With an app being
  // talked about and nothing else asked before, it is about that app instead ("on ios?" — is it on iOS?).
  const previous = incoming?.previous ?? null;
  const aboutTheAppOnly = (text: string) =>
    Boolean(incoming?.app) && !text.toLowerCase().replace(incoming!.app!.name.toLowerCase(), ' ').replace(/\b(?:open|show|go to|take me to|tell me about|about|what is|me|the|app|please)\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  if (previous && isPlatformMove(asked) && !aboutTheAppOnly(withoutPlatform(previous))) asked = `${withoutPlatform(previous)} ${asked}`;
  // Plain "app" after a question moves it to Apps (iOS), as "web" and "site" do: "form page", then "app".
  else if (previous && /^\s*(?:(?:and|or|what about|how about|now|then|only|just|for|on|in)\s+)*apps?\s*[?.!]?\s*$/i.test(asked) && withoutPlatform(previous).trim() && !aboutTheAppOnly(withoutPlatform(previous))) asked = `${withoutPlatform(previous)} on ios`;
  const read = readPlatformAsk(asked, { asksCount: /\bhow (?:many|much)\b|\b(?:count|number of|total)\b/.test(asked.toLowerCase()) });
  // Only a platform ("i want web", "give me ios"), with no app being talked about: that platform's apps.
  const BARE: Record<PlatformAsk, string> = { ios: 'ios apps', webapp: 'web apps', webs: 'web', website: 'websites' };
  const listAsked = /\b(?:show|list|open|give|browse|see|view|all|which|any)\b/i.test(asked) && !read.rest.replace(/\b(?:show|list|open|give|browse|see|view|all|which|any|me|the|please|i|want|need)\b/g, ' ').trim();
  if (read.ask && read.text === asked && ((!incoming?.app && isPlatformMove(asked)) || listAsked)) read.text = BARE[read.ask];
  // A list asked for ("show websites") is that list, not a question about the app talked about before.
  // Plain "app" / "apps" ("app", "show apps", "i want apps") is Apps, iPhone apps — wherever the visitor is.
  const bareApps = /^\s*(?:(?:show|list|open|give|browse|see|view|all|i want|i need|want|need|me|the|please|go to|take me to)\s+)*apps?\s*[?.!]?\s*$/i.test(asked);
  const context: NavContext = { app: listAsked || bareApps ? null : incoming?.app ?? null, results: incoming?.results ?? null, page: incoming?.page ?? null, previous: incoming?.previous ?? null, ask: bareApps ? 'ios' : read.ask };
  const answered = await resolveParts(read.text, context);
  return { ...answered, asked };
}

async function resolveParts(trimmed: string, context: NavContext): Promise<NavReply> {
  const parts = splitIntents(trimmed);
  if (parts.length === 1) return classify(await resolveWithNotes(parts[0], context));

  // "open zomato and show its flows": each part in turn, each knowing what the one before found.
  let working: NavContext = { ...context };
  const texts: string[] = [];
  let last: NavReply | null = null;
  let go: NavTarget | undefined;
  for (const part of parts) {
    const reply = classify(await resolveWithNotes(part, working));
    texts.push(reply.text);
    if (reply.app) working = { ...working, app: reply.app, results: reply.results ?? null };
    if (reply.results) working = { ...working, results: reply.results };
    if (reply.go) go = reply.go;
    last = reply;
  }
  if (!last) return classify(await resolveWithNotes(trimmed, context));
  return classify({ ...last, text: texts.join(' '), go, kind: undefined });
}

/**
 * Every link an answer gives stays in the visitor's section. On a Webs page, list pages carry Webs'
 * `?platform=web` and an app on several platforms opens on its web one; iOS is the default and needs
 * nothing. A platform the visitor names wins (its links say which), and so does a link that already does.
 */
async function keepSection(reply: NavReply, text: string, context: NavContext | undefined): Promise<NavReply> {
  // A platform the message named is where its links go, not the section on show: iOS (plain "apps" too) as they
  // are; web, web apps or websites in Webs, so a link that names no platform ("nav bars") still opens Webs'.
  if (context?.ask === 'ios') return reply;
  const asksWebs = Boolean(context?.ask);
  if (!context?.page && !asksWebs) return reply;
  const index = await loadIndex();
  // An app's own page is in that app's section, whatever its address says: Canva's page (no ?platform) is Webs.
  const pageSlug = /^\/inspirations\/app\/([^/?#]+)/.exec(context?.page?.pathname ?? '')?.[1];
  const pageApp = pageSlug ? index.appBySlug.get(decodeURIComponent(pageSlug)) : undefined;
  const params = new URLSearchParams(context?.page?.search ?? '');
  const pageOnlyWebs = Boolean(pageApp && !pageApp.platforms?.includes('ios') && !params.get('platform'));
  const section = asksWebs || pageOnlyWebs ? [...WEBS_PLATFORMS] : browsedPlatforms(params);
  if (!asksWebs && (section.includes('ios') || findPlatforms(applySynonyms(text.toLowerCase())).length > 0)) return reply;
  const fix = (href: string): string => {
    if (!href.startsWith('/inspirations') || /[?&]platform=/.test(href)) return href;
    const [path, query = ''] = href.split('?');
    const sp = new URLSearchParams(query);
    const slug = /^\/inspirations\/app\/([^/]+)$/.exec(path)?.[1];
    if (slug) {
      const app = index.appBySlug.get(decodeURIComponent(slug));
      const on = app?.platforms?.find((platform) => section.includes(platform));
      if (!app || !on || app.platforms.length < 2) return href;
      sp.set('platform', on);
    } else if (/^\/inspirations(?:\/(?:apps|new|screens|screenshots|flows|ui-elements|patterns|search))?\/?$/.test(path)) {
      sp.set('platform', 'web');
    } else {
      return href;
    }
    return `${path}?${sp.toString()}`;
  };
  const target = (entry: NavTarget): NavTarget => ({ ...entry, href: fix(entry.href) });
  // A copied link is a full address; its path is fixed like any other.
  const copyHref = (href: string): string => {
    const at = href.indexOf('/inspirations');
    return at < 0 ? href : `${href.slice(0, at)}${fix(href.slice(at))}`;
  };
  return {
    ...reply,
    targets: reply.targets.map(target),
    go: reply.go && target(reply.go),
    results: reply.results?.map(target),
    // "Copy the link to Claude" in Webs copies its web page's link.
    action: reply.action?.kind === 'copy' ? { ...reply.action, href: copyHref(reply.action.href) } : reply.action,
    card: reply.card && { ...reply.card, href: reply.card.href && fix(reply.card.href), apps: reply.card.apps?.map((entry) => ({ ...entry, href: fix(entry.href) })) },
  };
}

/**
 * Websites are called Sites everywhere in Motvin ("website apps" are sites; Webs' apps are web apps and sites): said
 * that way in every reply, whatever wording a branch used.
 */
function websiteWords(reply: NavReply): NavReply {
  const say = (text: string) =>
    text
      .replace(/\bwebsite apps\b/g, 'sites')
      .replace(/\bwebsite app\b/g, 'site')
      .replace(/\bWebsite apps\b/g, 'Sites')
      .replace(/\bWebs apps\b/g, 'web apps and sites')
      .replace(/\bWebsites\b/g, 'Sites')
      .replace(/\bwebsites\b/g, 'sites')
      .replace(/\bWebsite\b/g, 'Site')
      .replace(/\bwebsite\b/g, 'site');
  return { ...reply, text: say(reply.text), targets: reply.targets.map((target) => ({ ...target, label: say(target.label) })), go: reply.go && { ...reply.go, label: say(reply.go.label) } };
}

async function resolveWithNotes(text: string, context: NavContext | undefined): Promise<NavReply> {
  const notes: string[] = [];
  const reply = websiteWords(await keepSection(await resolveInner(text, context, notes), text, context));
  // Say so when a misspelling was read as something, but only if the answer acted on it.
  if (notes.length > 0 && !reply.error && (reply.go || reply.card || reply.app)) {
    return { ...reply, text: `${reply.text} (I read ${listNames(notes, 3)}.)` };
  }
  return reply;
}

async function resolveInner(raw: string, context: NavContext | undefined, notes: string[]): Promise<NavReply> {
  const original = stripChatter(raw.trim());
  if (APOLOGY.test(original)) return { text: 'No problem at all. Where would you like to go?', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (GREETING.test(original)) return { text: pick(['Hi! Where would you like to go? Tell me an app or a page, or pick one below.', 'Hello! What are you looking for today? An app, a page, or a type of screen?', 'Hey there! Say an app or page and I’ll take you straight to it.']), targets: QUICK_PAGES, kind: 'smalltalk' };
  if (UNHAPPY.test(original)) return { text: 'Sorry about that! Tell me what you’re looking for, like an app name, “login screens” or “onboarding flows”, and I’ll take you straight there.', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (ONLY_EMOJI.test(original)) return { text: pick(['👋 Hi! Tell me an app, a page or a type of screen, and I’ll take you there.', '😊 Hello! What would you like to explore? An app, a page, or a type of screen.']), targets: QUICK_PAGES, kind: 'smalltalk' };
  if (FILLER_REPLY.test(original)) return { text: pick(['Sure! What would you like to explore next? An app, a page, or a type of screen.', 'Got it. Where to next? Try an app name or something like “login screens”.']), targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (THANKS.test(original)) return { text: pick(['Anytime. Tell me where to go next.', 'Happy to help. Where to next?', 'You’re welcome. Anything else you’d like to see?']), targets: [], kind: 'smalltalk' };
  if (HOW_ARE_YOU.test(original)) return { text: 'Doing great, thanks for asking! Where would you like to go?', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (WHO.test(original)) return { text: 'I’m Motvin Buddy, Motvin’s own guide. I help you find apps, screens and flows, and answer quick questions like how many screens an app has.', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (ABOUT_MOTVIN.test(original)) return { text: 'Motvin is a library of real app screens, flows and UI patterns to get inspired by. I’m Motvin Buddy: I take you to the right app or page.', targets: QUICK_PAGES.slice(0, 4), kind: 'answer' };
  if (PLAN_Q.test(original)) return { text: 'I don’t know about plans or prices. I only take you around the library. Try asking me for an app or a page.', targets: QUICK_PAGES.slice(0, 4), kind: 'answer' };
  if (BYE.test(original)) return { text: pick(['Bye! I’m here whenever you need a hand.', 'See you! Come back any time.', 'Take care! Just open me when you need to find something.']), targets: [], kind: 'smalltalk' };
  if (GO_BACK.test(original)) return { text: 'Going back.', targets: [], go: { label: 'Back', hint: 'Back', href: '__back__' } };
  if (ABOUT_SECTIONS.test(original)) return aboutPlatforms((await loadIndex().catch(() => null))?.apps ?? []);
  if (HOW_SAVE.test(original)) {
    return {
      text: 'Tick the circle on screens and choose Save, or use Save on an open screen or flow. What you save goes into Collections (the bookmark at the top).',
      targets: [PAGES.find((entry) => entry.target.label === 'Collections')!.target],
      kind: 'answer',
    };
  }
  if (CLEAR_HISTORY.test(original)) return { text: 'You can delete a chat from Chat history with its bin icon, or choose Clear all there. Your chats stay in this browser only.', targets: [], kind: 'answer' };
  if (DELETE_WORD.test(original) || CREATE_WORD.test(original)) {
    return { text: 'I can only take you around Motvin. I can’t add, change or delete anything in the library. Admins manage apps and uploads from the admin tools.', targets: QUICK_PAGES.slice(0, 4), kind: 'answer' };
  }
  // "what is this" while looking at an app or a pattern asks about that, not for help.
  const lookingAtSomething = Boolean(context?.app) || /^\/inspirations\/(?:app|pattern)\//.test(context?.page?.pathname ?? '');
  if (HELP.test(original) && !(lookingAtSomething && /^what is this\??$/i.test(original))) {
    // The examples name real apps of the section being browsed, never apps the library doesn't have.
    const helpSection = browsedPlatforms(new URLSearchParams(context?.page?.search ?? ''));
    const [first, second] = (await loadIndex()).apps
      .filter((app) => app.platforms.some((platform) => helpSection.includes(platform)))
      .sort((a, b) => countsOn(b, helpSection).screens - countsOn(a, helpSection).screens);
    const examples = first
      ? `Try “how many screens does ${first.name} have?”, “open ${(second ?? first).name}”, “${first.name} flows”, “login screens” or “empty states”.`
      : 'Try “login screens”, “empty states” or “bottom sheets”.';
    return { text: `I take you around Motvin and answer quick questions about its apps, screens and flows. ${examples}`, targets: QUICK_PAGES, kind: 'smalltalk' };
  }
  const query = clean(original);
  const page = pageFor(query);
  const isAppsPage = page?.target.href === QUICK_PAGES[0].href;
  // "i want app" says nothing but that they want apps; like "apps" itself, it is answered once the apps are known.
  const wantsApps = isAppsPage || (!query && /\bapps?\b/i.test(original));
  if (!query && !wantsApps) return { text: 'Tell me where to go — an app, a page like Flows or Screens, or something to search for.', targets: QUICK_PAGES, kind: 'fallback' };

  if (page && !isAppsPage) return { text: pick([`Opening ${page.target.label}.`, `Taking you to ${page.target.label}.`, `Here’s the ${page.target.label} page.`]), targets: [], go: page.target };
  // "flows on web", "ios patterns": a page on a platform. iOS is the pages' default; Webs gets `web` from keepSection;
  // Web Apps alone says so. Sites have no screens or flows, so "flows on sites" goes on to be answered below.
  // Screenshots on a platform ("screenshots for web") are answered below, as the screenshots on that platform.
  const asksStoreShots = STORE_SHOTS.test(original.toLowerCase()) || /\bscreen ?shots?\b/i.test(original);
  const platformPage = !page && context?.ask && !asksStoreShots ? pageFor(clean(withoutPlatform(original).replace(/^(?:in|on|for|from|to)\s+(?:the\s+)?/, ''))) : null;
  if (platformPage && platformPage.target.href !== QUICK_PAGES[0].href) {
    if (context!.ask === 'website') {
      const onWebs = { ...platformPage.target, label: `${platformPage.target.label} on Webs`, href: `${platformPage.target.href}${platformPage.target.href.includes('?') ? '&' : '?'}platform=web` };
      return { text: `Sites have pages and sections, not ${platformPage.target.label.replace(/^(?!UI)\w/, (c) => c.toLowerCase())}. Web Apps have them.`, targets: [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }, onWebs] };
    }
    const where = context!.ask === 'ios' ? 'iOS' : context!.ask === 'webapp' ? 'Web Apps' : 'Webs';
    const href = context!.ask === 'webapp' ? `${platformPage.target.href}${platformPage.target.href.includes('?') ? '&' : '?'}platform=webapp` : platformPage.target.href;
    return { text: `Showing ${platformPage.target.label} on ${where}.`, targets: [], go: { ...platformPage.target, href } };
  }
  // A style on its own: "dark", "minimal".
  const bareStyle = /^(dark|light|minimal|bold|playful|corporate|editorial|experimental)(?: (?:mode|theme|ui|style))?$/.exec(query);
  if (bareStyle) return { text: `Showing ${bareStyle[1]} screens.`, targets: [], go: { label: `${bareStyle[1][0].toUpperCase()}${bareStyle[1].slice(1)} screens`, hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?style=${bareStyle[1]}` } };

  const fullIndex = await loadIndex();
  const { patterns: allPatterns, meta } = fullIndex;
  const everyApp = fullIndex.apps.map(withoutWebsitePages);
  const unreachable = !fullIndex.reachable;
  const elementKinds = fullIndex.elements.map((element) => element.kind);
  const flowCategories = meta?.taxonomy.flowCategories ?? [];

  // Read the question the way it was meant: fix confident misspellings, then fold
  // everyday wording ("sign in", "buy") into the library's own words.
  const typed = original.toLowerCase();
  const fixed = unreachable ? { text: typed, corrections: [] } : correctText(typed, fullIndex.vocabulary);
  const shownAs = new Map<string, string>();
  for (const app of everyApp) words(app.name).forEach((word) => shownAs.set(word, app.name.split(/\s+/).find((part) => part.toLowerCase() === word) ?? word));
  fixed.corrections.forEach((change) => notes.push(`“${change.from}” as “${shownAs.get(change.to) ?? change.to}”`));
  const lowerAll = applySynonyms(fixed.text);

  // What is ruled out — "except Swiggy", "not Zomato" — is read first and taken out of the sentence.
  const negatedPhrases = findNegations(lowerAll);
  const negatedApps = negatedPhrases.flatMap((phrase) => findApps(phrase, everyApp));
  const negatedPlatforms = negatedPhrases.flatMap((phrase) => findPlatforms(phrase));
  const lower = negatedPhrases.length ? withoutNegations(lowerAll) : lowerAll;
  // The section the visitor is in (Webs on a web page, iOS otherwise): unless they name a platform, lists,
  // rankings and suggestions are of that section's apps only — never iOS apps offered on a web page. An app
  // named by name is still found wherever it is ("open Spotify" from Webs still opens Spotify).
  // An app's own page is in that app's section, whatever its address says: Remote's page (no ?platform) is Webs.
  const pageSlug = /^\/inspirations\/app\/([^/?#]+)/.exec(context?.page?.pathname ?? '')?.[1];
  const appOfPage = pageSlug ? everyApp.find((app) => app.slug === decodeURIComponent(pageSlug)) : undefined;
  const pageOnlyWebs = Boolean(appOfPage && !appOfPage.platforms.includes('ios') && !new URLSearchParams(context?.page?.search ?? '').get('platform'));
  const sectionPlatforms = context?.page ? (pageOnlyWebs ? (['webapp', 'site'] as Platform[]) : browsedPlatforms(new URLSearchParams(context.page.search ?? ''))) : null;
  const namesPlatform = findPlatforms(lower).length > 0 || negatedPlatforms.length > 0;
  // A platform the message names is where it looks: iOS; Web Apps; Webs (web apps and websites); websites.
  const ASKED_SCOPE: Record<PlatformAsk, Platform[]> = { ios: ['ios'], webapp: ['webapp'], webs: ['webapp', 'site'], website: ['site'] };
  const scope = context?.ask ? ASKED_SCOPE[context.ask] : sectionPlatforms && !namesPlatform ? sectionPlatforms : null;
  // Each app counted on the section only: Claude in Webs has its web screens, so a ranking or a total is
  // never iOS and web added together. (Copies — compare apps by id, not by identity.)
  const apps = scope
    ? everyApp.filter((app) => app.platforms?.some((platform) => scope.includes(platform))).map((app) => {
        const here = countsOn(app, scope);
        const platformCounts = app.platformCounts && Object.fromEntries(Object.entries(app.platformCounts).filter(([platform]) => scope.includes(platform as Platform)));
        // Its uploads on the section ("newest app" in iOS is by iOS upload dates); an older manifest keeps them all.
        const versions = (app.versions ?? []).filter((version) => !version.platforms || version.platforms.some((platform) => scope.includes(platform)));
        return { ...app, screenCount: here.screens, flowCount: here.flows, platformCounts, versions };
      })
    : everyApp;
  const scopedById = new Map(apps.map((app) => [app.id, app]));
  // The section's flows, and its UI element counts: an app named from outside the section keeps all of its flows.
  const namedOutside = new Set(findApps(lower, everyApp).filter((app) => !scopedById.has(app.id)).map((app) => app.id));
  const index: LibraryIndex = scope ? { ...fullIndex, flows: fullIndex.flows.filter((flow) => scope.includes(flow.platform) || namedOutside.has(flow.appId)) } : fullIndex;
  const elements = scope ? await inspirationsApi.listElements([...scope]).catch(() => fullIndex.elements) : fullIndex.elements;
  // Each pattern with only the section's screens (a screen id reads "<app>-<platform>-…"), so its screen count
  // and the apps it's "in" are never iOS and web added together.
  const patterns = scope
    ? allPatterns.map((pattern) => ({ ...pattern, screenIds: (pattern.screenIds ?? []).filter((id) => scope.some((platform) => everyApp.some((app) => id.startsWith(`${app.id}-${platform}-`)))) }))
    : allPatterns;
  // An app's own part of the section, for counting its screens; an app not in the section counts whole.
  const scopeOf = (app: App | null) => (scope && (!app || app.platforms?.some((platform) => scope.includes(platform))) ? scope : null);
  const negatedIds = new Set(negatedApps.map((app) => app.id));
  const working = lower;

  // A misspelt page name ("flwos") is still a page.
  if (fixed.corrections.length > 0) {
    const fixedPage = pageFor(clean(working));
    if (fixedPage) return { text: `Opening ${fixedPage.target.label}.`, targets: [], go: fixedPage.target };
  }

  // App Store screenshots — "screenshots", "airbnb app store screenshots", "store screenshots": an app's set opens
  // over its page, and with no app named, the page of every set (Screens beside it, for one who meant screens).
  // "Airbnb screenshots" is its set only when it has one; otherwise it is Airbnb's screens, as before.
  // The platform an app's set is on: the one looked at; with no platform named, any (an app named from Webs still
  // opens its iOS set). `strict` when one was named ("for web"): Airbnb's iOS set is no answer to that.
  // "App Store screenshots" with no platform named are iOS ones, wherever they are asked from.
  const shotsScope: readonly Platform[] | null = !context?.ask && /\bapp ?store\b/.test(working) ? ['ios'] : scope;
  const withShots = (app: App, strict = false) => {
    const on = app.platforms.filter((platform) => app.storeShots?.[platform]?.images.length);
    return on.find((platform) => !shotsScope || shotsScope.includes(platform)) ?? (strict && context?.ask ? undefined : on[0]);
  };
  // What they are called where they are: iOS sets are App Store ones; Webs' are web apps' (or sites').
  const shotsKind = (platforms: readonly Platform[] | null) =>
    !platforms || platforms.includes('ios') ? 'App Store' : platforms.every((platform) => platform === 'site') ? 'site' : 'web app';
  const saysShots = /\bscreen ?shots?\b/.test(working);
  const shotsNamed = saysShots || STORE_SHOTS.test(working) ? findApps(working.replace(new RegExp(STORE_SHOTS.source, 'g'), ' '), everyApp).filter((app) => !negatedIds.has(app.id)) : [];
  if (STORE_SHOTS.test(working) || (saysShots && (shotsNamed.length > 0 || /^(?:screen ?shots?)$/.test(clean(withoutPlatform(original)))))) {
    const shotsTarget = (app: App, platform: Platform): NavTarget => ({
      label: `${app.name} ${shotsKind([platform])} screenshots`,
      hint: 'Screenshots',
      href: INSPIRATIONS_ROUTES.app(app, platform, { platform, shots: '1' }),
      iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
    });
    // iOS's page carries no platform, so a Webs page's links would move it to Webs: an iOS one says so.
    const iosOnly = shotsScope?.length === 1 && shotsScope[0] === 'ios';
    const page: NavTarget = { label: `${shotsKind(shotsScope).replace(/^\w/, (c) => c.toUpperCase())} screenshots`, hint: 'Page', href: iosOnly && scope && !scope.includes('ios') ? `${INSPIRATIONS_ROUTES.screenshots}?platform=ios` : INSPIRATIONS_ROUTES.screenshots };
    const screens = PAGES.find((entry) => entry.target.href === INSPIRATIONS_ROUTES.screens)!.target;
    if (shotsNamed.length) {
      const app = shotsNamed[0];
      const platform = withShots(app, true);
      const elsewhere = withShots(app);
      if (platform) return { text: `Here are ${app.name}’s ${shotsKind([platform])} screenshots.`, targets: [appTarget(app), page], go: shotsTarget(app, platform), app };
      // Asked on a platform it has none on: said so, with the set it does have to open instead.
      if (elsewhere) {
        return {
          text: `${app.name} has no ${shotsKind(shotsScope)} screenshots. It has ${shotsKind([elsewhere])} ones on ${PLATFORM_LABEL[elsewhere]}.`,
          targets: [shotsTarget(app, elsewhere), page],
          app,
          kind: 'answer',
        };
      }
      // None anywhere: said so. "Canva screenshots" then shows its screens, which may be what was meant.
      if (saysShots && !STORE_SHOTS.test(working)) return { text: `${app.name} has no ${shotsKind(shotsScope)} screenshots yet. Here are its screens.`, targets: [page], go: appTarget(app), app };
      return { text: `${app.name} has no ${shotsKind(shotsScope)} screenshots yet.`, targets: [appTarget(app), page], app };
    }
    // In Webs they are the web apps' (from the Mac App Store or uploaded), not "App Store" ones.
    const kindOf = shotsKind(shotsScope);
    const listed = shotsScope === scope ? apps : everyApp.filter((app) => app.platforms.some((platform) => shotsScope!.includes(platform)));
    const sets = listed.flatMap((app) => {
      const platform = withShots(app, true);
      return platform ? [shotsTarget(app, platform)] : [];
    });
    return sets.length
      ? { text: `Here are the ${kindOf} screenshots: ${plural(sets.length, 'app')} so far. Looking for app screens? They’re in Screens.`, targets: [...sets.slice(0, 3), screens], go: page }
      : { text: `No ${kindOf} screenshots here yet. App screens are in Screens.`, targets: [page, screens], kind: 'answer' };
  }

  const asksCount = /\bhow (many|much)\b|\b(count|number of|total)\b/.test(lower);
  const section = findSection(lower);
  const namedElements = findElements(working, elementKinds);
  // "screens with a search bar" is about the search bar, not about search screens.
  const screenType = section?.tab === 'flows' ? null : findScreenType(namedElements.length ? stripElements(lower, namedElements) : lower);
  const states = findStates(lower);
  const styles = findStyles(lower);
  const industryHit = findIndustry(lower);
  const adjective = /\b(ios|iphone|web ?apps?|webs|web|websites?)\s+(?:[\w-]+\s+){0,2}?(?:screens?|pages?|flows?|ui)\b/.exec(lower);
  const platformHit = findPlatform(lower) ?? (adjective ? findPlatform(`on ${adjective[1]}`) : null);
  /** The Screens page, filtered by everything the sentence named. */
  const screenQuery = (sort?: string) => {
    const params = new URLSearchParams();
    if (screenType) params.set('type', screenType.key);
    if (states.length) params.set('state', states.join(','));
    if (styles.length) params.set('style', styles.join(','));
    if (industryHit) params.set('industry', industryHit);
    // Web apps and sites are in the Webs section, which an address names `web` (Web Apps alone stay `webapp`).
    if (platformHit) params.set('platform', platformHit === 'site' ? 'web' : platformHit);
    if (sort) params.set('sort', sort);
    return params;
  };
  const screenScope = `${platformHit ? ` on ${context?.ask === 'webs' ? 'Webs' : PLATFORM_LABEL[platformHit]}` : ''}${industryHit ? ` from ${INDUSTRY_LABEL[industryHit].toLowerCase()} apps` : ''}`;
  const yesNo = YES_NO.test(original);
  const question = yesNo || WH.test(original) || /\?\s*$/.test(original);
  // Something about an app is being asked — enough to know "it" needs an app.
  const asksAboutAnApp = Boolean(section || asksCount || screenType || states.length || styles.length || findPlatform(lower) || findIndustry(lower) || PLATFORM_ASKED.test(lower) || INDUSTRY_ASKED.test(lower) || RATING_ASKED.test(lower) || INFO.test(lower) || SAVE.test(lower) || COPY.test(lower) || SIMILAR.test(lower));

  // Pages and screen-type links need no data, so they still work offline;
  // everything else looks something up and has nothing to look it up in.
  if (unreachable) {
    if (screenType && !asksCount) {
      const go: NavTarget = { label: `${screenType.label} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` };
      return { text: `Showing ${screenType.label.toLowerCase()} screens.`, targets: [], go };
    }
    if (wantsApps) return allApps([]);
    return {
      text: 'I can’t reach the library right now. Check your connection and try again.',
      targets: [{ label: 'Try again', hint: 'Retry', href: '', ask: original }],
      error: true,
    };
  }

  // Where the visitor is: the app page they have open is a subject too.
  const pageApp = appOnPage(context, index);
  if (WHERE_AM_I.test(lower)) {
    if (pageApp) return { ...describeApp(pageApp), text: `You’re looking at ${pageApp.name}. ${describeApp(pageApp).text}` };
    const where = PAGES.find((entry) => entry.target.href === (context?.page?.pathname ?? '').replace(/\/$/, ''));
    return { text: where ? `You’re on the ${where.target.label} page.` : 'You’re in Motvin Inspirations. Tell me an app or a page and I’ll take you there.', targets: QUICK_PAGES.slice(0, 4) };
  }

  if (wantsApps) return allApps(apps);

  // Websites (Webs): their pages and sections, never app screens. "pricing page websites", "remote pricing",
  // "hero section", "remote sections"; and "pricing page" on Webs, or "web pricing" (Webs = web apps and
  // websites: the Web App screens, with the websites' own pages beside them).
  const ask = context?.ask ?? null;
  // An app being talked about ("show canva", then "pricing") keeps the question: its screens, not a website's page.
  const carriedApp = !ask && context?.app && !isWebsite(context.app) && !findApps(lower, everyApp).length;
  const inWebs = !ask && !carriedApp && Boolean(scope && isWebsPlatforms(scope));
  const otherApps = findApps(lower, everyApp).filter((app) => !isWebsite(app));
  const namedSite = findApps(lower, everyApp).find(isWebsite) ?? null;
  const openSite = !otherApps.length && ask !== 'ios' && ask !== 'webapp' ? (isWebsite(pageApp) ? pageApp : isWebsite(context?.app) ? context?.app ?? null : null) : null;
  const siteApp = namedSite ?? openSite;
  const sitePageType = findSitePageType(lower);
  const siteSectionType = findSiteSectionType(lower);
  const saysSection = /\bsections?\b/.test(lower);
  const saysPage = /\bpages?\b/.test(lower);
  const appById = new Map(everyApp.map((app) => [app.id, app]));
  // The Website pages grid (every website's pages, or sections), of a type: what Screens is for apps.
  const siteGrid = (kind: 'page' | 'section', type: string | null, label: string): NavTarget => {
    const sp = new URLSearchParams({ platform: 'web' });
    if (kind === 'section') sp.set('tab', 'sections');
    if (type) sp.set('type', type);
    return { label, hint: 'Sites', href: `${INSPIRATIONS_ROUTES.sites}?${sp}` };
  };
  // On Webs (web apps and sites together), app screens and UI elements come from Web Apps alone: said so, with
  // the sites' own pages and sections beside ("Showing profile screens on Webs, all from Web Apps.").
  const websAppsOnly = Boolean(scope?.includes('webapp') && scope.includes('site') && everyApp.some(isWebsite));
  const sitesNote = (what: string) => ` All from Web Apps. Sites have pages and sections, not ${what}.`;
  const siteTargets = () => [siteGrid('page', null, 'Site pages'), siteGrid('section', null, 'Site sections')];
  const sitesWith = async (kind: 'page' | 'section', type: string) =>
    (await Promise.resolve().then(() => inspirationsApi.listSiteScreens(kind, type)).catch(() => [])).filter((s) => appById.has(s.appId));

  // A site named on iOS or Web Apps ("remote pricing", then "app"): a site is on Sites alone.
  if (namedSite && (ask === 'ios' || ask === 'webapp') && !(otherApps.length && COMPARE.test(lower))) {
    return { text: `${namedSite.name} isn’t on ${ON_LABEL[ask]}. It’s on Sites.`, targets: [appTarget(namedSite)], app: namedSite };
  }
  // A site's page or section asked for on iOS or Web Apps ("about page" then "app"): only sites have them.
  const onAppPlatform = ask === 'ios' || ask === 'webapp';
  if (onAppPlatform && !screenType && !otherApps.length && !asksCount && (sitePageType || siteSectionType) && !namedElements.length) {
    const kind = sitePageType && !(saysSection && siteSectionType) ? 'page' : 'section';
    const type = kind === 'page' ? sitePageType! : siteSectionType!;
    const label = kind === 'page' ? pageTypeLabel(type) : `${sectionTypeLabel(type)} section`;
    const have = await sitesWith(kind, type);
    const grid = siteGrid(kind, type, `${label}s`);
    const sites = new Set(have.map((s) => s.appId)).size;
    return sites
      ? { text: `${label}s are only on Sites. Showing them from ${plural(sites, 'site')}.`, targets: [], go: grid }
      : { text: `${label}s are only on Sites, and no site has ${aOrAn(label)} yet.`, targets: [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }] };
  }

  // Sections: one website's Sections tab (of a type, or all of them), or the websites that have that kind.
  // A word that is also a page ("pricing", "features") is a page, unless "section" is said.
  // "sections", "show me sections": the websites' Sections tabs.
  if (saysSection && !siteApp && !siteSectionType && !asksCount && !otherApps.length && !screenType) {
    if (everyApp.some(isWebsite)) return { text: 'Showing site sections.', targets: [siteGrid('page', null, 'Site pages')], go: siteGrid('section', null, 'Site sections') };
  }
  const sectionsWanted =
    !asksCount &&
    !otherApps.length &&
    Boolean((saysSection && (siteApp || siteSectionType)) || (siteSectionType && EXCLUSIVE_SECTION.test(lower)) || (siteSectionType && !sitePageType && (siteApp || ask === 'website' || (ask === 'webs' && !namedElements.length))));
  if (sectionsWanted) {
    const sectionsOf = (app: App, type: string | null): NavTarget => ({
      label: `${app.name} ${type ? `${sectionTypeLabel(type)} sections` : 'sections'}`,
      hint: 'Site sections',
      href: INSPIRATIONS_ROUTES.app(app, 'site', type ? { tab: 'sections', type } : { tab: 'sections' }),
    });
    if (siteApp && !siteSectionType) return { text: `Showing ${siteApp.name}’s sections.`, targets: [], go: sectionsOf(siteApp, null), app: siteApp };
    if (siteSectionType) {
      const label = sectionTypeLabel(siteSectionType);
      const have = await sitesWith('section', siteSectionType);
      if (siteApp) {
        if (!have.some((s) => s.appId === siteApp.id)) return { text: `${siteApp.name} has no ${label} section yet.`, targets: [sectionsOf(siteApp, null)], app: siteApp };
        return { text: `Showing ${siteApp.name}’s ${label} sections.`, targets: [sectionsOf(siteApp, null)], go: sectionsOf(siteApp, siteSectionType), app: siteApp };
      }
      const sites = [...new Set(have.map((s) => s.appId))].map((id) => appById.get(id)!).map((app) => sectionsOf(app, siteSectionType));
      if (sites.length) return { text: `Showing ${label} sections from ${plural(sites.length, 'site')}.`, targets: sites.slice(0, 4), go: siteGrid('section', siteSectionType, `${label} sections`), results: sites };
      if (saysSection || ask === 'website') return { text: `No site has ${aOrAn(label)} section yet.`, targets: [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }] };
    }
  }

  // "web pages", "website pages": the Website pages grid.
  // ("form page web" is the Form UI element on Webs, not a site page.)
  if ((ask === 'website' || ask === 'webs') && saysPage && !sitePageType && !siteApp && !asksCount && !otherApps.length && !screenType && !namedElements.length && everyApp.some(isWebsite)) {
    return { text: 'Showing site pages.', targets: [siteGrid('section', null, 'Site sections')], go: siteGrid('page', null, 'Site pages') };
  }

  // Pages: a website's own page of that type, or the websites that have one.
  if (sitePageType && !asksCount && !otherApps.length && (ask === 'website' || ask === 'webs' || inWebs || siteApp)) {
    const label = pageTypeLabel(sitePageType);
    const pages = await sitesWith('page', sitePageType);
    const pageTarget = (page: (typeof pages)[number]): NavTarget => {
      const app = appById.get(page.appId)!;
      return { label: `${app.name} ${label}`, hint: 'Site page', href: INSPIRATIONS_ROUTES.app(app, 'site', { screen: page.id }) };
    };
    const webAppScreens: NavTarget | null = screenType ? { label: `Web App ${screenType.label.toLowerCase()} screens`, hint: 'Web Apps', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}&platform=webapp` } : null;
    if (siteApp) {
      const own = pages.find((page) => page.appId === siteApp.id);
      const onSite: NavTarget = { label: `${siteApp.name} pages`, hint: 'Site', href: INSPIRATIONS_ROUTES.app(siteApp, 'site') };
      if (!own) return { text: `${siteApp.name} has no ${label} yet.`, targets: [onSite], app: siteApp };
      return { text: `Opening ${siteApp.name}’s ${label}.`, targets: [onSite], go: pageTarget(own), app: siteApp };
    }
    const found = pages.map(pageTarget);
    // Webs is Web Apps and Sites together: "web pricing page", or "pricing page" while on Webs, shows the Web App
    // screens with the sites' pages beside them. Only "sites" asks for the sites' pages alone.
    const bothSides = (ask === 'webs' || (inWebs && ask !== 'website')) && webAppScreens;
    const grid = siteGrid('page', sitePageType, `Site ${label}s`);
    if (bothSides && found.length) {
      return { text: `Showing ${screenType!.label.toLowerCase()} screens from Web Apps. On Sites, ${found.length === 1 ? `${found[0].label.replace(` ${label}`, '')} has ${aOrAn(label)} too.` : `${plural(found.length, 'site')} have ${aOrAn(label)} too.`}`, targets: [grid], go: { ...webAppScreens, href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType!.key}&platform=web` } };
    }
    // Every website's page of that type, in one grid — as the Screens page shows every app's screens.
    if (found.length) return { text: `Showing ${label}s from ${plural(found.length, 'site')}.`, targets: webAppScreens ? [webAppScreens] : [], go: grid, results: found };
    // No website has it: say so when websites were asked for; Webs or a page on Webs goes on to the Web App screens.
    if (ask === 'website' || ((ask === 'webs' || inWebs) && !webAppScreens)) return { text: `No site has ${aOrAn(label)} yet.`, targets: webAppScreens ? [webAppScreens] : [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }] };
  }

  // "onboarding on websites": websites are pages and sections, so what they don't have is shown from Web Apps.
  if (ask === 'website' && screenType && !asksCount && !otherApps.length && !siteApp) {
    const go: NavTarget = { label: `Web App ${screenType.label.toLowerCase()} screens`, hint: 'Web Apps', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}&platform=webapp` };
    return { text: `Sites have pages and sections, not ${screenType.label.toLowerCase()} screens. Showing them from Web Apps.`, targets: [{ label: 'Sites', hint: 'Webs', href: WEBSITES_LIST }], go };
  }
  // "forms on sites": a UI element is in app screens, so it is shown from Web Apps, with the sites' own pages beside.
  if (ask === 'website' && namedElements.length && !screenType && !siteSectionType && !sitePageType && !asksCount && !otherApps.length && !siteApp) {
    const kind = namedElements[0];
    const label = elementLabel(kind).toLowerCase();
    const go: NavTarget = { label: `Web App ${label}s`, hint: 'UI elements', href: `${INSPIRATIONS_ROUTES.uiElements}?element=${encodeURIComponent(kind)}&platform=webapp` };
    return { text: `Sites have pages and sections, not ${label}s. Showing ${label}s from Web Apps.`, targets: [siteGrid('page', null, 'Site pages'), siteGrid('section', null, 'Site sections')], go };
  }

  // "the second one", "both", "all of them": picking from what was just listed.
  const ordinal = findOrdinal(lower);
  const listed = listedApps(context, index);
  if (ordinal && listed.length > 0) {
    if (ordinal.kind === 'both' && listed.length >= 2) return compareApps(listed.slice(0, 2));
    if (ordinal.kind === 'all') return { text: `Here they all are — ${listNames(listed.map((app) => app.name), 6)}.`, targets: appResults(listed), results: appResults(listed) };
    const chosen = ordinal.kind === 'index' ? listed[ordinal.index] : ordinal.kind === 'last' ? listed[listed.length - 1] : listed.find((app) => app.id !== context?.app?.id);
    if (chosen) return { text: pick([`Opening ${chosen.name}.`, `Taking you to ${chosen.name}.`, `Here’s ${chosen.name}.`]), targets: followUps(chosen, null), go: appTarget(chosen), app: chosen };
    return { text: `I only listed ${plural(listed.length, 'app')} — ${listNames(listed.map((app) => app.name), 6)}. Which one?`, targets: appResults(listed), results: appResults(listed) };
  }

  // "what about web apps", "and web?": the same question for another platform, about what was just listed or opened.
  const followPlatform = FOLLOW_PLATFORM.exec(lower.trim());
  const followAsked = followPlatform ? findPlatform(`on ${followPlatform[1]}`) : null;
  if (followPlatform && followAsked && findApps(lower, everyApp).length === 0) {
    const asked = followAsked;
    const current = context?.app ?? pageApp ?? null;
    if (listed.length > 1) {
      const on = listed.filter((app) => app.platforms?.includes(asked));
      return on.length
        ? { text: `Of those, ${listNames(on.map((app) => app.name), 4)} ${on.length === 1 ? 'is' : 'are'} on ${ON_LABEL[asked]}.`, targets: appResults(on.slice(0, 4)), results: appResults(on) }
        : { text: `None of those are on ${ON_LABEL[asked]}.`, targets: appResults(listed.slice(0, 3)), results: appResults(listed) };
    }
    if (current) {
      const on = current.platforms?.includes(asked);
      return { text: on ? `Yes — ${current.name} is on ${platformList(current)}.` : `${current.name} isn’t on ${ON_LABEL[asked]}. It’s on ${platformList(current)}.`, targets: [appTarget(current), ...followUps(current, null).slice(0, 2)], app: current };
    }
    return resolveInner(PLATFORM_QUERY[asked], undefined, notes);
  }

  // "open the last app again", "back to that one".
  if (REOPEN.test(lower.trim())) {
    const current = context?.app ?? pageApp ?? null;
    if (current) return { text: pick([`Opening ${current.name} again.`, `Back to ${current.name}.`]), targets: followUps(current, null), go: appTarget(current), app: current };
    const biggest = [...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 5);
    return { text: 'Which app do you mean?', targets: biggest.map((app) => ({ label: app.name, hint: 'App', href: '', ask: `open ${app.name}`, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined })), kind: 'clarify' };
  }

  // A named app is found wherever it is, and counted on the section when it is in it.
  let mentioned = findApps(lower, everyApp).filter((app) => !negatedIds.has(app.id)).map((app) => scopedById.get(app.id) ?? app);
  // "its flows", "is this on iOS" — the app from the last answer.
  const subject = context?.app ?? pageApp ?? null;
  if (!mentioned.length && subject && REFERS_BACK.test(lower) && asksAboutAnApp && !(INFO.test(lower) && clean(lower.replace(INFO, ' ')).split(' ').filter((word) => word && !/^(it|its|this|that|one|app|here)$/.test(word)).length > 0)) mentioned = [subject];
  // "how many screens?" straight after opening Zomato means Zomato's screens. The
  // app being talked about is the subject of any question about app facts, unless
  // the question widens itself: "in the whole library", "all apps", "which app has…".
  // "how many patterns" (no "it" / "its") is the library's count, not the last app's.
  // "websites", "web apps" widen it too: a list of them, not a fact about the app on show.
  const widened = LIBRARY_SCOPE.test(lower) || /\b(?:apps|websites|sites)\b/i.test(lower) || findRanking(lower) !== null || COMPARE.test(lower) || findIndustry(lower) !== null || WHICH_APPS.test(lower) || Boolean(adjective) || (asksCount && /\bpatterns?\b/.test(lower) && !REFERS_BACK.test(lower));
  // "what is this" carries to the app; "what is the meaning of life" does not — when the only
  // sign of an app question is a "what is / tell me about" opener, the rest must be nothing but a pronoun.
  const onlyInfo = INFO.test(lower) && !(section || asksCount || screenType || states.length || styles.length || findPlatform(lower) || PLATFORM_ASKED.test(lower) || INDUSTRY_ASKED.test(lower) || RATING_ASKED.test(lower) || SAVE.test(lower) || COPY.test(lower) || SIMILAR.test(lower));
  const infoRest = clean(lower.replace(INFO, ' ')).split(' ').filter((word) => word && !/^(it|its|this|that|one|app|here)$/.test(word));
  const vagueInfo = onlyInfo && infoRest.length > 0;
  const definesAThing = DEFINE.test(original.trim()) && !REFERS_BACK.test(lower) && (findPatterns(working, patterns).length > 0 || namedElements.length > 0);
  const carried = !mentioned.length && Boolean(subject) && asksAboutAnApp && !widened && !vagueInfo && !definesAThing;
  if (carried && subject) mentioned = [subject];
  // A way back out to the whole library, offered whenever the app was assumed.
  const wholeLibrary: NavTarget[] = carried ? [{ label: 'Whole library', hint: 'Ask', href: '', ask: `${original.replace(/\?\s*$/, '')} in the whole library` }] : [];

  // Things named in the library beyond apps: patterns, UI elements, flow categories.
  // On a pattern page, "this" / "it" is that pattern.
  const foundPatterns = findPatterns(working, patterns);
  const scoped = Boolean(industryHit || platformHit) && (states.length > 0 || Boolean(screenType)) && !/\bpatterns?\b/.test(lower);
  const namedPatterns = scoped ? [] : foundPatterns.length ? foundPatterns : [];
  const flowCategory = findFlowCategory(working, flowCategories);
  const askedFlowCategory = findFlowCategory(working, [...FLOW_CATEGORY_PRESETS]);
  const numberFilter = findNumberFilter(lower);
  const topN = findTopN(lower);

  // Things the library cannot know, said plainly, with the nearest thing it can show.
  if (JUDGE.test(lower) && mentioned.length !== 1) {
    if (mentioned.length >= 2) {
      const side = compareApps(mentioned);
      return { ...side, text: `Which is better is a matter of taste, so I won’t pick one. Here they are side by side. ${side.text}` };
    }
    const label = screenType ? `${screenType.label.toLowerCase()} screens` : 'screens';
    return { text: `Which is better is a matter of taste, so I won’t pick for you. I can show you ${label} to compare yourself.`, targets: [{ label: `See ${label}`, hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}${screenQuery().toString() ? `?${screenQuery()}` : ''}` }, QUICK_PAGES[0]] };
  }
  const biggestApps = [...apps].sort((a, b) => b.screenCount - a.screenCount);
  if (POPULAR.test(lower) && !mentioned.length) {
    if (section?.tab === 'screens' || screenType) {
      const go: NavTarget = { label: 'Most popular screens', hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}${screenQuery().toString() ? `?${screenQuery()}` : ''}` };
      return { text: 'Showing the screens in their most popular order.', targets: [], go };
    }
    return { text: `I don’t track what’s popular or trending. By size, ${listNames(biggestApps.slice(0, 3).map((app) => app.name), 3)} have the most screens.`, targets: appResults(biggestApps.slice(0, 3)), results: appResults(biggestApps) };
  }
  if (UNTRACKED.test(lower) && !mentioned.length) {
    return { text: 'Motvin doesn’t record whether an app is free or paid, or how many people use it. I can list every app, though.', targets: [QUICK_PAGES[0], ...appResults(biggestApps.slice(0, 2))] };
  }
  if (THIS_WEEK.test(lower) && !mentioned.length && !asksCount && !section && !screenType) {
    const go: NavTarget = { label: 'New this week', hint: 'Page', href: INSPIRATIONS_ROUTES.newThisWeek };
    return { text: 'Here are the apps added this week.', targets: [{ label: 'Newest apps', hint: 'Apps', href: `${INSPIRATIONS_ROUTES.apps}?sort=newest` }], go };
  }
  if (RECENT.test(lower) && !mentioned.length && (findRanking(lower) === null || /\bapps\b/.test(lower)) && !asksCount) {
    const forApps = /\bapps\b/.test(lower);
    const params = screenQuery('newest');
    const go: NavTarget = forApps ? { label: 'Newest apps', hint: 'Apps', href: `${INSPIRATIONS_ROUTES.apps}?sort=newest` } : { label: 'Newest screens', hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?${params}` };
    const other: NavTarget = forApps ? { label: 'Newest screens', hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?sort=newest` } : { label: 'Newest apps', hint: 'Apps', href: `${INSPIRATIONS_ROUTES.apps}?sort=newest` };
    return { text: forApps ? 'Showing the newest apps first.' : 'Showing the newest screens first.', targets: [other], go };
  }

  // Buddy is for exploring: it copies a link (after asking), but saving is the visitor's own, from the Save buttons.
  if (COPY.test(lower)) {
    const target = mentioned[0] ?? subject;
    if (!target) return { text: 'Which app’s link would you like? Name it, or open it first.', targets: appResults([...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 4)), kind: 'clarify' };
    const href = INSPIRATIONS_ROUTES.app(target);
    return { text: `Copy the link to ${target.name}?`, targets: [appTarget(target)], action: { kind: 'copy', href, label: target.name }, app: target, kind: 'action' };
  }
  if (SAVE.test(lower)) {
    const target = mentioned[0] ?? subject;
    const collections = PAGES.find((entry) => entry.target.label === 'Collections')!.target;
    return {
      text: `I’m here to help you explore, so I don’t save things. ${target ? `Open ${target.name} and use its Save button` : 'Use the Save button on an app, screen or flow'}, or tick screens and choose Save.`,
      targets: target ? [appTarget(target), collections] : [collections],
      app: target ?? undefined,
      kind: 'answer',
    };
  }

  // "its flows" with nothing it could refer to: ask, with the biggest apps as the choices.
  if (!mentioned.length && !subject && REFERS_BACK.test(lower) && asksAboutAnApp && apps.length > 0) {
    const biggest = [...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 5);
    return {
      text: 'Which app do you mean?',
      targets: biggest.map((app) => ({ label: app.name, hint: 'App', href: '', ask: `${original} ${app.name}`, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined })),
      kind: 'clarify',
    };
  }

  if (mentioned.length === 1) {
    const app = mentioned[0];

    // "apps like Swiggy": others of the same kind.
    if (SIMILAR.test(withoutNames(lower, [app])) && !COMPARE.test(lower)) {
      const kin = apps.filter((other) => other.id !== app.id && other.industry === app.industry).sort((a, b) => b.screenCount - a.screenCount);
      const kind = INDUSTRY_LABEL[app.industry] ?? app.industry;
      if (kin.length === 0) return { text: `${app.name} is the only ${kind} app in the library so far.`, targets: [appTarget(app), QUICK_PAGES[0]], app };
      return { text: `Apps like ${app.name} (${kind}): ${listNames(kin.map((other) => other.name), 4)}.`, targets: appResults(kin.slice(0, 4)), app, results: appResults(kin) };
    }

    // A pattern or UI element inside one app.
    if (namedPatterns.length === 1 && !section) {
      const pattern = namedPatterns[0];
      const used = appsUsingPattern(index, pattern);
      const has = used.some((other) => other.id === app.id);
      return { text: has ? `Yes — ${app.name} uses the “${pattern.name}” pattern.` : `${app.name} doesn’t use the “${pattern.name}” pattern. It appears in ${used.length ? listNames(used.map((other) => other.name), 3) : 'no apps yet'}.`, targets: [patternTarget(pattern), { ...appTarget(app, 'patterns'), label: `${app.name} patterns` }], card: patternCard(pattern, index), app };
    }
    if (namedElements.length > 0 && !screenType && !(section?.tab === 'screens' && states.length)) {
      const kind = namedElements[0];
      const total = await countScreens({ element: kind }, app, scopeOf(app));
      const label = elementLabel(kind).toLowerCase();
      const go = { ...appTarget(app, 'ui-elements'), label: `${app.name} UI elements` };
      if (total === null) return { text: `Opening ${app.name}’s UI elements.`, targets: followUps(app, 'ui-elements'), go, app };
      if (total === 0) return { text: `${yesNo ? 'No — ' : ''}${app.name} has no screens with ${label}s.`, targets: [go, ...followUps(app, 'ui-elements').slice(0, 2)], app };
      return { text: `${yesNo ? 'Yes — ' : ''}${app.name} has ${plural(total, 'screen')} with ${label}s.`, targets: [go, ...followUps(app, 'ui-elements').slice(0, 2)], go: question ? undefined : go, app };
    }

    // Screens in a certain state or style inside one app.
    if ((states.length || styles.length) && !asksCount) {
      const what = [...styles.map((style) => styleLabel(style).toLowerCase()), ...states.map((state) => screenStateLabel(state).toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
      const total = await countScreens({ type: screenType?.key, states, styles }, app, scopeOf(app));
      const go: NavTarget = { label: `${app.name} ${what} screens`, hint: 'Search', href: appSearch(app, `${app.name} ${what}`, scopeOf(app)) };
      if (yesNo && total !== null) return total > 0 ? { text: `Yes — ${app.name} has ${plural(total, `${what} screen`)}.`, targets: [go, ...followUps(app, null).slice(0, 2)], app } : { text: `No — ${app.name} has no ${what} screens.`, targets: followUps(app, null), app };
      return { text: total !== null && total > 0 ? `${app.name} has ${plural(total, `${what} screen`)}. Showing them.` : `Showing ${app.name}’s ${what} screens.`, targets: followUps(app, null).slice(0, 2), go, app };
    }
    if ((states.length || styles.length) && asksCount) {
      const what = [...styles.map((style) => styleLabel(style).toLowerCase()), ...states.map((state) => screenStateLabel(state).toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
      const total = await countScreens({ type: screenType?.key, states, styles }, app, scopeOf(app));
      if (total !== null) return { text: `${app.name} has ${plural(total, `${what} screen`)}.`, targets: [...wholeLibrary, { label: `See them`, hint: 'Search', href: appSearch(app, `${app.name} ${what}`, scopeOf(app)) }, ...followUps(app, 'count').slice(0, 1)], app };
    }

    // A flow of a certain kind inside one app.
    if (flowCategory && !asksCount) {
      const inCategory = index.flows.filter((flow) => flow.appId === app.id && flow.category === flowCategory);
      const label = flowCategoryLabel(flowCategory).toLowerCase();
      if (inCategory.length === 1) return { text: `Opening ${app.name}’s ${label} flow, “${inCategory[0].name}”.`, targets: followUps(app, 'flows').slice(0, 2), go: flowTarget(inCategory[0], index, false), card: flowCard(inCategory[0], index), app };
      if (inCategory.length > 1) return { text: `${app.name} has ${plural(inCategory.length, `${label} flow`)} — which one?`, targets: inCategory.slice(0, 6).map((flow) => flowTarget(flow, index, false)), app, kind: 'clarify' };
      if (index.flows.some((flow) => flow.appId === app.id)) return { text: `${app.name} has no ${label} flow recorded. Here are all its flows.`, targets: followUps(app, 'flows'), go: { ...appTarget(app, 'flows'), label: `${app.name} flows` }, app };
    }

    const fact = await answerAboutApp(app, lower, question, yesNo, section, screenType, asksCount, scopeOf(app));
    if (fact) return fact;
    if (asksCount && screenType) {
      const total = await countScreens({ type: screenType.key }, app, scopeOf(app));
      if (total !== null) {
        return {
          text: `${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`,
          targets: [...wholeLibrary, { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: appSearch(app, `${app.name} ${screenType.label.toLowerCase()}`, scopeOf(app)) }, ...followUps(app, 'count').slice(0, 2)],
          app,
        };
      }
    }
    if (section?.tab === 'flows' && !asksCount) {
      const flowMatches = matchFlows(leftoverWords(working, everyApp), app, index);
      if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].name}” flow.`, targets: followUps(app, 'flows').slice(0, 2), go: flowTarget(flowMatches[0], index, false), card: flowCard(flowMatches[0], index), app };
      if (flowMatches.length > 1) return { text: `${app.name} has a few flows like that — which one?`, targets: flowMatches.map((flow) => flowTarget(flow, index, false)), app, kind: 'clarify' };
    }
    if (asksCount) {
      const saysFlows = hasWord(lower, 'flows') || hasWord(lower, 'flow');
      const saysScreens = hasWord(lower, 'screens') || hasWord(lower, 'screen');
      const neither = !saysFlows && !saysScreens;
      // A website has pages, and no flows to count.
      const site = isWebsite(app);
      const parts = [saysScreens || neither || site ? countPhrase(app, 'screens') : '', !site && (saysFlows || neither) ? countPhrase(app, 'flows') : ''].filter(Boolean);
      return {
        text: `${app.name} has ${parts.join(' and ')}.`,
        targets: [...wholeLibrary, appTarget(app), ...followUps(app, 'count').slice(0, 2)],
        card: { title: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, facts: site ? [countPhrase(app, 'screens')] : [countPhrase(app, 'screens'), countPhrase(app, 'flows')], href: INSPIRATIONS_ROUTES.app(app) },
        app,
      };
    }
    if (screenType) {
      const search = `${app.name} ${screenType.label.toLowerCase()}`;
      const go: NavTarget = { label: `${app.name} ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: appSearch(app, search, scopeOf(app)) };
      const allOfType: NavTarget[] = carried ? [{ label: `All ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] : [];
      // A platform asked for ("canva login", then "web app") is said: an app's web side is its web app.
      const appWhere = ask ? ` on ${ask === 'ios' ? 'iOS' : 'Web Apps'}` : '';
      return { text: `Showing ${app.name}’s ${screenType.label.toLowerCase()} screens${appWhere}.`, targets: [...allOfType, ...followUps(app, null).slice(0, 2)], go, app };
    }
    if (section) {
      const go = { ...appTarget(app, section.tab), label: `${app.name} ${section.label}` };
      return { text: pick([`Opening ${app.name}’s ${section.label}.`, `Here are ${app.name}’s ${section.label}.`]), targets: followUps(app, section.tab), go, app };
    }
    if (question && !section && !screenType) return describeApp(app);
    const extra = leftoverWords(working, everyApp).filter((word) => word.length >= 5 && !NOT_A_SUBJECT.has(word) && !/^\d+$/.test(word));
    if (extra.length > 0 && !carried) {
      const subject = extra.join(' ');
      const go: NavTarget = { label: `${app.name} · ${subject}`, hint: 'Search', href: appSearch(app, `${app.name} ${subject}`, scopeOf(app)) };
      return { text: `Searching ${app.name} for “${subject}”.`, targets: [appTarget(app), ...followUps(app, null).slice(0, 2)], go, app };
    }
    // Named from the other section: say where it is, so the jump to its page is no surprise.
    if (scope && !scopedById.has(app.id)) {
      // Named by the site's own two sections ("Apps" is iOS, "Webs" is web apps and websites), not "Web App".
      const where = app.platforms.includes('ios') ? 'Apps (iOS)' : 'Webs';
      return { text: `${app.name} is only in ${where}. Opening it there.`, targets: followUps(app, null), go: appTarget(app), app };
    }
    return { text: pick([`Opening ${app.name}.`, `Taking you to ${app.name}.`, `Here’s ${app.name}.`]), targets: followUps(app, null), go: appTarget(app), app };
  }

  if (mentioned.length > 1 && COMPARE.test(lower)) {
    // On one platform ("compare canva and coursera", then "app"): only what is on it, never one app's iOS beside
    // another's web.
    if (ask) {
      const askedPlatforms = ASKED_SCOPE[ask];
      const onIt = mentioned.filter((app) => app.platforms?.some((platform) => askedPlatforms.includes(platform)));
      const off = mentioned.filter((app) => !onIt.includes(app));
      const where = ask === 'webs' ? 'Webs' : ON_LABEL[ask === 'website' ? 'site' : ask];
      const missing = off.length ? `${listNames(off.map((app) => app.name), 3)} ${off.length === 1 ? 'isn’t' : 'aren’t'} on ${where}.` : '';
      if (onIt.length >= 2) {
        const side = compareApps(onIt);
        return { ...side, text: `On ${where}: ${side.text}${missing ? ` ${missing}` : ''}` };
      }
      const counts = (app: App) => (isWebsite(app) ? countPhrase(app, 'screens') : `${countPhrase(app, 'screens')} and ${countPhrase(app, 'flows')}`);
      if (onIt.length === 1) return { text: `${missing} ${onIt[0].name} has ${counts(onIt[0])}${isWebsite(onIt[0]) ? '' : ` on ${where}`}.`, targets: [appTarget(onIt[0])], app: onIt[0] };
      return { text: `Neither is on ${where}. ${mentioned.map((app) => `${app.name} is on ${platformList(app)}`).join('; ')}.`, targets: appResults(mentioned) };
    }
    return compareApps(mentioned);
  }

  // "compare all apps": the biggest few side by side.
  if (!mentioned.length && COMPARE.test(lower) && /\b(?:all|every|the|these|those)\s+apps\b|^compare apps\b/.test(lower) && apps.length >= 2) {
    const top = [...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 3);
    const side = compareApps(top);
    return { ...side, text: apps.length > 3 ? `The ${top.length} biggest of ${apps.length} apps, side by side. ${side.text}` : side.text };
  }

  if (mentioned.length > 1 && (asksCount || section || screenType)) {
    const named = mentioned.slice(0, 4);
    const saysFlows = hasWord(lower, 'flows') || hasWord(lower, 'flow');
    const saysScreens = hasWord(lower, 'screens') || hasWord(lower, 'screen');
    if (asksCount || section?.tab === 'flows' || section?.tab === 'screens') {
      const flowsOnly = section?.tab === 'flows' || (saysFlows && !saysScreens);
      const both = (saysFlows && saysScreens) || (asksCount && !saysFlows && !saysScreens);
      const bits = (app: App) => (flowsOnly ? [plural(app.flowCount, 'flow')] : both ? [plural(app.screenCount, 'screen'), plural(app.flowCount, 'flow')] : [plural(app.screenCount, 'screen')]);
      return {
        text: `${named.map((app) => `${app.name} has ${bits(app).join(' and ')}`).join('. ')}.`,
        targets: named.map((app) => ({ ...appTarget(app, flowsOnly ? 'flows' : undefined), label: flowsOnly ? `${app.name} flows` : app.name })),
        results: appResults(named),
      };
    }
    if (section) {
      return { text: `Here are the ${section.label} of ${listNames(named.map((app) => app.name), 4)}.`, targets: named.map((app) => ({ ...appTarget(app, section.tab), label: `${app.name} ${section.label}` })), results: appResults(named) };
    }
    if (screenType) {
      const type = screenType.label.toLowerCase();
      return { text: `Here are the ${type} screens of ${listNames(named.map((app) => app.name), 4)}.`, targets: named.map((app) => ({ label: `${app.name} ${type}`, hint: 'Search', href: appSearch(app, `${app.name} ${type}`, scope) })), results: appResults(named) };
    }
  }
  if (mentioned.length > 1) return { text: 'Which app do you mean?', targets: mentioned.slice(0, 6).map((app) => appTarget(app, section?.tab)), results: appResults(mentioned), kind: 'clarify' };

  // "apps except Swiggy": everything but.
  if (negatedApps.length > 0 && !findIndustry(lower) && !findPlatform(lower) && !numberFilter && !findRanking(lower)) {
    const rest = apps.filter((app) => !negatedIds.has(app.id)).sort((a, b) => b.screenCount - a.screenCount);
    if (rest.length === 0) return { text: `That leaves no apps — ${listNames(negatedApps.map((app) => app.name), 3)} ${negatedApps.length === 1 ? 'is' : 'are'} all there is.`, targets: [QUICK_PAGES[0]] };
    return { text: `Apart from ${listNames(negatedApps.map((app) => app.name), 3)}: ${listNames(rest.map((app) => app.name), 4)}.`, targets: appResults(rest.slice(0, 4)), results: appResults(rest) };
  }

  // A pattern, named or by category, across the library.
  if (namedPatterns.length > 0) {
    // "modal patterns": the whole category, not one pattern in it.
    const askedCategory = findPatternCategory(working, patterns);
    if (askedCategory && !DEFINE.test(original.trim()) && !WHICH_APPS.test(lower) && !asksCount) {
      const patternsWhere = ask ? ` on ${ask === 'webs' ? 'Webs' : ON_LABEL[ask === 'website' ? 'site' : ask]}` : '';
      const opening = `Opening the ${askedCategory.toLowerCase()} patterns${patternsWhere}.`;
      return { text: websAppsOnly ? `${opening}${sitesNote('patterns')}` : opening, targets: namedPatterns.slice(0, 6).map(patternTarget), go: { label: `${askedCategory} patterns`, hint: 'Patterns', href: INSPIRATIONS_ROUTES.patternCategory(askedCategory) } };
    }
    if (namedPatterns.length === 1) {
      const pattern = namedPatterns[0];
      const used = appsUsingPattern(index, pattern);
      if (DEFINE.test(original.trim()) && !WHICH_APPS.test(lower) && !asksCount) {
        return { text: pattern.description ? `${pattern.name}: ${pattern.description}` : `${pattern.name} is a ${pattern.category.toLowerCase()} pattern.`, targets: [patternTarget(pattern), ...appResults(used.slice(0, 3))], card: patternCard(pattern, index), results: appResults(used) };
      }
      if (WHICH_APPS.test(lower) || asksCount) {
        return used.length
          ? { text: `The “${pattern.name}” pattern appears in ${plural(used.length, 'app')} — ${listNames(used.map((app) => app.name), 4)}.`, targets: [patternTarget(pattern), ...appResults(used.slice(0, 3))], card: patternCard(pattern, index), results: appResults(used) }
          : { text: `The “${pattern.name}” pattern isn’t tied to any app’s screens yet.`, targets: [patternTarget(pattern)], card: patternCard(pattern, index) };
      }
      return { text: `Opening the “${pattern.name}” pattern.`, targets: appResults(used.slice(0, 3)), go: patternTarget(pattern), card: patternCard(pattern, index), results: appResults(used) };
    }
    return { text: `A few ${namedPatterns[0].category.toLowerCase()} patterns — which one?`, targets: namedPatterns.slice(0, 6).map(patternTarget), kind: 'clarify' };
  }

  // A UI element across the library.
  // "list AI apps", "show me a list of food apps" ask for apps; "list" there is not the UI element.
  const asksForApps = /\b(?:apps?|websites?)\b/.test(lower) && namedElements.every((kind) => kind === 'list');
  if (namedElements.length > 0 && !asksForApps && !screenType && (!section || section.tab === 'screens') && !(section?.tab === 'screens' && states.length) && !scoped) {
    const kind = namedElements[0];
    const label = elementLabel(kind).toLowerCase();
    const count = elements.find((element) => element.kind === kind)?.count ?? 0;
    // A platform asked for is where the examples open, and the count says which ("on Web Apps").
    const onAsk = ask ? ({ ios: 'ios', webapp: 'webapp', webs: 'web', website: 'web' } as const)[ask] : null;
    const where = ask ? ` on ${ask === 'webs' ? 'Webs' : ask === 'website' ? 'Sites' : PLATFORM_LABEL[ask]}` : '';
    const go: NavTarget = { label: `${elementLabel(kind)} examples`, hint: 'UI elements', href: `${INSPIRATIONS_ROUTES.uiElements}?element=${encodeURIComponent(kind)}${onAsk ? `&platform=${onAsk}` : ''}` };
    if (DEFINE.test(original.trim()) && !WHICH_APPS.test(lower) && !asksCount) {
      return { text: `I don’t write definitions, but ${plural(count, 'screen')} in the library have ${label}s. Have a look.`, targets: [go] };
    }
    if (WHICH_APPS.test(lower) || asksCount) {
      const found = await appsWithScreens({ element: kind }, index, scope);
      if (found && found.apps.length) return { text: `${plural(count || found.total, 'screen')} have ${label}s, in ${listNames(found.apps.map((app) => app.name), 4)}.`, targets: [go, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) };
      return { text: count ? `${plural(count, 'screen')} have ${label}s.` : `No screens with ${label}s yet.`, targets: [go] };
    }
    // Webs is Web Apps and Sites: a UI element is in app screens only, so it says where they all come from.
    if (websAppsOnly) return { text: `${count ? `Showing ${label}s${where} — ${plural(count, 'screen')}.` : `Showing ${label}s${where}.`}${sitesNote(`${label}s`)}`, targets: siteTargets(), go };
    return { text: count ? `Showing ${label}s${where} — ${plural(count, 'screen')}.` : `Showing ${label}s${where}.`, targets: [], go };
  }
  if (asksElements(lower) && (!section || section.tab === 'ui-elements') && !mentioned.length && !asksCount) {
    const top = [...elements].sort((a, b) => b.count - a.count).slice(0, 5);
    const target = PAGES.find((entry) => entry.target.label === 'UI elements')!.target;
    return { text: top.length ? `The most common UI elements: ${listNames(top.map((element) => `${elementLabel(element.kind).toLowerCase()}s (${element.count})`), 5)}.` : 'Opening UI elements.', targets: top.slice(0, 4).map((element) => ({ label: elementLabel(element.kind), hint: 'UI elements', href: `${INSPIRATIONS_ROUTES.uiElements}?element=${encodeURIComponent(element.kind)}` })), go: target };
  }

  // Screens by state or style across the library — "empty states", "dark mode screens", "loading login screens".
  if (states.length || styles.length) {
    const what = [...styles.map((style) => styleLabel(style).toLowerCase()), ...states.map((state) => screenStateLabel(state).toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
    const params = screenQuery();
    const go: NavTarget = { label: `${what.charAt(0).toUpperCase()}${what.slice(1)} screens`, hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?${params}` };
    if (WHICH_APPS.test(lower) || asksCount) {
      const found = await appsWithScreens({ type: screenType?.key, states, styles }, index, scope);
      if (found) return found.total > 0 ? { text: `The library has ${plural(found.total, `${what} screen`)}${found.apps.length ? `, in ${listNames(found.apps.map((app) => app.name), 4)}` : ''}.`, targets: [go, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) } : { text: `No ${what} screens yet.`, targets: [QUICK_PAGES[1]] };
    }
    return { text: `Showing ${what} screens${screenScope}.`, targets: [], go };
  }

  if (askedFlowCategory && !flowCategory) return { text: `No ${flowCategoryLabel(askedFlowCategory).toLowerCase()} flows yet.`, targets: [QUICK_PAGES[2]] };

  // A kind of flow across the library — "onboarding flows", "which apps have a checkout flow".
  if (flowCategory) {
    const label = flowCategoryLabel(flowCategory);
    // Sites are pages and sections: their flows asked for are the Web App ones.
    if (ask === 'website' && (WHICH_APPS.test(lower) || asksCount)) return { text: 'Sites have pages and sections, not flows.', targets: siteTargets() };
    if (ask === 'website') {
      const webFlows = fullIndex.flows.filter((flow) => flow.category === flowCategory && flow.platform === 'webapp').length;
      const go: NavTarget = { label: `Web App ${label.toLowerCase()} flows`, hint: 'Flows', href: `${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(flowCategory)}&platform=webapp` };
      return { text: `Sites have pages and sections, not flows. Showing ${webFlows ? plural(webFlows, `${label.toLowerCase()} flow`) : `${label.toLowerCase()} flows`} from Web Apps.`, targets: siteTargets(), go };
    }
    const inCategory = index.flows.filter((flow) => flow.category === flowCategory);
    // On the platform the message named ("onboarding flows web" opens Webs' flows, not every flow).
    const flowPlatform = platformHit ? `&platform=${platformHit === 'ios' ? 'ios' : 'web'}` : '';
    const go: NavTarget = { label: `${label} flows`, hint: 'Flows', href: `${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(flowCategory)}${flowPlatform}` };
    const owners = [...new Map(inCategory.map((flow) => [flow.appId, index.appById.get(flow.appId)])).values()].filter((app): app is App => Boolean(app));
    if (WHICH_APPS.test(lower) || asksCount) {
      return inCategory.length
        ? { text: `There ${inCategory.length === 1 ? 'is' : 'are'} ${plural(inCategory.length, `${label.toLowerCase()} flow`)}${ask ? ` on ${ask === 'webs' ? 'Webs' : ON_LABEL[ask]}` : ''}, in ${listNames(owners.map((app) => app.name), 4)}.`, targets: [go, ...appResults(owners.slice(0, 3))], results: appResults(owners) }
        : { text: `No ${label.toLowerCase()} flows yet.`, targets: [QUICK_PAGES[2]] };
    }
    if (inCategory.length === 1) return { text: `Opening the one ${label.toLowerCase()} flow, “${inCategory[0].name}” from ${index.appById.get(inCategory[0].appId)?.name ?? 'the library'}.`, targets: [], go: flowTarget(inCategory[0], index, false), card: flowCard(inCategory[0], index) };
    const singular = /\bflow\b/.test(lower) && !/\bflows\b/.test(lower);
    if (singular && inCategory.length > 1 && inCategory.length <= 6) return { text: `A few ${label.toLowerCase()} flows — which one?`, targets: [...inCategory.map((flow) => flowTarget(flow, index, true)), go], kind: 'clarify' };
    const flowsWhere = ask ? ` on ${ask === 'webs' ? 'Webs' : ON_LABEL[ask]}` : '';
    const shown = inCategory.length ? `Showing ${plural(inCategory.length, `${label.toLowerCase()} flow`)}${flowsWhere}.` : `Showing ${label.toLowerCase()} flows${flowsWhere}.`;
    if (websAppsOnly) return { text: `${shown}${sitesNote('flows')}`, targets: siteTargets(), go, results: appResults(owners) };
    return { text: shown, targets: appResults(owners.slice(0, 3)), go, results: appResults(owners) };
  }

  // "login screens from food apps", "ios checkout screens": screens, narrowed to a kind of app.
  if ((industryHit || platformHit) && screenType && !states.length && !styles.length && !asksCount && !WHICH_APPS.test(lower) && !numberFilter && findRanking(lower) === null) {
    const go: NavTarget = { label: `${screenType.label} screens`, hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?${screenQuery()}` };
    if (websAppsOnly) return { text: `Showing ${screenType.label.toLowerCase()} screens${screenScope}.${sitesNote(`${screenType.label.toLowerCase()} screens`)}`, targets: siteTargets(), go };
    return { text: `Showing ${screenType.label.toLowerCase()} screens${screenScope}.`, targets: [], go };
  }

  // Questions about the apps themselves, from the library's own numbers: what kind
  // they are (food, fintech), where they run (iOS, Web Apps, Webs), how big they are.
  const industry = findIndustry(lower);
  const platform = findPlatform(lower);
  // "web", "webs": the Webs section, web apps and websites together; "websites": websites alone.
  const websAll = platform === 'site' && context?.ask === 'webs';
  const onPlatform = (app: App) => !platform || (websAll ? app.platforms?.some((p) => p === 'site' || p === 'webapp') : app.platforms?.includes(platform));
  const kind = [industry ? INDUSTRY_LABEL[industry] : '', platform ? (websAll ? 'Webs' : PLATFORM_ADJECTIVE[platform]) : ''].filter(Boolean).join(' ');
  let pool = apps.filter((app) => (!industry || app.industry === industry) && onPlatform(app) && !negatedIds.has(app.id) && !negatedPlatforms.some((excluded) => app.platforms?.includes(excluded)));
  const ranking = findRanking(lower);
  if (numberFilter) {
    const value = (app: App) => (numberFilter.field === 'screens' ? app.screenCount : numberFilter.field === 'flows' ? app.flowCount : (app.rating ?? null));
    pool = pool.filter((app) => matchesNumber(value(app), numberFilter));
    const describe = (filter: NumberFilter) => `${{ gt: 'more than', gte: 'at least', lt: 'fewer than', lte: 'at most', eq: 'exactly' }[filter.op]} ${filter.value}${filter.field === 'rating' ? ' stars' : ` ${filter.field}`}`;
    const ordered = [...pool].sort((a, b) => (value(b) ?? 0) - (value(a) ?? 0));
    if (ranking && ordered.length) return answerRanking(ordered, ranking, `${kind ? `${kind} ` : ''}apps with ${describe(numberFilter)}`, topN);
    if (ordered.length === 0) return { text: `No ${kind ? `${kind} ` : ''}apps have ${describe(numberFilter)}.`, targets: [QUICK_PAGES[0]] };
    const shown = ordered.map((app) => `${app.name} (${numberFilter.field === 'rating' ? (app.rating ?? 0).toFixed(1) : (value(app) ?? 0).toLocaleString()})`);
    return { text: `${plural(ordered.length, `${kind ? `${kind} ` : ''}app`)} ${ordered.length === 1 ? 'has' : 'have'} ${describe(numberFilter)}: ${listNames(shown, 4)}.`, targets: appResults(ordered.slice(0, 4)), app: ordered[0], results: appResults(ordered) };
  }
  // "how many login screens", then "app" / "web" / "site": counted on that platform, never turned into a count of
  // the platform's apps.
  if ((asksCount || WHICH_APPS.test(lower)) && screenType && !industry && !numberFilter && !ranking) {
    if (ask === 'website') return { text: `Sites have pages and sections, not ${screenType.label.toLowerCase()} screens.`, targets: siteTargets() };
    const total = await countScreens({ type: screenType.key }, null, scopeOf(null));
    if (total !== null) {
      const typePlatform = ask ? `&platform=${ask === 'ios' ? 'ios' : ask === 'webapp' ? 'webapp' : 'web'}` : '';
      const see: NavTarget = { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}${typePlatform}` };
      if (WHICH_APPS.test(lower)) {
        const found = await appsWithScreens({ type: screenType.key }, index, scope);
        if (found?.apps.length) return { text: `${screenType.label} screens${screenScope} appear in ${listNames(found.apps.map((app) => app.name), 4)} (${plural(found.total || total, 'screen')}).`, targets: [see, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) };
        if (!asksCount) return { text: `No ${screenType.label.toLowerCase()} screens${screenScope} yet.`, targets: [QUICK_PAGES[1]] };
      }
      const counted = `The library has ${plural(total, `${screenType.label.toLowerCase()} screen`)}${screenScope}.`;
      return websAppsOnly ? { text: `${counted}${sitesNote(`${screenType.label.toLowerCase()} screens`)}`, targets: [see, ...siteTargets()] } : { text: counted, targets: [see] };
    }
  }
  if (ranking && pool.length > 0) return answerRanking(pool, ranking, kind ? `${kind} apps` : null, topN);
  if (industry || platform || negatedPlatforms.length) {
    const byScreens = [...pool].sort((a, b) => b.screenCount - a.screenCount);
    const params = new URLSearchParams();
    // Web Apps and websites each open their own list in Webs; "web" (both) the section's whole list.
    if (platform === 'webapp' || (platform === 'site' && !websAll)) params.set('show', platform === 'webapp' ? 'webapps' : 'sites');
    // Web apps and sites are both in the Webs section, which an address names `web`.
    if (platform) params.set('platform', platform === 'ios' ? 'ios' : 'web');
    if (industry) params.set('industry', industry);
    const scopeLabel = kind || (negatedPlatforms.length ? `non-${negatedPlatforms.map((excluded) => PLATFORM_ADJECTIVE[excluded]).join('/')}` : '');
    const kindPage: NavTarget = { label: `All ${scopeLabel} apps`, hint: 'Apps', href: params.toString() ? `${INSPIRATIONS_ROUTES.apps}?${params}` : INSPIRATIONS_ROUTES.apps };
    if (byScreens.length === 0) {
      // None here, but some in the other section: say where they are rather than a dead end.
      const elsewhere = scope ? everyApp.filter((app) => (!industry || app.industry === industry) && onPlatform(app) && !scopedById.has(app.id)) : [];
      // Never naming the other section's apps here — only where to look.
      if (elsewhere.length) {
        const toWebs = Boolean(scope?.includes('ios'));
        const there = toWebs ? 'Webs' : 'Apps';
        const sp = new URLSearchParams(industry ? { industry } : {});
        if (toWebs) sp.set('platform', 'web');
        const href = sp.toString() ? `${INSPIRATIONS_ROUTES.apps}?${sp}` : INSPIRATIONS_ROUTES.apps;
        return { text: `There are no ${scopeLabel} apps in ${toWebs ? 'iOS' : 'Webs'} yet. ${there} has some.`, targets: [{ label: `${scopeLabel ? `${scopeLabel[0].toUpperCase()}${scopeLabel.slice(1)} apps` : 'Apps'} in ${there}`, hint: 'Section', href }] };
      }
      return { text: `There are no ${scopeLabel} apps in the library yet. If you’d like one added, choose Request apps in the profile menu.`, targets: [QUICK_PAGES[0]] };
    }
    const exceptNote = negatedApps.length ? ` (leaving out ${listNames(negatedApps.map((app) => app.name), 3)})` : '';
    if (asksCount) {
      return {
        text: `There ${byScreens.length === 1 ? 'is' : 'are'} ${plural(byScreens.length, `${scopeLabel} app`)}${exceptNote} — ${listNames(byScreens.map((app) => app.name), 4)}.`,
        targets: [kindPage, ...appResults(byScreens.slice(0, 3))],
        app: byScreens[0],
        results: appResults(byScreens),
      };
    }
    return { text: `Showing ${scopeLabel} apps${exceptNote}.`, targets: appResults(byScreens.slice(0, 3)), go: kindPage, results: appResults(byScreens) };
  }

  // "which apps do you have", "list all apps": the whole library.
  if (/^(?:(?:what|which|list|show|all|browse)\s+)*(?:all\s+)?apps?(?:\s+(?:do you have|are there|do you know|you have|available|list))?\s*\??$/i.test(original)) return allApps(apps);

  // "i am lost", "recommend something": a gentle way in.
  if (RECOMMEND.test(lower) && !mentioned.length) {
    return {
      text: `Not sure where to start? ${listNames(biggestApps.slice(0, 3).map((app) => app.name), 3)} have the most to explore, or I can pick one for you.`,
      targets: [...appResults(biggestApps.slice(0, 3)), { label: 'Surprise me', hint: 'Ask', href: '', ask: 'surprise me an app' }],
      results: appResults(biggestApps),
    };
  }

  // "surprise me", "a random app".
  if (RANDOM.test(lower) && /\bapps?\b|\bsurprise me\b|\bpick one for me\b/i.test(lower) && apps.length > 0) {
    const chosen = apps[Math.floor(Math.random() * apps.length)];
    return { text: `How about ${chosen.name}? ${describeApp(chosen).text}`, targets: followUps(chosen, null), go: appTarget(chosen), app: chosen };
  }

  if (screenType && WHICH_APPS.test(lower)) {
    const found = await appsWithScreens({ type: screenType.key }, index, scope);
    if (found) return found.apps.length ? { text: `${screenType.label} screens appear in ${listNames(found.apps.map((app) => app.name), 4)} (${plural(found.total, 'screen')}).`, targets: [{ label: `All ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) } : found.total > 0 ? { text: `${plural(found.total, `${screenType.label.toLowerCase()} screen`)} in the library.`, targets: [{ label: `All ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] } : { text: `No ${screenType.label.toLowerCase()} screens yet.`, targets: [QUICK_PAGES[1]] };
  }

  if (section?.tab === 'flows' && !asksCount) {
    const flowMatches = matchFlows(leftoverWords(working, everyApp), null, index);
    if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].name}” flow.`, targets: [], go: flowTarget(flowMatches[0], index, false), card: flowCard(flowMatches[0], index) };
    if (flowMatches.length > 1) return { text: 'A few flows match — which one?', targets: flowMatches.map((flow) => flowTarget(flow, index, true)), kind: 'clarify' };
  }

  // "how many patterns": those with a screen on the section.
  if (asksCount && /\bpatterns?\b/.test(lower) && !mentioned.length) {
    const here = scope ? patterns.filter((pattern) => pattern.screenIds.length > 0) : patterns;
    return { text: `The library has ${plural(here.length, 'pattern')}.`, targets: [PAGES.find((entry) => entry.target.label === 'Patterns')!.target] };
  }
  if (asksCount && !screenType) {
    // Websites counted apart: they have pages, not screens or flows.
    const sites = apps.filter(isWebsite);
    const appsOnly = apps.filter((app) => !isWebsite(app));
    const screens = appsOnly.reduce((sum, app) => sum + app.screenCount, 0);
    const flows = appsOnly.reduce((sum, app) => sum + app.flowCount, 0);
    const pages = sites.reduce((sum, app) => sum + (websitePages.get(app.id) ?? app.screenCount), 0);
    const sitePart = sites.length ? `, and ${plural(sites.length, 'site')} with ${plural(pages, 'page')}` : '';
    // In Webs the apps are web apps ("24 web apps … and 1 site"); in Apps, iOS apps are just apps.
    const appWord = scope && !scope.includes('ios') ? 'web app' : 'app';
    if (apps.length) return { text: `The library has ${plural(appsOnly.length, appWord)}, ${plural(screens, 'screen')} and ${plural(flows, 'flow')}${sitePart}.`, targets: QUICK_PAGES.slice(0, 4) };
  }

  if (screenType) {
    const go: NavTarget = { label: `${screenType.label} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` };
    if (websAppsOnly) return { text: `Showing ${screenType.label.toLowerCase()} screens.${sitesNote(`${screenType.label.toLowerCase()} screens`)}`, targets: siteTargets(), go };
    return { text: `Showing ${screenType.label.toLowerCase()} screens.`, targets: [], go };
  }

  // The suggestions match anywhere inside a name ("hi" is inside "Filter chips"),
  // so only a match that starts a word counts, and only a long-enough query may
  // open one without asking.
  const searchQuery = clean(working) || query;
  const startsAWord = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(searchQuery)}`, 'iu');
  let matches: NavTarget[] = [];
  try {
    matches = searchQuery.length >= 3 ? (await suggestQueries(searchQuery, 8, sectionPlatforms && !namesPlatform ? sectionPlatforms : undefined)).map(toTarget).filter((target) => startsAWord.test(target.label)).slice(0, 6) : [];
  } catch {
    // Fall through to a plain search link.
  }

  const exact = matches.find((target) => target.label.toLowerCase() === searchQuery);
  if (exact) return { text: `Opening ${exact.label}.`, targets: [], go: exact };
  if (matches.length === 1 && searchQuery.length >= 4) return { text: `Opening ${matches[0].label}.`, targets: [], go: matches[0] };
  if (matches.length >= 1) return { text: matches.length === 1 ? 'Did you mean this?' : 'A few matches — which one?', targets: matches, kind: 'clarify' };

  if (section?.tab === 'screens' && !question) {
    const topic = searchQuery.replace(/\b(?:screens?|pages?|ui|designs?|examples?|ideas?|screenshots?)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (topic.length >= 3) return { text: `Searching screens for “${topic}”.`, targets: [QUICK_PAGES[1]], go: { label: `Search for “${topic}”`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(topic) } };
  }
  if (section) {
    const sectionPage = PAGES.find((entry) => entry.target.label.toLowerCase() === section.label.toLowerCase())?.target;
    if (sectionPage) return { text: `Opening ${sectionPage.label}.`, targets: [], go: sectionPage };
  }

  // "give me inspiration", "show something cool", "surprise me": nothing specific to find, so a few good places to
  // start instead of "couldn't find it".
  if (INSPIRE.test(original)) {
    return {
      text: pick(['Here are a few good places to start. Pick one and I’ll take you there.', 'Happy to inspire! Start with one of these.']),
      targets: [
        { label: 'Newest screens', hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?sort=newest` },
        { label: 'Onboarding flows', hint: 'Flows', href: `${INSPIRATIONS_ROUTES.flows}?category=onboarding` },
        { label: 'Login screens', hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=login` },
        PAGES.find((entry) => entry.target.label === 'Patterns')!.target,
      ],
      kind: 'answer',
    };
  }

  // Quoted back short (a question has no length limit); the search itself uses all of it.
  const quoted = searchQuery.length > 40 ? `${searchQuery.slice(0, 39).trimEnd()}…` : searchQuery;
  const search: NavTarget = { label: `Search for “${quoted}”`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(searchQuery) };
  // A question (a "?", four words or more, or a question word first: "whats the weather today") gets the
  // polite "not something I know" answer, not "couldn't find it" as if it were a page name.
  const sounded = /\?\s*$/.test(original) || searchQuery.split(' ').length >= 4 || /^(?:what|what'?s|whats|how|why|who|when|where|which|is|are|can|could|do|does|will|should|tell me)\b/i.test(original.trim());
  return {
    text: sounded
      ? 'I’m Motvin Buddy, here to help you get around Motvin, so I can’t answer that one. I can open an app or page, tell you how many screens an app has, or search the library.'
      : `I couldn’t find “${quoted}” in Motvin. I can search the library for it. If it’s an app you’d like added, choose Request apps in the profile menu.`,
    targets: [search, ...QUICK_PAGES.slice(0, 3)],
    kind: 'fallback',
  };
}
