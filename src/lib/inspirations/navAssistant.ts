import { inspirationsApi } from './api';
import { correctText } from './fuzzy';
import { INSPIRATIONS_ROUTES } from './routes';
import { suggestQueries, type SearchSuggestion } from './search';
import { EMPTY_FILTERS } from './filters';
import { applySynonyms, findIndustry, findPlatform, findPlatforms, PLATFORM_LABEL, stripChatter } from './synonyms';
import { INDUSTRY_LABEL, SCREEN_TYPE_LABEL } from './taxonomy';
import type { App, Platform, ScreenType } from './types';

/**
 * The visitor-facing assistant: it answers "where do you want to go?" and the
 * plain facts a visitor asks on the way — how many screens an app has, which
 * app has the most flows — from the same public library data the search box
 * uses. The only thing it can do is answer or hand back a link. No admin
 * tools, no server call, no model.
 */

/** A button: a link to go to, or (with `ask`) a follow-up question to send as if typed. */
export type NavTarget = { label: string; hint: string; href: string; iconSrc?: string; ask?: string };
export type NavCard = { title: string; iconSrc?: string; facts: string[]; href?: string };
export type NavReply = { text: string; targets: NavTarget[]; go?: NavTarget; card?: NavCard; app?: App; error?: boolean };
export type NavContext = { app: App | null };

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

