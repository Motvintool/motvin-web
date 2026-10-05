import { elementLabel } from './taxonomy';
import type { Pattern, ScreenState, Style } from './types';

/**
 * The guide's reading of a sentence, one piece at a time. Each function finds
 * one kind of thing — a screen state, a style, a UI element, a number, an
 * ordinal, a negation — and is deliberately strict: a wrong reading is worse
 * than none, because the resolver always has a plainer fallback.
 */

const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const hasWord = (text: string, word: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(word)}($|[^\\p{L}\\p{N}])`, 'iu').test(text);

/* ------------------------------------------------------------------ form */

export type SentenceForm = 'yesno' | 'wh' | 'count' | 'command';

const YES_NO = /^(?:is|are|does|do|did|was|were|can|could|will|would|has|have|am|isn't|aren't|doesn't|don't|should)\b/i;
const WH = /^(?:what|which|where|when|who|why|what's|where's|who's|how(?!\s+about\b))\b/i;
const COUNT = /\bhow (?:many|much)\b|\b(?:count|number of|total)\b/i;

export function sentenceForm(text: string): SentenceForm {
  const t = text.trim();
  if (COUNT.test(t)) return 'count';
  if (YES_NO.test(t)) return 'yesno';
  if (WH.test(t) || /\?\s*$/.test(t)) return 'wh';
  return 'command';
}

/* ----------------------------------------------------------------- states */

const STATE_WORDS: [RegExp, ScreenState][] = [
  [/\bbottom[\s-]?sheets?\b|\baction sheets?\b/i, 'bottom-sheet'],
  [/\btoasts?\b|\bsnack ?bars?\b/i, 'toast'],
  [/\bcoach[\s-]?marks?\b|\btool ?tips?\b|\bonboarding tips?\b/i, 'coach-mark'],
  [/\bkeyboard (?:open|up|visible|states?)\b|\bwith (?:the )?keyboard\b/i, 'keyboard'],
  [/\bscrolled\b/i, 'scrolled'],
  [/\bskeletons?\b|\bloading (?:states?|screens?|skeletons?)\b|\bspinners?\b|\bloading\b(?=.*\b(?:screens?|states?)\b)/i, 'loading'],
  [/\bempty (?:states?|screens?|views?)\b|\bno[\s-]?results? (?:states?|screens?)\b|\bzero states?\b|\bempty\b(?=.*\bscreens?\b)/i, 'empty'],
  [/\berror (?:states?|screens?|messages?)\b|\bfailure states?\b|\berror\b(?=.*\bscreens?\b)/i, 'error'],
  [/\bsuccess (?:states?|screens?|messages?)\b|\bconfirmation (?:states?|screens?)\b|\bsuccess\b(?=.*\bscreens?\b)/i, 'success'],
  [/\bmodals?\b|\bdialogs?\b|\bpop[\s-]?ups?\b/i, 'modal'],
  [/\bpermission (?:prompts?|dialogs?|requests?|states?)\b|\bsystem prompts?\b/i, 'permission'],
];

export function findStates(text: string): ScreenState[] {
  const found: ScreenState[] = [];
  for (const [pattern, state] of STATE_WORDS) if (pattern.test(text) && !found.includes(state)) found.push(state);
  return found;
}

/* ----------------------------------------------------------------- styles */

const STYLE_WORDS: [RegExp, Style][] = [
  [/\bdark(?:[\s-]?(?:mode|theme|ui|style|screens?|design))\b/i, 'dark'],
  [/\blight(?:[\s-]?(?:mode|theme))\b/i, 'light'],
  [/\bminimal(?:ist|istic)?\b/i, 'minimal'],
  [/\beditorial\b/i, 'editorial'],
  [/\bbold (?:ui|style|design|screens?|typography)\b/i, 'bold'],
  [/\bplayful\b/i, 'playful'],
  [/\bcorporate\b/i, 'corporate'],
  [/\bexperimental\b/i, 'experimental'],
];

export function findStyles(text: string): Style[] {
  const found: Style[] = [];
  for (const [pattern, style] of STYLE_WORDS) if (pattern.test(text) && !found.includes(style)) found.push(style);
  return found;
}

/* --------------------------------------------------------------- elements */

/** Everyday names for component kinds, on top of the kind's own label. */
const ELEMENT_ALIASES: Record<string, RegExp> = {
  'nav-bar': /\bnav ?bars?\b|\bnavigation bars?\b|\bheaders?\b|\bapp bars?\b/i,
  'tab-bar': /\btab ?bars?\b|\bbottom (?:navigation|navs?|tabs)\b|\btabs\b/i,
  'search-bar': /\bsearch ?(?:bars?|boxes|box|fields?|inputs?)\b/i,
  'text-field': /\btext ?(?:fields?|inputs?|boxes)\b|\binput fields?\b|\binputs?\b/i,
  cta: /\bctas?\b|\bcalls? to action\b|\bprimary buttons?\b/i,
  chip: /\bchips?\b|\bpills?\b|\btags?\b/i,
  'empty-state': /\bempty[\s-]?states?\b/i,
  'page-indicator': /\bpage ?indicators?\b|\bdots\b|\bpagination dots\b/i,
  'legal-text': /\blegal ?(?:text|copy|notes?)\b|\bterms (?:text|copy)\b|\bdisclaimers?\b/i,
  progress: /\bprogress ?(?:bars?|indicators?)\b|\bsteppers?\b/i,
  skeleton: /\bskeletons?\b|\bshimmers?\b/i,
  carousel: /\bcarousels?\b|\bsliders?\b|\bswipe ?cards?\b/i,
  banner: /\bbanners?\b|\bpromo (?:strips?|banners?)\b/i,
  alert: /\balerts?\b|\bwarnings?\b/i,
  modal: /\bmodals?\b|\bdialogs?\b/i,
  toast: /\btoasts?\b|\bsnack ?bars?\b/i,
  'bottom-sheet': /\bbottom[\s-]?sheets?\b/i,
  'coach-mark': /\bcoach[\s-]?marks?\b|\btool ?tips?\b/i,
  button: /\bbuttons?\b/i,
  list: /\blists?\b|\blist ?views?\b/i,
  form: /\bforms?\b/i,
  price: /\bprices?\b|\bpricing (?:labels?|tags?)\b|\bprice tags?\b/i,
  keyboard: /\bkeyboards?\b/i,
};

/** The UI element kinds a sentence names, limited to kinds the library actually has. */
export function findElements(text: string, kinds: string[]): string[] {
  const found: string[] = [];
  for (const kind of kinds) {
    const alias = ELEMENT_ALIASES[kind];
    const label = elementLabel(kind).toLowerCase();
    const plain = kind.replace(/-/g, ' ');
    if ((alias && alias.test(text)) || hasWord(text, label) || hasWord(text, `${label}s`) || hasWord(text, plain) || hasWord(text, `${plain}s`) || hasWord(text, kind) || hasWord(text, `${kind}s`)) found.push(kind);
  }
  return found;
}

/** Whether the sentence is about UI elements as such ("ui elements", "components"), not a particular one. */
export const asksElements = (text: string) => /\b(?:ui ?elements?|components?|widgets?)\b/i.test(text);

/* --------------------------------------------------------------- patterns */

export function findPatterns(text: string, patterns: Pattern[]): Pattern[] {
  const lower = text.toLowerCase();
  const byName = patterns.filter((pattern) => hasWord(lower, pattern.name.toLowerCase()) || hasWord(lower, pattern.name.toLowerCase().replace(/s$/, '')));
  if (byName.length) return byName;
  // "bottom navigation patterns", "modal patterns": a whole category.
  const byCategory = patterns.filter((pattern) => hasWord(lower, pattern.category.toLowerCase()) || hasWord(lower, pattern.category.toLowerCase().replace(/s$/, '')));
  return /\bpatterns?\b/.test(lower) ? byCategory : [];
}

/* ----------------------------------------------------------- flow category */

const FLOW_CATEGORY_WORDS: [RegExp, string][] = [
  [/\b(?:authentication|auth|login|log[\s-]?in|sign[\s-]?in|sign[\s-]?up|signup|register|registration|otp|verification)\b/i, 'authentication'],
  [/\b(?:checkout|payment|paying|purchase|buying|order(?:ing)?)\b/i, 'checkout'],
  [/\b(?:onboarding|welcome|first[\s-]?run|getting started)\b/i, 'onboarding'],
  [/\b(?:search|searching|find(?:ing)?)\b/i, 'search'],
  [/\b(?:settings|preferences|account settings)\b/i, 'settings'],
  [/\b(?:creation|creating|create|composing|posting|upload(?:ing)?)\b/i, 'creation'],
  [/\b(?:discovery|discover|browsing|browse|explore|exploring)\b/i, 'discovery'],
];

/** The flow category a sentence means, only when it is talking about flows and the library has that category. */
export function findFlowCategory(text: string, categories: string[]): string | null {
  if (!/\bflows?\b|\bjourneys?\b/i.test(text)) return null;
  for (const [pattern, category] of FLOW_CATEGORY_WORDS) if (pattern.test(text) && categories.includes(category)) return category;
  return null;
}

/* -------------------------------------------------------------- negation */

/** The things a sentence rules out: "except Swiggy", "other than web", "not Zomato". */
export function findNegations(text: string): string[] {
  const out: string[] = [];
  const re = /\b(?:except(?: for)?|other than|excluding|but not|apart from|without|not including|minus)\s+([^,.;?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) out.push(match[1].trim());
  const notOn = /(?:\bnot|n[’']t|\bnever)\s+(?:on|for|available on|in)\s+([^,.;?]+)/gi;
  while ((match = notOn.exec(text)) !== null) out.push(match[1].trim());
  // "not Swiggy" at the start, or after a comma: a correction.
  const lead = /^(?:not|no)\s+([^,.;?]+?)(?:,|\s+but\b|\s+i mean\b|$)/i.exec(text.trim());
  if (lead) out.push(lead[1].trim());
  return out;
}

/** The sentence with its negated parts removed, so what is left is what they do want. */
export function withoutNegations(text: string): string {
  return text
    .replace(/\b(?:except(?: for)?|other than|excluding|but not|apart from|without|not including|minus)\s+[^,.;?]+/gi, ' ')
    .replace(/\b(?:that |which |who )?(?:are|is|were|was)?\s*(?:not|n[’']t|never)\s+(?:on|for|available on|in)\s+[^,.;?]+/gi, ' ')
    .replace(/^(?:not|no)\s+[^,.;?]+?(?:,|\s+but\b|\s+i mean\b)/i, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* ---------------------------------------------------------------- numbers */

const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const toNumber = (token: string) => (NUMBER_WORDS[token.toLowerCase()] ?? Number(token.replace(/,/g, '')));

export type NumberFilter = { field: 'screens' | 'flows' | 'rating'; op: 'gt' | 'gte' | 'lt' | 'lte' | 'eq'; value: number };

/** "apps with more than 100 screens", "at least 50 flows", "rating above 4", "100+ screens". */
export function findNumberFilter(text: string): NumberFilter | null {
  const t = text.toLowerCase();
  const field = (word: string): NumberFilter['field'] | null => (/^flows?$/.test(word) ? 'flows' : /^screens?$/.test(word) ? 'screens' : /^(?:rating|ratings|stars?)$/.test(word) ? 'rating' : null);
  const num = '(\\d[\\d,]*(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)';
  const unit = '(screens?|flows?|ratings?|stars?)';
  const patterns: [RegExp, NumberFilter['op'], (m: RegExpExecArray) => [string, string]][] = [
    [new RegExp(`\\b(?:more than|over|above|greater than|exceeding)\\s+${num}\\s+${unit}\\b`), 'gt', (m) => [m[1], m[2]]],
    [new RegExp(`\\b(?:at least|minimum(?: of)?|no fewer than|not less than)\\s+${num}\\s+${unit}\\b`), 'gte', (m) => [m[1], m[2]]],
    [new RegExp(`\\b(?:fewer than|less than|under|below)\\s+${num}\\s+${unit}\\b`), 'lt', (m) => [m[1], m[2]]],
    [new RegExp(`\\b(?:at most|maximum(?: of)?|no more than|up to)\\s+${num}\\s+${unit}\\b`), 'lte', (m) => [m[1], m[2]]],
    [new RegExp(`\\b${num}\\+\\s*${unit}\\b`), 'gte', (m) => [m[1], m[2]]],
    [new RegExp(`\\b(?:exactly\\s+)?${num}\\s+${unit}\\b`), 'eq', (m) => [m[1], m[2]]],
    [new RegExp(`\\b(rating|ratings?|stars?)\\s+(?:of\\s+)?(?:more than|over|above|greater than)\\s+${num}\\b`), 'gt', (m) => [m[2], m[1]]],
    [new RegExp(`\\b(rating|ratings?|stars?)\\s+(?:of\\s+)?(?:at least|minimum)\\s+${num}\\b`), 'gte', (m) => [m[2], m[1]]],
    [new RegExp(`\\b(rating|ratings?|stars?)\\s+(?:of\\s+)?(?:under|below|less than|fewer than)\\s+${num}\\b`), 'lt', (m) => [m[2], m[1]]],
    [new RegExp(`\\brated\\s+(?:more than|over|above)\\s+${num}\\b`), 'gt', (m) => [m[1], 'rating']],
    [new RegExp(`\\brated\\s+(?:at least|minimum)\\s+${num}\\b`), 'gte', (m) => [m[1], 'rating']],
    [new RegExp(`\\brated\\s+(?:under|below|less than)\\s+${num}\\b`), 'lt', (m) => [m[1], 'rating']],
  ];
  for (const [pattern, op, pickOut] of patterns) {
    const m = pattern.exec(t);
    if (!m) continue;
    const [value, word] = pickOut(m);
    const f = field(word);
    if (!f) continue;
    const n = toNumber(value);
    if (!Number.isFinite(n)) continue;
    return { field: f, op, value: n };
  }
  return null;
}

export const matchesNumber = (actual: number | null, filter: NumberFilter) => {
  if (actual === null) return false;
  switch (filter.op) {
    case 'gt':
      return actual > filter.value;
    case 'gte':
      return actual >= filter.value;
    case 'lt':
      return actual < filter.value;
    case 'lte':
      return actual <= filter.value;
    default:
      return actual === filter.value;
  }
};

/** "top 3", "top three", "first 5", "the 3 biggest" → 3; null when no count is asked for. */
export function findTopN(text: string): number | null {
  const m = /\b(?:top|first|best|biggest|largest|smallest|lowest|highest)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\b|\b(\d{1,2}|two|three|four|five|six|seven|eight|nine|ten)\s+(?:biggest|largest|smallest|top|best|most|highest|lowest)\b/i.exec(text);
  if (!m) return null;
  const n = toNumber(m[1] ?? m[2]);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/* --------------------------------------------------------------- ordinals */

export type Ordinal = { kind: 'index'; index: number } | { kind: 'last' } | { kind: 'other' } | { kind: 'both' } | { kind: 'all' };

const ORDINALS: Record<string, number> = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2, fourth: 3, '4th': 3, fifth: 4, '5th': 4, sixth: 5, '6th': 5 };

/** "the second one", "the other one", "both", "all of them" — picking from what was just listed. */
export function findOrdinal(text: string): Ordinal | null {
  const t = text.toLowerCase().trim();
  if (/^(?:both(?: of them)?|the two|these two|those two)[\s!.?]*$/.test(t) || /\b(?:compare|open|show)\s+both\b/.test(t)) return { kind: 'both' };
  if (/^(?:all(?: of them| of those| of these| three| four| five)?|every one|everything)[\s!.?]*$/.test(t) || /\b(?:show|open|list)\s+all(?: of them)?\b/.test(t)) return { kind: 'all' };
  if (/\bthe other(?: one| app)?\b/.test(t)) return { kind: 'other' };
  if (/\b(?:the )?last (?:one|app|option)\b/.test(t)) return { kind: 'last' };
  const m = /\b(?:the )?(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th)(?: one| app| option| choice| result)?\b/.exec(t);
  if (m) return { kind: 'index', index: ORDINALS[m[1]] };
  const bare = /^(?:number\s+)?(\d)[\s!.?]*$/.exec(t);
  if (bare) return { kind: 'index', index: Number(bare[1]) - 1 };
  return null;
}

/* ------------------------------------------------------------ multi-intent */

/** "open zomato and show its flows" → two requests, in order. At most three; a single request comes back whole. */
export function splitIntents(text: string): string[] {
  const parts = text
    .split(/\s*(?:,\s*)?(?:\band then\b|\bthen\b|;)\s*|\s*,?\s+and\s+(?=(?:show|open|tell|take|go|list|compare|how|what|which|give|find|navigate|bring|save|copy)\b)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts.slice(0, 3) : [text.trim()];
}
