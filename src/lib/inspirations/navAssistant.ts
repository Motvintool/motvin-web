import { inspirationsApi } from './api';
import { INSPIRATIONS_ROUTES } from './routes';
import { suggestQueries, type SearchSuggestion } from './search';
import { EMPTY_FILTERS } from './filters';
import { SCREEN_TYPE_LABEL } from './taxonomy';
import type { App, ScreenType } from './types';

/**
 * The visitor-facing assistant: it answers "where do you want to go?" and the
 * plain facts a visitor asks on the way — how many screens an app has — from
 * the same public library data the search box uses. The only thing it can do is
 * answer or hand back a link. No admin tools, no server call, no model.
 */

/** A button: a link to go to, or (with `ask`) a follow-up question to send as if typed. */
export type NavTarget = { label: string; hint: string; href: string; iconSrc?: string; ask?: string };
export type NavCard = { title: string; iconSrc?: string; facts: string[] };
export type NavReply = { text: string; targets: NavTarget[]; go?: NavTarget; card?: NavCard; app?: App };
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

const appTarget = (app: App, tab?: Section['tab']): NavTarget => ({
  label: app.name,
  hint: `App · ${app.screenCount} screens`,
  href: tab && tab !== 'screens' ? `${INSPIRATIONS_ROUTES.app(app)}?tab=${tab}` : INSPIRATIONS_ROUTES.app(app),
  iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined,
});

const plural = (count: number, word: string) => `${count.toLocaleString()} ${word}${count === 1 ? '' : 's'}`;

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

/** Words left once the app name and generic words are gone — what the visitor is naming. */
function leftoverWords(text: string, apps: App[]): string[] {
  let rest = clean(text);
  for (const app of apps) rest = rest.replace(new RegExp(escape(app.name.toLowerCase()), 'g'), ' ').replace(new RegExp(`\\b${escape(app.name.toLowerCase().split(/\s+/)[0])}\\b`, 'g'), ' ');
  return rest
    .replace(/\b(flows?|journeys?|how|many|much|does|do|have|has|what|are|is|of|in|for|and|with|its|it)\b/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);
}