function findScreenType(text: string): { key: string; label: string } | null {
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

/**
 * The words a misspelling may be corrected to: brand names, the sections, the
 * more distinctive screen types, and the kinds of app. Common everyday words
 * ("profile", "product") are left out on purpose, so ordinary writing is never
 * "corrected" into one of them.
 */
function vocabularyFor(apps: App[]): string[] {
  const vocabulary = new Set<string>();
  for (const app of apps) words(app.name).forEach((word) => vocabulary.add(word));
  for (const entry of SECTIONS) entry.words.forEach((phrase) => words(phrase).forEach((word) => vocabulary.add(word)));
  for (const key of [...SAFE_TYPES, 'settings', 'notifications']) vocabulary.add(key);
  for (const [key, label] of Object.entries(SCREEN_TYPE_LABEL)) if (SAFE_TYPES.has(key)) words(label).forEach((word) => vocabulary.add(word));
  for (const label of Object.values(INDUSTRY_LABEL)) words(label).forEach((word) => vocabulary.add(word));
  for (const word of ['collections', 'android', 'iphone', 'websites']) vocabulary.add(word);
  return [...vocabulary].filter((word) => word.length >= 5);
}

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

/** The Apps page, introduced by naming what is in it — the answer to "apps", "i want app", "which apps do you have". */
function allApps(apps: App[]): NavReply {
  if (apps.length === 0) return { text: 'Opening Apps.', targets: [], go: QUICK_PAGES[0] };
  const byScreens = [...apps].sort((a, b) => b.screenCount - a.screenCount);
  return { text: `The library has ${plural(apps.length, 'app')} — ${listNames(byScreens.map((app) => app.name), 4)}. Opening Apps.`, targets: byScreens.slice(0, 4).map((app) => appTarget(app)), go: QUICK_PAGES[0] };
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

async function matchFlows(searchWords: string[], app: App | null, apps: App[]): Promise<NavTarget[]> {
  if (!searchWords.length) return [];
  let flows: Awaited<ReturnType<typeof inspirationsApi.listFlows>> = [];
  try {
    flows = await inspirationsApi.listFlows();
  } catch {
    return [];
  }
  return flows
    .filter((flow) => (!app || flow.appId === app.id) && searchWords.every((word) => flow.name.toLowerCase().includes(word)))
    .slice(0, 6)
    .map((flow) => ({
      label: app ? flow.name : `${flow.name} · ${apps.find((candidate) => candidate.id === flow.appId)?.name ?? 'Flow'}`,
      hint: 'Flow',
      href: `${INSPIRATIONS_ROUTES.flows}?flow=${encodeURIComponent(flow.id)}`,
    }));
}

async function countScreens(type: string, app: App | null): Promise<number | null> {
  try {
    const page = await inspirationsApi.listScreens({ ...EMPTY_FILTERS, screenTypes: [type as ScreenType] }, 0, 'curated', app ? { app: app.id } : {});
    return page.total;
  } catch {
    return null;
  }
}

type Ranking = { metric: 'screens' | 'flows' | 'rating'; order: 'high' | 'low' };

/** "which app has the most flows", "top rated apps", "smallest app" — a question about apps, ranked. */
function findRanking(text: string): Ranking | null {
  if (!/\bapps?\b/.test(text)) return null;
  const high = /\b(most|biggest|largest|highest|top|best)\b/.test(text);
  const low = /\b(least|fewest|smallest|lowest)\b/.test(text);
  if (!high && !low) return null;
  const metric = /\brat(?:ed|ing|ings)\b|\bbest\b/.test(text) ? 'rating' : hasWord(text, 'flows') || hasWord(text, 'flow') ? 'flows' : 'screens';
  return { metric, order: low ? 'low' : 'high' };
}

function answerRanking(list: App[], ranking: Ranking, scopeLabel: string | null): NavReply {
  const scope = scopeLabel ? `Among ${scopeLabel}, ` : '';
  // After "Among … apps," a leading "The" drops to lower case; a brand name keeps its capital.
  const sentence = (text: string) => (scope ? `${scope}${text.startsWith('The ') ? `the${text.slice(3)}` : text}` : text);
  if (ranking.metric === 'rating') {
    const rated = list.filter((app) => app.rating !== null).sort((a, b) => (ranking.order === 'high' ? (b.rating ?? 0) - (a.rating ?? 0) : (a.rating ?? 0) - (b.rating ?? 0)));
    if (rated.length === 0) return { text: 'No ratings have been recorded yet.', targets: QUICK_PAGES.slice(0, 3) };
    const shown = rated.slice(0, 3).map((app) => `${app.name} (${(app.rating ?? 0).toFixed(1)})`);
    return { text: sentence(`The ${ranking.order === 'high' ? 'top rated' : 'lowest rated'} ${rated.length === 1 ? 'app is' : 'apps are'} ${listNames(shown, 3)}.`), targets: rated.slice(0, 3).map((app) => appTarget(app)), app: rated[0] };
  }
  const count = (app: App) => (ranking.metric === 'flows' ? app.flowCount : app.screenCount);
  const ordered = [...list].sort((a, b) => (ranking.order === 'high' ? count(b) - count(a) : count(a) - count(b)));
  const [first, second] = ordered;
  const noun = ranking.metric;
  const lead = `${first.name} has the ${ranking.order === 'high' ? 'most' : 'fewest'} ${noun} (${count(first).toLocaleString()})`;
  const tail = second ? `, followed by ${second.name} (${count(second).toLocaleString()})` : '';
  return { text: sentence(`${lead}${tail}.`), targets: ordered.slice(0, 3).map((app) => appTarget(app)), app: first };
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

const ON_LABEL: Record<Platform, string> = { web: 'the web', ios: 'iOS', android: 'Android' };
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const platformList = (app: App) => listNames(app.platforms.map((platform) => ON_LABEL[platform]));

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
  const where = app.platforms.length ? ` on ${platformList(app)}` : '';
  return {
    text: `${app.name} is ${article(kind)} ${kind} app${where}, with ${plural(app.screenCount, 'screen')} and ${plural(app.flowCount, 'flow')}.`,
    targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)],
    card: { title: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, facts: [kind, ...(app.platforms.length ? [app.platforms.map((platform) => PLATFORM_LABEL[platform]).join(' · ')] : []), plural(app.screenCount, 'screen'), plural(app.flowCount, 'flow')], href: INSPIRATIONS_ROUTES.app(app) },
    app,
  };
}

