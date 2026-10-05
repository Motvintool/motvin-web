import { inspirationsApi } from './api';
import { correctText } from './fuzzy';
import { appsUsingPattern, loadIndex, type LibraryIndex } from './guideIndex';
import { asksElements, findElements, findFlowCategory, findNegations, findNumberFilter, findOrdinal, findPatterns, findStates, findStyles, findTopN, matchesNumber, splitIntents, withoutNegations, type NumberFilter } from './guideParse';
import { INSPIRATIONS_ROUTES } from './routes';
import { suggestQueries, type SearchSuggestion } from './search';
import { EMPTY_FILTERS } from './filters';
import { applySynonyms, findIndustry, findPlatform, findPlatforms, PLATFORM_LABEL, stripChatter } from './synonyms';
import { elementLabel, flowCategoryLabel, INDUSTRY_LABEL, SCREEN_STATE_LABEL, SCREEN_TYPE_LABEL, STYLE_LABEL } from './taxonomy';
import { FLOW_CATEGORY_PRESETS, type App, type Flow, type Pattern, type Platform, type SavedItemType, type ScreenState, type ScreenType, type Style } from './types';

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
export type NavCard = { title: string; iconSrc?: string; facts: string[]; href?: string; columns?: string[]; rows?: { label: string; values: string[] }[] };
/** Something the guide may do for the visitor, once they confirm it. */
export type GuideAction = { kind: 'save'; item: { type: SavedItemType; id: string }; label: string } | { kind: 'copy'; href: string; label: string };
export type ReplyKind = 'nav' | 'answer' | 'clarify' | 'fallback' | 'smalltalk' | 'error' | 'action';
export type NavReply = { text: string; targets: NavTarget[]; go?: NavTarget; card?: NavCard; app?: App; error?: boolean; kind?: ReplyKind; action?: GuideAction; results?: NavTarget[] };
/** What the guide knows going in: the app being talked about, what it last listed, and the page the visitor is on. */
export type NavContext = { app: App | null; results?: NavTarget[] | null; page?: { pathname: string; search?: string } | null };

const PAGES: { keys: string[]; target: NavTarget }[] = [
  { keys: ['explore', 'home', 'inspirations', 'start'], target: { label: 'Explore', hint: 'Home', href: INSPIRATIONS_ROUTES.explore } },
  { keys: ['apps', 'all apps', 'app list', 'browse apps'], target: { label: 'Apps', hint: 'Page', href: INSPIRATIONS_ROUTES.apps } },
  { keys: ['screens', 'all screens', 'screenshots'], target: { label: 'Screens', hint: 'Page', href: INSPIRATIONS_ROUTES.screens } },
  { keys: ['flows', 'flow', 'user flows', 'all flows'], target: { label: 'Flows', hint: 'Page', href: INSPIRATIONS_ROUTES.flows } },
  { keys: ['ui elements', 'ui element', 'elements', 'components'], target: { label: 'UI elements', hint: 'Page', href: INSPIRATIONS_ROUTES.uiElements } },
  { keys: ['patterns', 'pattern'], target: { label: 'Patterns', hint: 'Page', href: INSPIRATIONS_ROUTES.patterns } },
  { keys: ['collections', 'collection', 'boards', 'saved', 'my boards'], target: { label: 'Collections', hint: 'Page', href: INSPIRATIONS_ROUTES.collections } },
  { keys: ['icons', 'icon library'], target: { label: 'Icon library', hint: 'Page', href: '/icons' } },
];

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
const SAFE_TYPES = new Set(['splash', 'onboarding', 'login', 'signup', 'checkout', 'cart', 'pricing', 'permission', 'landing', 'dashboard']);

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
  const full = apps.filter((app) => hasWord(lower, app.name.toLowerCase()));
  if (full.length) return full;
  // "Zoho Corporation" is just "zoho" to a visitor.
  return apps.filter((app) => {
    const first = app.name.toLowerCase().split(/\s+/)[0];
    return first.length >= 4 && hasWord(lower, first);
  });
}

const words = (text: string) => text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

const appTarget = (app: App, tab?: Section['tab']): NavTarget => ({
  label: app.name,
  hint: `App · ${app.screenCount} screens`,
  href: tab && tab !== 'screens' ? `${INSPIRATIONS_ROUTES.app(app)}?tab=${tab}` : INSPIRATIONS_ROUTES.app(app),
  iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
});

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

/** "Swiggy", "Swiggy and Zomato", "Swiggy, Zomato and 3 more". */
function listNames(names: string[], show = 3): string {
  if (names.length <= show) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] ?? '');
  return `${names.slice(0, show).join(', ')} and ${names.length - show} more`;
}