async function matchFlows(words: string[], app: App | null, apps: App[]): Promise<NavTarget[]> {
  if (!words.length) return [];
  let flows: Awaited<ReturnType<typeof inspirationsApi.listFlows>> = [];
  try {
    flows = await inspirationsApi.listFlows();
  } catch {
    return [];
  }
  return flows
    .filter((flow) => (!app || flow.appId === app.id) && words.every((word) => flow.name.toLowerCase().includes(word)))
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

const GREETING = /^(hi+|hello+|hey+|hola|yo|howdy|good (morning|afternoon|evening)|sup|namaste|vanakkam)\b[\s!.?]*$/i;
const THANKS = /^(thanks?|thank you|thx|ty|ok(ay)?|cool|great|nice|awesome)\b[\s!.?]*$/i;
const HELP = /^(help|what can you do|what do you do|how (does this|do you) work|what is this)\b[\s!.?]*$/i;
const WHO = /\b(who are you|who made you|who built you|are you (an? )?(ai|bot|human|real))\b/i;
const HOW_ARE_YOU = /\bhow are you\b/i;
const REFERS_BACK = /\b(it|its|it's|this app|that app|this one|same app)\b/i;

export async function resolveNavigation(raw: string, context?: NavContext): Promise<NavReply> {
  const original = raw.trim().slice(0, 200);
  if (GREETING.test(original)) return { text: pick(['Hi! Where would you like to go? Tell me an app or a page, or pick one below.', 'Hello! What are you looking for today? An app, a page, or a type of screen?', 'Hey there! Say an app or page and I’ll take you straight to it.']), targets: QUICK_PAGES };
  if (THANKS.test(original)) return { text: pick(['Anytime. Tell me where to go next.', 'Happy to help. Where to next?', 'You’re welcome. Anything else you’d like to see?']), targets: [] };
  if (HOW_ARE_YOU.test(original)) return { text: 'Doing great, thanks for asking! Where would you like to go?', targets: QUICK_PAGES.slice(0, 4) };
  if (WHO.test(original)) return { text: 'I’m the Motvin guide. I help you find apps, screens and flows, and answer quick questions like how many screens an app has.', targets: QUICK_PAGES.slice(0, 4) };
  if (HELP.test(original)) {
    return { text: 'I take you around Motvin and answer quick questions like “how many screens does Swiggy have?”. Try “open Zomato”, “Swiggy flows” or “login screens”.', targets: QUICK_PAGES };
  }
  const query = clean(original);
  if (!query) return { text: 'Tell me where to go — an app, a page like Flows or Screens, or something to search for.', targets: QUICK_PAGES };

  const page = PAGES.find((entry) => entry.keys.some((key) => key === query || (query.length > 3 && key === `${query}s`)));
  if (page) return { text: pick([`Opening ${page.target.label}.`, `Taking you to ${page.target.label}.`, `Here’s ${page.target.label}.`]), targets: [], go: page.target };

  let apps: App[] = [];
  try {
    apps = await inspirationsApi.listApps();
  } catch {
    // Offline or the library is unreachable — name matching below still tries suggestions.
  }

  const lower = original.toLowerCase();
  const asksCount = /\bhow (many|much)\b|\b(count|number of|total)\b/.test(lower);
  const section = findSection(lower);
  const screenType = findScreenType(lower);
  let mentioned = findApps(lower, apps);
  // "its flows", "how many screens does it have" — the app from the last answer.
  if (!mentioned.length && context?.app && REFERS_BACK.test(lower) && (section || asksCount || screenType)) mentioned = [context.app];

  if (mentioned.length === 1) {
    const app = mentioned[0];
    if (asksCount && screenType) {
      const total = await countScreens(screenType.key, app);
      if (total !== null) {
        return {
          text: `${app.name} has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`,
          targets: [{ label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(`${app.name} ${screenType.label.toLowerCase()}`) }, ...followUps(app, 'count').slice(0, 2)],
          app,
        };
      }
    }
    if (section?.tab === 'flows' && !asksCount) {
      const flowMatches = await matchFlows(leftoverWords(original, apps), app, apps);
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
        targets: [appTarget(app), ...followUps(app, 'count').slice(0, 2)],
        card: { title: app.name, iconSrc: inspirationsApi.mediaUrl(app.logo) ?? undefined, facts: [plural(app.screenCount, 'screen'), plural(app.flowCount, 'flow')] },
        app,
      };
    }
    if (screenType) {
      const search = `${app.name} ${screenType.label.toLowerCase()}`;
      const go: NavTarget = { label: `${app.name} ${screenType.label.toLowerCase()} screens`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(search) };
      return { text: `Showing ${app.name}’s ${screenType.label.toLowerCase()} screens.`, targets: followUps(app, null).slice(0, 2), go, app };
    }
    if (section) {
      const go = { ...appTarget(app, section.tab), label: `${app.name} ${section.label}` };
      return { text: pick([`Opening ${app.name}’s ${section.label}.`, `Here are ${app.name}’s ${section.label}.`]), targets: followUps(app, section.tab), go, app };
    }
    return { text: pick([`Opening ${app.name}.`, `Taking you to ${app.name}.`, `Here’s ${app.name}.`]), targets: followUps(app, null), go: appTarget(app), app };
  }

  if (mentioned.length > 1 && COMPARE.test(lower)) {
    const [first, second] = mentioned;
    const facts = (app: App) => `${app.name} has ${plural(app.screenCount, 'screen')} and ${plural(app.flowCount, 'flow')}`;
    return { text: `${facts(first)}. ${facts(second)}.`, targets: [appTarget(first), appTarget(second)] };
  }

  if (mentioned.length > 1) return { text: 'Which app do you mean?', targets: mentioned.slice(0, 6).map((app) => appTarget(app, section?.tab)) };

  if (asksCount && screenType) {
    const total = await countScreens(screenType.key, null);
    if (total !== null) {
      return { text: `The library has ${plural(total, `${screenType.label.toLowerCase()} screen`)}.`, targets: [{ label: `See ${screenType.label.toLowerCase()} screens`, hint: 'Screen type', href: `${INSPIRATIONS_ROUTES.screens}?type=${screenType.key}` }] };
    }
  }

  if (section?.tab === 'flows' && !asksCount) {
    const flowMatches = await matchFlows(leftoverWords(original, apps), null, apps);
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
  const startsAWord = new RegExp(`(^|[^\\p{L}\\p{N}])${escape(query)}`, 'iu');
  let matches: NavTarget[] = [];
  try {
    matches = query.length >= 3 ? (await suggestQueries(query, 8)).map(toTarget).filter((target) => startsAWord.test(target.label)).slice(0, 6) : [];
  } catch {
    // Fall through to a plain search link.
  }

  const exact = matches.find((target) => target.label.toLowerCase() === query);
  if (exact) return { text: `Opening ${exact.label}.`, targets: [], go: exact };
  if (matches.length === 1 && query.length >= 4) return { text: `Opening ${matches[0].label}.`, targets: [], go: matches[0] };
  if (matches.length >= 1) return { text: matches.length === 1 ? 'Did you mean this?' : 'A few matches — which one?', targets: matches };

  if (section) {
    const page = PAGES.find((entry) => entry.target.label.toLowerCase() === section.label.toLowerCase())?.target;
    if (page) return { text: `Opening ${page.label}.`, targets: [], go: page };
  }

  const search: NavTarget = { label: `Search for “${query}”`, hint: 'Search', href: INSPIRATIONS_ROUTES.searchFor(query) };
  const sounded = /\?\s*$/.test(original) || query.split(' ').length >= 4;
  return {
    text: sounded
      ? 'I’m a guide for getting around Motvin, so I can’t answer that one. I can open an app or page, tell you how many screens an app has, or search the library.'
      : `I couldn’t find a page called “${query}”. I can search the library for it.`,
    targets: [search, ...QUICK_PAGES.slice(0, 3)],
  };
}