/**
 * A question about one app's facts — where it runs, what kind it is, how it is
 * rated, whether it has flows or a certain screen — answered from the app's own
 * record. Null when the message is not that kind of question.
 */
async function answerAboutApp(app: App, text: string, question: boolean, yesNo: boolean, section: Section | null, screenType: { key: string; label: string } | null, asksCount: boolean): Promise<NavReply | null> {
  const rest = withoutNames(text, [app]);
  const platformsAsked = findPlatforms(rest);
  const wantsMobile = MOBILE.test(rest) && platformsAsked.length === 0;
  const kind = INDUSTRY_LABEL[app.industry] ?? app.industry;

  // Where it runs.
  if (platformsAsked.length > 0 || wantsMobile || PLATFORM_ASKED.test(rest)) {
    if (app.platforms.length === 0) return { text: `${app.name} doesn’t list a platform yet.`, targets: [appTarget(app)], app };
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
    if (app.rating === null) return { text: `No one has rated ${app.name} yet.`, targets: [appTarget(app)], app };
    const from = app.ratingCount ? ` from ${plural(app.ratingCount, 'rating')}` : '';
    return { text: `${app.name} is rated ${app.rating.toFixed(1)} out of 5${from}.`, targets: [appTarget(app)], app };
  }

  if (INFO.test(rest)) return describeApp(app);

  // "Does it have flows?", "does Swiggy have a login screen?"
  if (yesNo && !asksCount) {
    if (screenType) {
      const total = await countScreens(screenType.key, app);
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

export async function resolveNavigation(raw: string, context?: NavContext): Promise<NavReply> {
  const notes: string[] = [];
  const reply = await resolveInner(raw, context, notes);
  // Say so when a misspelling was read as something, but only if the answer acted on it.
  if (notes.length > 0 && !reply.error && (reply.go || reply.card || reply.app)) {
    return { ...reply, text: `${reply.text} (I read ${listNames(notes, 3)}.)` };
  }
  return reply;
}

async function resolveInner(raw: string, context: NavContext | undefined, notes: string[]): Promise<NavReply> {
  const original = stripChatter(raw.trim().slice(0, 200));
  if (APOLOGY.test(original)) return { text: 'No problem at all. Where would you like to go?', targets: QUICK_PAGES.slice(0, 4) };
  if (GREETING.test(original)) return { text: pick(['Hi! Where would you like to go? Tell me an app or a page, or pick one below.', 'Hello! What are you looking for today? An app, a page, or a type of screen?', 'Hey there! Say an app or page and I’ll take you straight to it.']), targets: QUICK_PAGES };
  if (THANKS.test(original)) return { text: pick(['Anytime. Tell me where to go next.', 'Happy to help. Where to next?', 'You’re welcome. Anything else you’d like to see?']), targets: [] };
  if (HOW_ARE_YOU.test(original)) return { text: 'Doing great, thanks for asking! Where would you like to go?', targets: QUICK_PAGES.slice(0, 4) };
  if (WHO.test(original)) return { text: 'I’m the Motvin guide. I help you find apps, screens and flows, and answer quick questions like how many screens an app has.', targets: QUICK_PAGES.slice(0, 4) };
  if (HELP.test(original)) {
    return { text: 'I take you around Motvin and answer quick questions like “how many screens does Swiggy have?”. Try “open Zomato”, “Swiggy flows”, “food apps”, “web apps” or “login screens”.', targets: QUICK_PAGES };
  }
  const query = clean(original);
  const page = pageFor(query);
  const isAppsPage = page?.target.href === QUICK_PAGES[0].href;
  // "i want app" says nothing but that they want apps; like "apps" itself, it is answered once the apps are known.
  const wantsApps = isAppsPage || (!query && /\bapps?\b/i.test(original));
  if (!query && !wantsApps) return { text: 'Tell me where to go — an app, a page like Flows or Screens, or something to search for.', targets: QUICK_PAGES };

  if (page && !isAppsPage) return { text: pick([`Opening ${page.target.label}.`, `Taking you to ${page.target.label}.`, `Here’s the ${page.target.label} page.`]), targets: [], go: page.target };

  let apps: App[] = [];
  let unreachable = false;
  try {
    apps = await inspirationsApi.listApps();
  } catch {
    unreachable = true;
  }

  // Read the question the way it was meant: fix confident misspellings, then fold
  // everyday wording ("sign in", "buy") into the library's own words.
  const typed = original.toLowerCase();
  const fixed = unreachable ? { text: typed, corrections: [] } : correctText(typed, vocabularyFor(apps));
  const shownAs = new Map<string, string>();
  for (const app of apps) words(app.name).forEach((word) => shownAs.set(word, app.name.split(/\s+/).find((part) => part.toLowerCase() === word) ?? word));
  fixed.corrections.forEach((change) => notes.push(`“${change.from}” as “${shownAs.get(change.to) ?? change.to}”`));
  const lower = applySynonyms(fixed.text);
  const working = lower;

  // A misspelt page name ("flwos") is still a page.
  if (fixed.corrections.length > 0) {
    const fixedPage = pageFor(clean(working));
    if (fixedPage) return { text: `Opening ${fixedPage.target.label}.`, targets: [], go: fixedPage.target };
  }

  const asksCount = /\bhow (many|much)\b|\b(count|number of|total)\b/.test(lower);
  const section = findSection(lower);
  const screenType = findScreenType(lower);
  const yesNo = YES_NO.test(original);
  const question = yesNo || WH.test(original) || /\?\s*$/.test(original);
  // Something about an app is being asked — enough to know "it" needs an app.
  const asksAboutAnApp = Boolean(section || asksCount || screenType || findPlatform(lower) || findIndustry(lower) || PLATFORM_ASKED.test(lower) || INDUSTRY_ASKED.test(lower) || RATING_ASKED.test(lower) || INFO.test(lower));

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
  if (wantsApps) return allApps(apps);
  let mentioned = findApps(lower, apps);
  // "its flows", "is this on iOS" — the app from the last answer.
  if (!mentioned.length && context?.app && REFERS_BACK.test(lower) && asksAboutAnApp) mentioned = [context.app];
  // "how many screens?" straight after opening Zomato means Zomato's screens. The
  // app being talked about is the subject of any question about app facts, unless
  // the question widens itself: "in the whole library", "all apps", "which app has…".
  const widened = LIBRARY_SCOPE.test(lower) || /\bapps\b/i.test(lower) || findRanking(lower) !== null || COMPARE.test(lower) || findIndustry(lower) !== null;
  const carried = !mentioned.length && Boolean(context?.app) && asksAboutAnApp && !widened;
  if (carried && context?.app) mentioned = [context.app];
  // A way back out to the whole library, offered whenever the app was assumed.
  const wholeLibrary: NavTarget[] = carried ? [{ label: 'Whole library', hint: 'Ask', href: '', ask: `${original.replace(/\?\s*$/, '')} in the whole library` }] : [];

  // "its flows" with nothing it could refer to: ask, with the biggest apps as the choices.
  if (!mentioned.length && !context?.app && REFERS_BACK.test(lower) && asksAboutAnApp && apps.length > 0) {
    const biggest = [...apps].sort((a, b) => b.screenCount - a.screenCount).slice(0, 5);
    return {
      text: 'Which app do you mean?',
      targets: biggest.map((app) => ({ label: app.name, hint: 'App', href: '', ask: `${original} ${app.name}`, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined })),
    };
  }

  if (mentioned.length === 1) {
    const app = mentioned[0];
    const fact = await answerAboutApp(app, lower, question, yesNo, section, screenType, asksCount);
    if (fact) return fact;
    if (asksCount && screenType) {
      const total = await countScreens(screenType.key, app);
      if (total !== null) {
        return {
          text: `${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`,
          targets: [...wholeLibrary, { label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${screenType.label.toLowerCase()}`) }, ...followUps(app, 'count').slice(0, 2)],
          app,
        };
      }
    }
    if (section?.tab === 'flows' && !asksCount) {
      const flowMatches = await matchFlows(leftoverWords(working, apps), app, apps);
      if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].label}” flow.`, targets: followUps(app, 'flows').slice(0, 2), go: flowMatches[0], app };
      if (flowMatches.length > 1) return { text: `${app.name} has a few flows like that — which one?`, targets: flowMatches, app };
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

  if (mentioned.length > 1 && COMPARE.test(lower)) {
    const [first, second] = mentioned;
    const facts = (app: App) => `${app.name} has ${plural(app.screenCount, 'screen')} and ${plural(app.flowCount, 'flow')}`;
    return { text: `${facts(first)}. ${facts(second)}.`, targets: [appTarget(first), appTarget(second)] };
  }

  if (mentioned.length > 1) return { text: 'Which app do you mean?', targets: mentioned.slice(0, 6).map((app) => appTarget(app, section?.tab)) };

  // Questions about the apps themselves, from the library's own numbers: what kind
  // they are (food, fintech) and where they run (web, iOS, Android).
  const industry = findIndustry(fixed.text);
  const platform = findPlatform(fixed.text);
  const kind = [industry ? INDUSTRY_LABEL[industry] : '', platform ? PLATFORM_LABEL[platform] : ''].filter(Boolean).join(' ');
  const pool = apps.filter((app) => (!industry || app.industry === industry) && (!platform || app.platforms.includes(platform)));
  const ranking = findRanking(lower);
  if (ranking && pool.length > 0) return answerRanking(pool, ranking, kind ? `${kind} apps` : null);
  if (industry || platform) {
    const byScreens = [...pool].sort((a, b) => b.screenCount - a.screenCount);
    const params = new URLSearchParams();
    if (platform) params.set('platform', platform);
    if (industry) params.set('industry', industry);
    const kindPage: NavTarget = { label: `All ${kind} apps`, hint: 'Apps', href: `${INSPIRATIONS_ROUTES.apps}?${params}` };
    if (byScreens.length === 0) return { text: `There are no ${kind} apps in the library yet.`, targets: [QUICK_PAGES[0]] };
    if (asksCount) {
      return {
        text: `There ${byScreens.length === 1 ? 'is' : 'are'} ${plural(byScreens.length, `${kind} app`)} — ${listNames(byScreens.map((app) => app.name), 4)}.`,
        targets: [kindPage, ...byScreens.slice(0, 3).map((app) => appTarget(app))],
        app: byScreens[0],
      };
    }
    return { text: `Showing ${kind} apps.`, targets: byScreens.slice(0, 3).map((app) => appTarget(app)), go: kindPage };
  }

  // "which apps do you have", "list all apps": the whole library.
  if (/^(?:(?:what|which|list|show|all|browse)\s+)*(?:all\s+)?apps?(?:\s+(?:do you have|are there|do you know|you have|available|list))?\s*\??$/i.test(original)) return allApps(apps);

  if (asksCount && screenType) {
    const total = await countScreens(screenType.key, null);
    if (total !== null) {
      return { text: `The library has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`, targets: [{ label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] };
    }
  }

  if (section?.tab === 'flows' && !asksCount) {
    const flowMatches = await matchFlows(leftoverWords(working, apps), null, apps);
    if (flowMatches.length === 1) return { text: `Opening the “${flowMatches[0].label.split(' · ')[0]}” flow.`, targets: [], go: flowMatches[0] };
    if (flowMatches.length > 1) return { text: 'A few flows match — which one?', targets: flowMatches };
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
  if (matches.length >= 1) return { text: matches.length === 1 ? 'Did you mean this?' : 'A few matches — which one?', targets: matches };

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
  };
}