/** Likely next questions about an app, minus the one just answered. */
function followUps(app: App, used: Section['tab'] | 'count' | null): NavTarget[] {
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

async function countScreens(filters: { type?: string; states?: ScreenState[]; styles?: Style[]; element?: string }, app: App | null): Promise<number | null> {
  try {
    const page = await inspirationsApi.listScreens({ ...EMPTY_FILTERS, screenTypes: filters.type ? [filters.type as ScreenType] : [], states: filters.states ?? [], styles: filters.styles ?? [] }, 0, 'curated', { ...(app ? { app: app.id } : {}), ...(filters.element ? { element: filters.element } : {}) });
    return page.total;
  } catch {
    return null;
  }
}

/** The apps a kind of screen appears in, read off the first page of matching screens. */
async function appsWithScreens(filters: { type?: string; states?: ScreenState[]; styles?: Style[]; element?: string }, index: LibraryIndex): Promise<{ apps: App[]; total: number } | null> {
  try {
    const page = await inspirationsApi.listScreens({ ...EMPTY_FILTERS, screenTypes: filters.type ? [filters.type as ScreenType] : [], states: filters.states ?? [], styles: filters.styles ?? [] }, 0, 'curated', filters.element ? { element: filters.element } : {});
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

function answerRanking(list: App[], ranking: Ranking, scopeLabel: string | null, topN: number | null): NavReply {
  const scope = scopeLabel ? `Among ${scopeLabel}, ` : '';
  // After "Among … apps," a leading "The" drops to lower case; a brand name keeps its capital.
  const sentence = (text: string) => (scope ? `${scope}${text.startsWith('The ') ? `the${text.slice(3)}` : text}` : text);
  if (ranking.metric === 'rating') {
    const rated = list.filter((app) => app.rating !== null).sort((a, b) => (ranking.order === 'high' ? (b.rating ?? 0) - (a.rating ?? 0) : (a.rating ?? 0) - (b.rating ?? 0)));
    if (rated.length === 0) return { text: 'No ratings have been recorded yet.', targets: QUICK_PAGES.slice(0, 3) };
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
  const count = (app: App) => (ranking.metric === 'flows' ? app.flowCount : app.screenCount);
  const ordered = [...list].sort((a, b) => (ranking.order === 'high' ? count(b) - count(a) : count(a) - count(b)));
  const noun = ranking.metric;
  if (topN && topN > 1) {
    const shown = ordered.slice(0, topN).map((app) => `${app.name} (${count(app).toLocaleString()})`);
    return { text: sentence(`The top ${Math.min(topN, ordered.length)} by ${noun}: ${listNames(shown, topN)}.`), targets: appResults(ordered.slice(0, topN)), app: ordered[0], results: appResults(ordered) };
  }
  const [first, second] = ordered;
  const lead = `${first.name} has the ${ranking.order === 'high' ? 'most' : 'fewest'} ${noun} (${count(first).toLocaleString()})`;
  const tail = second ? `, followed by ${second.name} (${count(second).toLocaleString()})` : '';
  return { text: sentence(`${lead}${tail}.`), targets: appResults(ordered.slice(0, 3)), app: first, results: appResults(ordered) };
}

/** Two or three apps side by side: the sentence the chat shows, and a card with the numbers lined up. */
function compareApps(list: App[]): NavReply {
  const shown = list.slice(0, 3);
  const facts = (app: App) => `${app.name} has ${plural(app.screenCount, 'screen')} and ${plural(app.flowCount, 'flow')}`;
  const kind = (app: App) => INDUSTRY_LABEL[app.industry] ?? app.industry;
  const where = (app: App) => (app.platforms?.length ? app.platforms.map((platform) => PLATFORM_LABEL[platform]).join(', ') : '—');
  const rating = (app: App) => (app.rating === null || app.rating === undefined ? '—' : app.rating.toFixed(1));
  return {
    text: shown.map((app) => `${facts(app)}.`).join(' '),
    targets: appResults(shown),
    card: {
      title: 'Side by side',
      facts: [],
      columns: shown.map((app) => app.name),
      rows: [
        { label: 'Screens', values: shown.map((app) => app.screenCount.toLocaleString()) },
        { label: 'Flows', values: shown.map((app) => app.flowCount.toLocaleString()) },
        { label: 'Platforms', values: shown.map(where) },
        { label: 'Category', values: shown.map(kind) },
        { label: 'Rating', values: shown.map(rating) },
      ],
    },
    results: appResults(shown),
  };
}

const GREETING = /^(hi+|hello+|hey+|hola|yo|howdy|good (morning|afternoon|evening)|sup|namaste|vanakkam)\b[\s!.?]*$/i;
const THANKS = /^(thanks?|thank you|thx|ty|ok(ay)?|cool|great|nice|awesome)\b[\s!.?]*$/i;
const HELP = /^(help|what can you do|what do you do|how (does this|do you) work|what is this)\b[\s!.?]*$/i;
const WHO = /\b(who are you|who made you|who built you|are you (an? )?(ai|bot|human|real))\b/i;
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
const INFO = /\b(?:tell me (?:more )?about|what is|what's|whats|who is|info(?:rmation)? (?:on|about)|details (?:on|about|of)|describe|overview of|more about|know about)\b/i;
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

const ON_LABEL: Record<Platform, string> = { web: 'the web', ios: 'iOS', android: 'Android' };
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
  return {
    text: `${app.name} is ${article(kind)} ${kind} app${where}, with ${plural(app.screenCount, 'screen')} and ${plural(app.flowCount, 'flow')}.`,
    targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)],
    card: { title: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, facts: [kind, ...(app.platforms?.length ? [app.platforms.map((platform) => PLATFORM_LABEL[platform]).join(' · ')] : []), plural(app.screenCount, 'screen'), plural(app.flowCount, 'flow')], href: INSPIRATIONS_ROUTES.app(app) },
    app,
  };
}

/** The app the visitor is looking at, read off the address. */
function appOnPage(context: NavContext | undefined, index: LibraryIndex): App | null {
  const match = /^\/inspirations\/app\/([^/?#]+)/.exec(context?.page?.pathname ?? '');
  return match ? (index.appBySlug.get(decodeURIComponent(match[1])) ?? null) : null;
}

function patternOnPage(context: NavContext | undefined, index: LibraryIndex): Pattern | null {
  const match = /^\/inspirations\/pattern\/([^/?#]+)/.exec(context?.page?.pathname ?? '');
  return match ? (index.patterns.find((pattern) => pattern.slug === decodeURIComponent(match[1])) ?? null) : null;
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
async function answerAboutApp(app: App, text: string, question: boolean, yesNo: boolean, section: Section | null, screenType: TypeHit | null, asksCount: boolean): Promise<NavReply | null> {
  const rest = withoutNames(text, [app]);
  const platformsAsked = findPlatforms(rest);
  const wantsMobile = MOBILE.test(rest) && platformsAsked.length === 0;
  const kind = INDUSTRY_LABEL[app.industry] ?? app.industry;

  // Where it runs.
  if (platformsAsked.length > 0 || wantsMobile || PLATFORM_ASKED.test(rest)) {
    if (!app.platforms?.length) return { text: `${app.name} doesn’t list a platform yet.`, targets: [appTarget(app)], app };
    const onAll = `${app.name} is on ${platformList(app)}.`;
    if (wantsMobile) {
      const mobile = app.platforms.some((platform) => platform !== 'web');
      return { text: mobile ? `Yes — ${onAll}` : `No — ${app.name} isn’t on mobile. It’s on ${platformList(app)}.`, targets: [appTarget(app)], app };
    }
    if (platformsAsked.length === 1) {
      const asked = platformsAsked[0];
      const on = app.platforms.includes(asked);
      const text = on ? (yesNo ? `Yes — ${onAll}` : onAll) : `${yesNo ? 'No — ' : ''}${app.name} isn’t on ${ON_LABEL[asked]}. It’s on ${platformList(app)}.`;
      // "show Swiggy on Android" still opens Swiggy when it is there; a question never navigates.
      return { text, targets: [appTarget(app), ...followUps(app, null).slice(0, 2)], go: !question && on ? appTarget(app) : undefined, app };
    }
    return { text: onAll, targets: [appTarget(app), ...followUps(app, null).slice(0, 2)], app };
  }

  // What kind of app it is.
  const industryAsked = findIndustry(rest);
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
      const total = await countScreens({ type: screenType.key }, app);
      if (total !== null) {
        const see: NavTarget = { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${screenType.label.toLowerCase()}`) };
        return total > 0
          ? { text: `Yes — ${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`, targets: [see, ...followUps(app, 'count').slice(0, 2)], app }
          : { text: `No — ${app.name} has no ${screenType.label.toLowerCase()} screens.`, targets: followUps(app, null), app };
      }
    }
    if (section?.tab === 'flows') {
      return app.flowCount > 0
        ? { text: `Yes — ${app.name} has ${plural(app.flowCount, 'flow')}.`, targets: [{ ...appTarget(app, 'flows'), label: `${app.name} flows` }, ...followUps(app, 'flows').slice(0, 2)], app }
        : { text: `No — ${app.name} has no flows yet.`, targets: followUps(app, 'flows'), app };
    }
    if (section?.tab === 'screens') return { text: `Yes — ${app.name} has ${plural(app.screenCount, 'screen')}.`, targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)], app };
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

export async function resolveNavigation(raw: string, context?: NavContext): Promise<NavReply> {
  const trimmed = stripChatter(raw.trim().slice(0, 240));
  const parts = splitIntents(trimmed);
  if (parts.length === 1) return classify(await resolveWithNotes(parts[0], context));

  // "open zomato and show its flows": each part in turn, each knowing what the one before found.
  let working: NavContext = { app: context?.app ?? null, results: context?.results ?? null, page: context?.page ?? null };
  const texts: string[] = [];
  let last: NavReply | null = null;
  let go: NavTarget | undefined;
  for (const part of parts) {
    const reply = classify(await resolveWithNotes(part, working));
    texts.push(reply.text);
    if (reply.app) working = { ...working, app: reply.app };
    if (reply.results) working = { ...working, results: reply.results };
    if (reply.go) go = reply.go;
    last = reply;
  }
  if (!last) return classify(await resolveWithNotes(trimmed, context));
  return classify({ ...last, text: texts.join(' '), go, kind: undefined });
}

async function resolveWithNotes(text: string, context: NavContext | undefined): Promise<NavReply> {
  const notes: string[] = [];
  const reply = await resolveInner(text, context, notes);
  // Say so when a misspelling was read as something, but only if the answer acted on it.
  if (notes.length > 0 && !reply.error && (reply.go || reply.card || reply.app)) {
    return { ...reply, text: `${reply.text} (I read ${listNames(notes, 3)}.)` };
  }
  return reply;
}

async function resolveInner(raw: string, context: NavContext | undefined, notes: string[]): Promise<NavReply> {
  const original = stripChatter(raw.trim().slice(0, 200));
  if (APOLOGY.test(original)) return { text: 'No problem at all. Where would you like to go?', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (GREETING.test(original)) return { text: pick(['Hi! Where would you like to go? Tell me an app or a page, or pick one below.', 'Hello! What are you looking for today? An app, a page, or a type of screen?', 'Hey there! Say an app or page and I’ll take you straight to it.']), targets: QUICK_PAGES, kind: 'smalltalk' };
  if (THANKS.test(original)) return { text: pick(['Anytime. Tell me where to go next.', 'Happy to help. Where to next?', 'You’re welcome. Anything else you’d like to see?']), targets: [], kind: 'smalltalk' };
  if (HOW_ARE_YOU.test(original)) return { text: 'Doing great, thanks for asking! Where would you like to go?', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  if (WHO.test(original)) return { text: 'I’m the Motvin guide. I help you find apps, screens and flows, and answer quick questions like how many screens an app has.', targets: QUICK_PAGES.slice(0, 4), kind: 'smalltalk' };
  // "what is this" while looking at an app or a pattern asks about that, not for help.
  const lookingAtSomething = Boolean(context?.app) || /^\/inspirations\/(?:app|pattern)\//.test(context?.page?.pathname ?? '');
  if (HELP.test(original) && !(lookingAtSomething && /^what is this\??$/i.test(original))) {
    return { text: 'I take you around Motvin and answer quick questions like “how many screens does Swiggy have?”. Try “open Zomato”, “Swiggy flows”, “food apps”, “web apps”, “empty states”, “bottom sheets” or “login screens”.', targets: QUICK_PAGES, kind: 'smalltalk' };
  }
  const query = clean(original);
  const page = pageFor(query);
  const isAppsPage = page?.target.href === QUICK_PAGES[0].href;
  // "i want app" says nothing but that they want apps; like "apps" itself, it is answered once the apps are known.
  const wantsApps = isAppsPage || (!query && /\bapps?\b/i.test(original));
  if (!query && !wantsApps) return { text: 'Tell me where to go — an app, a page like Flows or Screens, or something to search for.', targets: QUICK_PAGES, kind: 'fallback' };

  if (page && !isAppsPage) return { text: pick([`Opening ${page.target.label}.`, `Taking you to ${page.target.label}.`, `Here’s the ${page.target.label} page.`]), targets: [], go: page.target };

  const index = await loadIndex();
  const { apps, patterns, elements, meta } = index;
  const unreachable = !index.reachable;
  const elementKinds = elements.map((element) => element.kind);
  const flowCategories = meta?.taxonomy.flowCategories ?? [];

  // Read the question the way it was meant: fix confident misspellings, then fold
  // everyday wording ("sign in", "buy") into the library's own words.
  const typed = original.toLowerCase();
  const fixed = unreachable ? { text: typed, corrections: [] } : correctText(typed, index.vocabulary);
  const shownAs = new Map<string, string>();
  for (const app of apps) words(app.name).forEach((word) => shownAs.set(word, app.name.split(/\s+/).find((part) => part.toLowerCase() === word) ?? word));
  fixed.corrections.forEach((change) => notes.push(`“${change.from}” as “${shownAs.get(change.to) ?? change.to}”`));
  const lowerAll = applySynonyms(fixed.text);

  // What is ruled out — "except Swiggy", "not Zomato" — is read first and taken out of the sentence.
  const negatedPhrases = findNegations(lowerAll);
  const negatedApps = negatedPhrases.flatMap((phrase) => findApps(phrase, apps));
  const negatedPlatforms = negatedPhrases.flatMap((phrase) => findPlatforms(phrase));
  const lower = negatedPhrases.length ? withoutNegations(lowerAll) : lowerAll;
  const working = lower;

  // A misspelt page name ("flwos") is still a page.
  if (fixed.corrections.length > 0) {
    const fixedPage = pageFor(clean(working));
    if (fixedPage) return { text: `Opening ${fixedPage.target.label}.`, targets: [], go: fixedPage.target };
  }

  const asksCount = /\bhow (many|much)\b|\b(count|number of|total)\b/.test(lower);
  const section = findSection(lower);
  const screenType = section?.tab === 'flows' ? null : findScreenType(lower);
  const states = findStates(lower);
  const styles = findStyles(lower);
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

  // Where the visitor is: the app or pattern page they have open is a subject too.
  const pageApp = appOnPage(context, index);
  const pagePattern = patternOnPage(context, index);
  if (WHERE_AM_I.test(lower)) {
    if (pageApp) return { ...describeApp(pageApp), text: `You’re looking at ${pageApp.name}. ${describeApp(pageApp).text}` };
    if (pagePattern) return { text: `You’re looking at the “${pagePattern.name}” pattern (${pagePattern.category}).`, targets: [patternTarget(pagePattern), ...appsUsingPattern(index, pagePattern).slice(0, 3).map((app) => appTarget(app))], card: patternCard(pagePattern, index) };
    const where = PAGES.find((entry) => entry.target.href === (context?.page?.pathname ?? '').replace(/\/$/, ''));
    return { text: where ? `You’re on the ${where.target.label} page.` : 'You’re in Motvin Inspirations. Tell me an app or a page and I’ll take you there.', targets: QUICK_PAGES.slice(0, 4) };
  }

  if (wantsApps) return allApps(apps);

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

  let mentioned = findApps(lower, apps).filter((app) => !negatedApps.includes(app));
  // "its flows", "is this on iOS" — the app from the last answer.
  const subject = context?.app ?? pageApp ?? null;
  if (!mentioned.length && subject && REFERS_BACK.test(lower) && asksAboutAnApp && !(INFO.test(lower) && clean(lower.replace(INFO, ' ')).split(' ').filter((word) => word && !/^(it|its|this|that|one|app|here)$/.test(word)).length > 0)) mentioned = [subject];
  // "how many screens?" straight after opening Zomato means Zomato's screens. The
  // app being talked about is the subject of any question about app facts, unless
  // the question widens itself: "in the whole library", "all apps", "which app has…".
  const widened = LIBRARY_SCOPE.test(lower) || /\bapps\b/i.test(lower) || findRanking(lower) !== null || COMPARE.test(lower) || findIndustry(lower) !== null || WHICH_APPS.test(lower);
  // "what is this" carries to the app; "what is the meaning of life" does not — when the only
  // sign of an app question is a "what is / tell me about" opener, the rest must be nothing but a pronoun.
  const onlyInfo = INFO.test(lower) && !(section || asksCount || screenType || states.length || styles.length || findPlatform(lower) || PLATFORM_ASKED.test(lower) || INDUSTRY_ASKED.test(lower) || RATING_ASKED.test(lower) || SAVE.test(lower) || COPY.test(lower) || SIMILAR.test(lower));
  const infoRest = clean(lower.replace(INFO, ' ')).split(' ').filter((word) => word && !/^(it|its|this|that|one|app|here)$/.test(word));
  const vagueInfo = onlyInfo && infoRest.length > 0;
  const carried = !mentioned.length && Boolean(subject) && asksAboutAnApp && !widened && !vagueInfo;
  if (carried && subject) mentioned = [subject];
  // A way back out to the whole library, offered whenever the app was assumed.
  const wholeLibrary: NavTarget[] = carried ? [{ label: 'Whole library', hint: 'Ask', href: '', ask: `${original.replace(/\?\s*$/, '')} in the whole library` }] : [];

  // Things named in the library beyond apps: patterns, UI elements, flow categories.
  // On a pattern page, "this" / "it" is that pattern.
  const foundPatterns = findPatterns(working, patterns);
  const namedPatterns = foundPatterns.length ? foundPatterns : pagePattern && !findApps(lower, apps).length && (REFERS_BACK.test(lower) || /\bpattern\b/.test(lower)) ? [pagePattern] : [];
  const namedElements = findElements(working, elementKinds);
  const flowCategory = findFlowCategory(working, flowCategories);
  const askedFlowCategory = findFlowCategory(working, [...FLOW_CATEGORY_PRESETS]);
  const numberFilter = findNumberFilter(lower);
  const topN = findTopN(lower);

  // Save and copy: small, safe, and always confirmed by the visitor first.
  if (SAVE.test(lower) || COPY.test(lower)) {
    const target = mentioned[0] ?? subject;
    if (!target && pagePattern && SAVE.test(lower)) return { text: `Save the “${pagePattern.name}” pattern to a collection?`, targets: [], action: { kind: 'save', item: { type: 'pattern', id: pagePattern.id }, label: pagePattern.name }, kind: 'action' };
    if (!target) return { text: 'Which app would you like to save or share? Name it, or open it first.', targets: appResults([...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 4)), kind: 'clarify' };
    if (COPY.test(lower)) {
      const href = INSPIRATIONS_ROUTES.app(target);
      return { text: `Copy the link to ${target.name}?`, targets: [appTarget(target)], action: { kind: 'copy', href, label: target.name }, app: target, kind: 'action' };
    }
    return { text: `Save ${target.name} to a collection?`, targets: [appTarget(target)], action: { kind: 'save', item: { type: 'app', id: target.id }, label: target.name }, app: target, kind: 'action' };
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
      const total = await countScreens({ element: kind }, app);
      const label = elementLabel(kind).toLowerCase();
      const go = { ...appTarget(app, 'ui-elements'), label: `${app.name} UI elements` };
      if (total === null) return { text: `Opening ${app.name}’s UI elements.`, targets: followUps(app, 'ui-elements'), go, app };
      if (total === 0) return { text: `${yesNo ? 'No — ' : ''}${app.name} has no screens with ${label}s.`, targets: [go, ...followUps(app, 'ui-elements').slice(0, 2)], app };
      return { text: `${yesNo ? 'Yes — ' : ''}${app.name} has ${plural(total, 'screen')} with ${label}s.`, targets: [go, ...followUps(app, 'ui-elements').slice(0, 2)], go: question ? undefined : go, app };
    }

    // Screens in a certain state or style inside one app.
    if ((states.length || styles.length) && !asksCount) {
      const what = [...styles.map((style) => STYLE_LABEL[style].toLowerCase()), ...states.map((state) => SCREEN_STATE_LABEL[state].toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
      const total = await countScreens({ type: screenType?.key, states, styles }, app);
      const go: NavTarget = { label: `${app.name} ${what} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${what}`) };
      if (yesNo && total !== null) return total > 0 ? { text: `Yes — ${app.name} has ${plural(total, `${what} screen`)}.`, targets: [go, ...followUps(app, null).slice(0, 2)], app } : { text: `No — ${app.name} has no ${what} screens.`, targets: followUps(app, null), app };
      return { text: total !== null && total > 0 ? `${app.name} has ${plural(total, `${what} screen`)}. Showing them.` : `Showing ${app.name}’s ${what} screens.`, targets: followUps(app, null).slice(0, 2), go, app };
    }
    if ((states.length || styles.length) && asksCount) {
      const what = [...styles.map((style) => STYLE_LABEL[style].toLowerCase()), ...states.map((state) => SCREEN_STATE_LABEL[state].toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
      const total = await countScreens({ type: screenType?.key, states, styles }, app);
      if (total !== null) return { text: `${app.name} has ${plural(total, `${what} screen`)}.`, targets: [...wholeLibrary, { label: `See them`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${what}`) }, ...followUps(app, 'count').slice(0, 1)], app };
    }

    // A flow of a certain kind inside one app.
    if (flowCategory && !asksCount) {
      const inCategory = index.flows.filter((flow) => flow.appId === app.id && flow.category === flowCategory);
      const label = flowCategoryLabel(flowCategory).toLowerCase();
      if (inCategory.length === 1) return { text: `Opening ${app.name}’s ${label} flow, “${inCategory[0].name}”.`, targets: followUps(app, 'flows').slice(0, 2), go: flowTarget(inCategory[0], index, false), card: flowCard(inCategory[0], index), app };
      if (inCategory.length > 1) return { text: `${app.name} has ${plural(inCategory.length, `${label} flow`)} — which one?`, targets: inCategory.slice(0, 6).map((flow) => flowTarget(flow, index, false)), app, kind: 'clarify' };
      if (index.flows.some((flow) => flow.appId === app.id)) return { text: `${app.name} has no ${label} flow recorded. Here are all its flows.`, targets: followUps(app, 'flows'), go: { ...appTarget(app, 'flows'), label: `${app.name} flows` }, app };
    }

    const fact = await answerAboutApp(app, lower, question, yesNo, section, screenType, asksCount);
    if (fact) return fact;
    if (asksCount && screenType) {
      const total = await countScreens({ type: screenType.key }, app);
      if (total !== null) {
        return {
          text: `${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`,
          targets: [...wholeLibrary, { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${screenType.label.toLowerCase()}`) }, ...followUps(app, 'count').slice(0, 2)],
          app,
        };
      }
    }
    if (section?.tab === 'flows' && !asksCount) {
      const flowMatches = matchFlows(leftoverWords(working, apps), app, index);
      if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].name}” flow.`, targets: followUps(app, 'flows').slice(0, 2), go: flowTarget(flowMatches[0], index, false), card: flowCard(flowMatches[0], index), app };
      if (flowMatches.length > 1) return { text: `${app.name} has a few flows like that — which one?`, targets: flowMatches.map((flow) => flowTarget(flow, index, false)), app, kind: 'clarify' };
    }
    if (asksCount) {
      const saysFlows = hasWord(lower, 'flows') || hasWord(lower, 'flow');
      const saysScreens = hasWord(lower, 'screens') || hasWord(lower, 'screen');
      const neither = !saysFlows && !saysScreens;
      const parts = [saysScreens || neither ? plural(app.screenCount, 'screen') : '', saysFlows || neither ? plural(app.flowCount, 'flow') : ''].filter(Boolean);
      return {
        text: `${app.name} has ${parts.join(' and ')}.`,
        targets: [...wholeLibrary, appTarget(app), ...followUps(app, 'count').slice(0, 2)],
        card: { title: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, facts: [plural(app.screenCount, 'screen'), plural(app.flowCount, 'flow')], href: INSPIRATIONS_ROUTES.app(app) },
        app,
      };
    }
    if (screenType) {
      const search = `${app.name} ${screenType.label.toLowerCase()}`;
      const go: NavTarget = { label: `${app.name} ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(search) };
      const allOfType: NavTarget[] = carried ? [{ label: `All ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] : [];
      return { text: `Showing ${app.name}’s ${screenType.label.toLowerCase()} screens.`, targets: [...allOfType, ...followUps(app, null).slice(0, 2)], go, app };
    }
    if (section) {
      const go = { ...appTarget(app, section.tab), label: `${app.name} ${section.label}` };
      return { text: pick([`Opening ${app.name}’s ${section.label}.`, `Here are ${app.name}’s ${section.label}.`]), targets: followUps(app, section.tab), go, app };
    }
    if (question && !section && !screenType) return describeApp(app);
    return { text: pick([`Opening ${app.name}.`, `Taking you to ${app.name}.`, `Here’s ${app.name}.`]), targets: followUps(app, null), go: appTarget(app), app };
  }

  if (mentioned.length > 1 && COMPARE.test(lower)) return compareApps(mentioned);

  if (mentioned.length > 1) return { text: 'Which app do you mean?', targets: mentioned.slice(0, 6).map((app) => appTarget(app, section?.tab)), results: appResults(mentioned), kind: 'clarify' };

  // "apps except Swiggy": everything but.
  if (negatedApps.length > 0 && !findIndustry(lower) && !findPlatform(lower) && !numberFilter && !findRanking(lower)) {
    const rest = apps.filter((app) => !negatedApps.includes(app)).sort((a, b) => b.screenCount - a.screenCount);
    if (rest.length === 0) return { text: `That leaves no apps — ${listNames(negatedApps.map((app) => app.name), 3)} ${negatedApps.length === 1 ? 'is' : 'are'} all there is.`, targets: [QUICK_PAGES[0]] };
    return { text: `Apart from ${listNames(negatedApps.map((app) => app.name), 3)}: ${listNames(rest.map((app) => app.name), 4)}.`, targets: appResults(rest.slice(0, 4)), results: appResults(rest) };
  }

  // A pattern, named or by category, across the library.
  if (namedPatterns.length > 0) {
    if (namedPatterns.length === 1) {
      const pattern = namedPatterns[0];
      const used = appsUsingPattern(index, pattern);
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
  if (namedElements.length > 0 && !screenType && (!section || section.tab === 'screens') && !(section?.tab === 'screens' && states.length)) {
    const kind = namedElements[0];
    const label = elementLabel(kind).toLowerCase();
    const count = elements.find((element) => element.kind === kind)?.count ?? 0;
    const go: NavTarget = { label: `${elementLabel(kind)} examples`, hint: 'UI elements', href: `${INSPIRATIONS_ROUTES.uiElements}?element=${encodeURIComponent(kind)}` };
    if (WHICH_APPS.test(lower) || asksCount) {
      const found = await appsWithScreens({ element: kind }, index);
      if (found && found.apps.length) return { text: `${plural(count || found.total, 'screen')} have ${label}s, in ${listNames(found.apps.map((app) => app.name), 4)}.`, targets: [go, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) };
      return { text: count ? `${plural(count, 'screen')} have ${label}s.` : `No screens with ${label}s yet.`, targets: [go] };
    }
    return { text: count ? `Showing ${label}s — ${plural(count, 'screen')}.` : `Showing ${label}s.`, targets: [], go };
  }
  if (asksElements(lower) && (!section || section.tab === 'ui-elements') && !mentioned.length && !asksCount) {
    const top = [...elements].sort((a, b) => b.count - a.count).slice(0, 5);
    const target = PAGES.find((entry) => entry.target.label === 'UI elements')!.target;
    return { text: top.length ? `The most common UI elements: ${listNames(top.map((element) => `${elementLabel(element.kind).toLowerCase()}s (${element.count})`), 5)}.` : 'Opening UI elements.', targets: top.slice(0, 4).map((element) => ({ label: elementLabel(element.kind), hint: 'UI elements', href: `${INSPIRATIONS_ROUTES.uiElements}?element=${encodeURIComponent(element.kind)}` })), go: target };
  }

  // Screens by state or style across the library — "empty states", "dark mode screens", "loading login screens".
  if (states.length || styles.length) {
    const what = [...styles.map((style) => STYLE_LABEL[style].toLowerCase()), ...states.map((state) => SCREEN_STATE_LABEL[state].toLowerCase()), screenType ? screenType.label.toLowerCase() : ''].filter(Boolean).join(' ');
    const params = new URLSearchParams();
    if (screenType) params.set('type', screenType.key);
    if (states.length) params.set('state', states.join(','));
    if (styles.length) params.set('style', styles.join(','));
    const go: NavTarget = { label: `${what.charAt(0).toUpperCase()}${what.slice(1)} screens`, hint: 'Screens', href: `${INSPIRATIONS_ROUTES.screens}?${params}` };
    if (WHICH_APPS.test(lower) || asksCount) {
      const found = await appsWithScreens({ type: screenType?.key, states, styles }, index);
      if (found) return found.total > 0 ? { text: `The library has ${plural(found.total, `${what} screen`)}${found.apps.length ? `, in ${listNames(found.apps.map((app) => app.name), 4)}` : ''}.`, targets: [go, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) } : { text: `No ${what} screens yet.`, targets: [QUICK_PAGES[1]] };
    }
    return { text: `Showing ${what} screens.`, targets: [], go };
  }

  if (askedFlowCategory && !flowCategory) return { text: `No ${flowCategoryLabel(askedFlowCategory).toLowerCase()} flows yet.`, targets: [QUICK_PAGES[2]] };

  // A kind of flow across the library — "onboarding flows", "which apps have a checkout flow".
  if (flowCategory) {
    const inCategory = index.flows.filter((flow) => flow.category === flowCategory);
    const label = flowCategoryLabel(flowCategory);
    const go: NavTarget = { label: `${label} flows`, hint: 'Flows', href: `${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(flowCategory)}` };
    const owners = [...new Map(inCategory.map((flow) => [flow.appId, index.appById.get(flow.appId)])).values()].filter((app): app is App => Boolean(app));
    if (WHICH_APPS.test(lower) || asksCount) {
      return inCategory.length
        ? { text: `There ${inCategory.length === 1 ? 'is' : 'are'} ${plural(inCategory.length, `${label.toLowerCase()} flow`)}, in ${listNames(owners.map((app) => app.name), 4)}.`, targets: [go, ...appResults(owners.slice(0, 3))], results: appResults(owners) }
        : { text: `No ${label.toLowerCase()} flows yet.`, targets: [QUICK_PAGES[2]] };
    }
    if (inCategory.length === 1) return { text: `Opening the one ${label.toLowerCase()} flow, “${inCategory[0].name}” from ${index.appById.get(inCategory[0].appId)?.name ?? 'the library'}.`, targets: [], go: flowTarget(inCategory[0], index, false), card: flowCard(inCategory[0], index) };
    const singular = /\bflow\b/.test(lower) && !/\bflows\b/.test(lower);
    if (singular && inCategory.length > 1 && inCategory.length <= 6) return { text: `A few ${label.toLowerCase()} flows — which one?`, targets: [...inCategory.map((flow) => flowTarget(flow, index, true)), go], kind: 'clarify' };
    return { text: inCategory.length ? `Showing ${plural(inCategory.length, `${label.toLowerCase()} flow`)}.` : `Showing ${label.toLowerCase()} flows.`, targets: appResults(owners.slice(0, 3)), go, results: appResults(owners) };
  }

  // Questions about the apps themselves, from the library's own numbers: what kind
  // they are (food, fintech), where they run (web, iOS, Android), how big they are.
  const industry = findIndustry(lower);
  const platform = findPlatform(lower);
  const kind = [industry ? INDUSTRY_LABEL[industry] : '', platform ? PLATFORM_LABEL[platform] : ''].filter(Boolean).join(' ');
  let pool = apps.filter((app) => (!industry || app.industry === industry) && (!platform || app.platforms?.includes(platform)) && !negatedApps.includes(app) && !negatedPlatforms.some((excluded) => app.platforms?.includes(excluded)));
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
  if (ranking && pool.length > 0) return answerRanking(pool, ranking, kind ? `${kind} apps` : null, topN);
  if (industry || platform || negatedPlatforms.length) {
    const byScreens = [...pool].sort((a, b) => b.screenCount - a.screenCount);
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (industry) params.set('industry', industry);
    const scopeLabel = kind || (negatedPlatforms.length ? `non-${negatedPlatforms.map((excluded) => PLATFORM_LABEL[excluded]).join('/')}` : '');
    const kindPage: NavTarget = { label: `All ${scopeLabel} apps`, hint: 'Apps', href: params.toString() ? `${INSPIRATIONS_ROUTES.apps}?${params}` : INSPIRATIONS_ROUTES.apps };
    if (byScreens.length === 0) return { text: `There are no ${scopeLabel} apps in the library yet.`, targets: [QUICK_PAGES[0]] };
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

  // "surprise me", "a random app".
  if (RANDOM.test(lower) && /\bapps?\b|\bsurprise me\b|\bpick one for me\b/i.test(lower) && apps.length > 0) {
    const chosen = apps[Math.floor(Math.random() * apps.length)];
    return { text: `How about ${chosen.name}? ${describeApp(chosen).text}`, targets: followUps(chosen, null), go: appTarget(chosen), app: chosen };
  }

  if (asksCount && screenType) {
    const total = await countScreens({ type: screenType.key }, null);
    if (total !== null) {
      if (WHICH_APPS.test(lower)) {
        const found = await appsWithScreens({ type: screenType.key }, index);
        if (found?.apps.length) return { text: `${plural(total, `${screenType.label.toLowerCase()} screen`)} across ${listNames(found.apps.map((app) => app.name), 4)}.`, targets: appResults(found.apps.slice(0, 3)), results: appResults(found.apps) };
      }
      return { text: `The library has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`, targets: [{ label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] };
    }
  }
  if (screenType && WHICH_APPS.test(lower)) {
    const found = await appsWithScreens({ type: screenType.key }, index);
    if (found) return found.apps.length ? { text: `${screenType.label} screens appear in ${listNames(found.apps.map((app) => app.name), 4)} (${plural(found.total, 'screen')}).`, targets: [{ label: `All ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }, ...appResults(found.apps.slice(0, 3))], results: appResults(found.apps) } : { text: `No ${screenType.label.toLowerCase()} screens yet.`, targets: [QUICK_PAGES[1]] };
  }

  if (section?.tab === 'flows' && !asksCount) {
    const flowMatches = matchFlows(leftoverWords(working, apps), null, index);
    if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].name}” flow.`, targets: [], go: flowTarget(flowMatches[0], index, false), card: flowCard(flowMatches[0], index) };
    if (flowMatches.length > 1) return { text: 'A few flows match — which one?', targets: flowMatches.map((flow) => flowTarget(flow, index, true)), kind: 'clarify' };
  }

  if (asksCount && !screenType) {
    const screens = apps.reduce((sum, app) => sum + app.screenCount, 0);
    const flows = apps.reduce((sum, app) => sum + app.flowCount, 0);
    if (apps.length) return { text: `The library has ${plural(apps.length, 'app')}, ${plural(screens, 'screen')} and ${plural(flows, 'flow')}.`, targets: QUICK_PAGES.slice(0, 4) };
  }

  if (screenType) {
    const go: NavTarget = { label: `${screenType.label} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` };
    return { text: `Showing ${screenType.label.toLowerCase()} screens.`, targets: [], go };
  }

  // The suggestions match anywhere inside a name ("hi" is inside "Filter chips"),
  // so only a match that starts a word counts, and only a long-enough query may
  // open one without asking.
  const searchQuery = clean(working) || query;
  const startsAWord = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(searchQuery)}`, 'iu');
  let matches: NavTarget[] = [];
  try {
    matches = searchQuery.length >= 3 ? (await suggestQueries(searchQuery, 8)).map(toTarget).filter((target) => startsAWord.test(target.label)).slice(0, 6) : [];
  } catch {
    // Fall through to a plain search link.
  }

  const exact = matches.find((target) => target.label.toLowerCase() === searchQuery);
  if (exact) return { text: `Opening ${exact.label}.`, targets: [], go: exact };
  if (matches.length === 1 && searchQuery.length >= 4) return { text: `Opening ${matches[0].label}.`, targets: [], go: matches[0] };
  if (matches.length >= 1) return { text: matches.length === 1 ? 'Did you mean this?' : 'A few matches — which one?', targets: matches, kind: 'clarify' };

  if (section) {
    const sectionPage = PAGES.find((entry) => entry.target.label.toLowerCase() === section.label.toLowerCase())?.target;
    if (sectionPage) return { text: `Opening ${sectionPage.label}.`, targets: [], go: sectionPage };
  }

  const search: NavTarget = { label: `Search for “${searchQuery}”`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(searchQuery) };
  const sounded = /\?\s*$/.test(original) || searchQuery.split(' ').length >= 4;
  return {
    text: sounded
      ? 'I’m a guide for getting around Motvin, so I can’t answer that one. I can open an app or page, tell you how many screens an app has, or search the library.'
      : `I couldn’t find a page called “${searchQuery}”. I can search the library for it.`,
    targets: [search, ...QUICK_PAGES.slice(0, 3)],
    kind: 'fallback',
  };
}
