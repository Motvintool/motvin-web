/**
 * Motvin Buddy for the icons, logos and illustrations library.
 *
 * Inspirations has its own Buddy (lib/inspirations/guide-chatbot) for apps,
 * screens and flows. This one only searches the library: it turns a sentence
 * ("thin weather icons from Phosphor, MIT only") into the page's own search,
 * filters, sort and page, and moves between Icons, Logos and Illustrations.
 * Anything else — how-to, licences, counts — gets a pointer back to searching.
 *
 * Like the Inspirations Buddy it is rule-based and runs in the browser — no
 * model, no server call. Every reply is a plain object the UI applies, and a
 * wrong reading is worse than none: anything it can't place becomes search
 * words rather than a guessed filter.
 */

import { correctText, type Correction } from '../../inspirations/guide-chatbot/fuzzy';
import { stripChatter } from '../../inspirations/guide-chatbot/synonyms';
import type { LibraryParams } from '@/lib/api/libraryParams';
import type { LibraryStats } from '@/lib/api/stats';
import { PAGE_SIZE } from '../../config/categories';
import type { Category, CategoryConfig } from '@/lib/config/categories';

export type BuddyAction =
  /** Change this page's search, filters, sort or page. */
  | { type: 'params'; patch: Partial<LibraryParams> }
  /** Go to another library, optionally with search and filters. */
  | { type: 'library'; category: Category; patch?: Partial<LibraryParams> };

export type BuddyChip = {
  label: string;
  ask?: string;
  action?: BuddyAction;
  /** Load what's showing again (after a failed load). */
  retry?: boolean;
};

export type BuddyReply = {
  text: string;
  /** Applied automatically once the reply has been shown. */
  action?: BuddyAction;
  chips: BuddyChip[];
  kind: 'small-talk' | 'answer' | 'action' | 'clarify' | 'fallback';
};

export type BuddyContext = {
  config: Pick<CategoryConfig, 'slug' | 'noun' | 'nounPlural' | 'styles'>;
  stats: LibraryStats | null;
  params: LibraryParams;
  /** How many results the grid shows now, once loaded: a follow-up keeps only a search that found something. */
  shownTotal?: number;
};

const LIBRARIES: Record<Category, { noun: string; nounPlural: string; title: string }> = {
  icons: { noun: 'icon', nounPlural: 'icons', title: 'Icons' },
  logos: { noun: 'logo', nounPlural: 'logos', title: 'Logos' },
  illustrations: { noun: 'illustration', nounPlural: 'illustrations', title: 'Illustrations' },
};

// ---------------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------------

/** Style words → style value, per library (only styles that library has count). */
const STYLE_WORDS: Array<[RegExp, string]> = [
  // "not filled", "no fill", "unfilled": the outline, not the solid one.
  [/\b(?:not|no|non|un|without)[ -]?(?:filled|fill|solid)\b/, 'outline'],
  [/\b(outline[ds]?|line|lined|line art|stroked?|linear|thicker|heavier|regular weight)\b/, 'outline'],
  [/\b(duo ?tone|two[ -]?tone|duo)\b/, 'duotone'],
  [/\b(thin(?:ner)?(?: lines?| strokes?)?|light ?weight|lighter|finer|hairlines?)\b/, 'thin'],
  [/\b3d\b/, '3d'],
  [/\b(black (and|&) white|b ?& ?w|solid|filled|fill|glyphs?|mono(?:chrome)?|black)\b/, 'solid'],
  [/\b(colou?r(?:ed|ful)?|full colou?r|brand colou?rs?|multi ?colou?r)\b/, 'color'],
];

/** Icons call their coloured style "3d"; logos and illustrations call it "color". */
function styleFor(word: string, styles: readonly string[]): string | null {
  if (styles.includes(word)) return word;
  if (word === 'color' && styles.includes('3d')) return '3d';
  if (word === '3d' && styles.includes('color')) return 'color';
  return null;
}

const STYLE_LABEL: Record<string, string> = {
  outline: 'Outline',
  solid: 'Solid',
  duotone: 'Duotone',
  thin: 'Thin',
  '3d': '3D',
  color: 'Color',
};

/** Licence words → a test on the licence names /stats reports. */
const LICENSE_WORDS: Array<[RegExp, (name: string) => boolean, string]> = [
  [/\bmit\b/, (n) => /^mit$/i.test(n), 'MIT'],
  [/\bapache\b/, (n) => /apache/i.test(n), 'Apache'],
  [/\b(cc0|cc 0|public domain|(?:no|without|without any) (?:attribution|credit))\b/, (n) => /^cc0/i.test(n), 'CC0'],
  [/\bcc[ -]?by\b(?![ -]?nc)/, (n) => /^cc by(?!.*nc)/i.test(n), 'CC BY'],
  [/\b(ofl|open font)\b/, (n) => /open font/i.test(n), 'Open Font License'],
  [/\bisc\b/, (n) => /^isc$/i.test(n), 'ISC'],
  [/\b(gpl|agpl)\b/, (n) => /gpl/i.test(n), 'GPL'],
  // "free for commercial use": every licence without a non-commercial clause.
  [/\b(commercial(?:ly)?|for business|for clients?)\b/, (n) => !/\bnc\b|-nc|non.?commercial/i.test(n), 'commercial-friendly'],
];

const SORT_WORDS: Array<[RegExp, string, string]> = [
  [/\b(most )?popular(ity)?\b/, 'popular', 'Popular'],
  [/\b(trending|newest|latest|new ones|recent(ly added)?)\b/, 'trending', 'Trending'],
  [/\b(a ?(to|-) ?z|alphabetical(ly)?)\b/, 'name-asc', 'Name A to Z'],
  [/\bz ?(to|-) ?a\b/, 'name-desc', 'Name Z to A'],
  [/\b(most )?relevant\b/, 'relevance', 'Relevant'],
];

/** Words that ask for something without being what's asked for. */
const FILLER = new Set(
  ('a an the some any all every few my our me i we you it this that these those for of with in on from by to and or ' +
    'show find search get give open look looking see view display list browse want need would like please can could ' +
    'pick choose grab fetch bring use using just only also now then more other set sets pack packs kit style styled ' +
    'styles type kind version versions svg svgs vector vectors graphic graphics image images asset assets free ' +
    'licensed license licence icon icons logo logos illustration illustrations library libraries ' +
    'is are be have has do does there here good nice best cool great beautiful simple clean modern minimal ' +
    'hey hi hello pls plz please kindly buddy ' +
    // Everyday English around a request: "it should be", "can you", "I'm looking for something like".
    'should shall will would must may might could can cant cannot need needs needed want wants wanted wanna gonna ' +
    'it its it\'s itself they them their theirs he she his her him us your yours mine ours im i\'m id i\'d ive ' +
    'was were been being am get got getting give gives giving gimme make makes making create creating add adding put ' +
    'help helps send provide suggest recommend share find finding search searching looking look show showing see ' +
    'something anything thing things stuff one ones kind sort kinda sorta like similar related regarding about ' +
    'which what that who whom whose where when how why if so as at into onto than too very really quite maybe ' +
    'also either both each other another same such own lot lots bit little many much more most ' +
    'thanks thank thx ok okay yes yeah sure u ur pl plss please lets let me myself available possible ' +
    'icon\'s design designs designer designing but represent represents representing symbolize symbolise ' +
    'depict depicting meaning means stands showing lines strokes take go goto navigate switch move jump visit ' +
    'bring brings ' +
    // Talking about the last answer: "it's not good, give me solid", "i mean…", "instead".
    'not no nope nah bad good fine better worse okay ok so then instead rather actually mean meant try again ' +
    'change changed switch swap prefer preferred version same ' +
    // Describing rather than naming: "an icon that shows a…", "an arrow pointing right", "big tech companies".
    'shows shown showing looks pointing facing going big large tiny small little huge whats what\'s ' +
    'png jpg jpeg webp format formats file new old official original real proper exact exactly ' +
    'company companies brand brands stuff').split(' '),
);

/**
 * What the icon is for isn't what it is: "a home icon for my project", "for
 * our client's website". Dropped when there's something else to look for.
 */
const PURPOSE =
  /\b(?:for|in|on|to use (?:in|on|for)|to put (?:in|on))(?: (?:my|our|your|his|her|their|this|that|the|a|an|one of my|one of our))+(?: [\p{L}\p{N}'’-]+){0,2}? (?:projects?|website|websites|web ?site|site|apps?|application|designs?|presentation|deck|slides?|clients?(?:'s)?|startup|company|business|team|brand|portfolio|blog|store|shop|product|work|ui|ux|landing page|page|dashboard|resume|cv|thesis|assignment|poster|flyer|banner|video|channel|figma file|file|mockup|prototype|homework)\b/gu;
/**
 * Groups of brands people ask for by kind: "big tech logos", "social media
 * logos". Logos are found by brand, so the group becomes its brands.
 */
const BRAND_GROUPS: Array<[RegExp, string[]]> = [
  [/\b(big tech|tech giants?|faang|maang|tech companies)\b/, ['google', 'apple', 'microsoft', 'amazon', 'meta']],
  [/\b(social media|social networks?|socials?|social)\b/, ['facebook', 'instagram', 'twitter', 'linkedin', 'youtube', 'tiktok']],
  [/\b(payments?|payment methods?|cards?|credit cards?|checkout)\b/, ['visa', 'mastercard', 'paypal', 'stripe', 'apple pay', 'google pay']],
  [/\b(streaming|video streaming|music streaming)\b/, ['netflix', 'spotify', 'youtube', 'twitch', 'disney']],
  [/\b(messaging|chat apps?|messengers?)\b/, ['whatsapp', 'telegram', 'slack', 'discord', 'messenger']],
  [/\b(dev tools|developer tools|code hosting|git)\b/, ['github', 'gitlab', 'bitbucket', 'vscode', 'docker']],
  [/\b(front ?end frameworks?|js frameworks?|javascript frameworks?)\b/, ['react', 'vue', 'angular', 'svelte', 'nextjs']],
  [/\b(design tools?|design apps?)\b/, ['figma', 'sketch', 'adobe', 'framer', 'canva']],
  [/\b(cloud providers?|cloud platforms?|cloud)\b/, ['aws', 'google cloud', 'azure', 'digitalocean', 'vercel']],
];

/** Brands people list side by side ("facebook twitter instagram"): each is its own search. */
const BRAND_NAMES = new Set(
  ('facebook twitter instagram linkedin youtube tiktok whatsapp telegram slack discord github gitlab google apple ' +
    'microsoft amazon netflix spotify figma dribbble behance pinterest reddit snapchat paypal visa mastercard stripe ' +
    'dropbox notion react vue angular svelte javascript typescript python android windows chrome firefox safari').split(' '),
);

/** Request words that are also icon subjects, kept when they name the icon ("search icon"). */
const ALSO_SUBJECTS = new Set('search share help send add list view like open look display'.split(' '));
const NOUN_WORDS = /^(icons?|logos?|illustrations?|symbols?|glyphs?)$/;

/** What's left to search for once the request words are gone. */
function searchWords(text: string): string {
  const tokens = text
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/'s\b|'/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const asker = /^(you|u|me|i|please|pls|can|could|to|and|lets|let)$/;
  const kept = tokens.filter(
    (w, i) =>
      // "3 icons: cart, heart and user": a count isn't a subject ("404 page" is).
      !(/^\d+$/.test(w) && NOUN_WORDS.test(tokens[i + 1] ?? '')) &&
      (!FILLER.has(w) ||
        // "search icon", "share icon": request words that are also what's drawn, right before the noun…
        (ALSO_SUBJECTS.has(w) && NOUN_WORDS.test(tokens[i + 1] ?? '') && !asker.test(tokens[i - 1] ?? ''))),
  );
  // …or the last word, with nothing else to search for ("lucide search").
  const last = tokens[tokens.length - 1];
  if (!kept.length && last && ALSO_SUBJECTS.has(last) && !asker.test(tokens[tokens.length - 2] ?? '')) kept.push(last);
  return kept.join(' ').trim();
}

/** "for my X" said of the visitor's own thing, whatever it is. */
const POSSESSIVE_PURPOSE = /\b(?:for|in|on) (?:my|our) [\p{L}\p{N}'’-]+(?: [\p{L}\p{N}'’-]+)?\s*$/u;

/** "hey i want…", "hi buddy, …": a greeting in front of a request isn't part of it. */
const LEADING_GREETING = /^(?:(?:hey|hi|hii+|hello|helo|hiya|yo|hola|dear|so|please|pls|plz|kindly)(?: there| buddy| motvin(?: buddy)?)?\b[\s,.!:-]*)+/;

/**
 * Brand names people type in pieces or short ("linked in", "you tube", "insta"),
 * written as the icon and logo names have them.
 */
const BRAND_JOINS: Array<[RegExp, string]> = [
  [/\blinked ?-?in\b/g, 'linkedin'],
  [/\byou ?-?tube\b|\byt\b/g, 'youtube'],
  [/\bface ?-?book\b|\bfb\b/g, 'facebook'],
  [/\binsta(?: ?gram)?\b|\big\b/g, 'instagram'],
  [/\bgit ?-?hub\b/g, 'github'],
  [/\bgit ?-?lab\b/g, 'gitlab'],
  [/\bwhats? ?'?s? ?app\b|\bwa\b/g, 'whatsapp'],
  [/\btik ?-?tok\b/g, 'tiktok'],
  [/\bpay ?-?pal\b/g, 'paypal'],
  [/\bdrop ?-?box\b/g, 'dropbox'],
  [/\bword ?-?press\b/g, 'wordpress'],
  [/\bsnap ?-?chat\b/g, 'snapchat'],
  [/\bsound ?-?cloud\b/g, 'soundcloud'],
  [/\bmaster ?-?card\b/g, 'mastercard'],
  [/\bjava ?-?script\b/g, 'javascript'],
  [/\btype ?-?script\b/g, 'typescript'],
  [/\bnode ?\.? ?js\b/g, 'nodejs'],
  [/\bopen ?-?ai\b/g, 'openai'],
];

/** Emoji people type for what they mean ("🔔 icon", "solid ❤️"), as the names icons have. */
const EMOJI_WORDS: Array<[RegExp, string]> = [
  [/🏠|🏡/gu, 'home'], [/❤️|❤|♥️|♥|💙|💚|💛|🧡|💜|🖤|🤍/gu, 'heart'], [/⭐|🌟|★/gu, 'star'], [/🔔/gu, 'bell'],
  [/🔍|🔎/gu, 'search'], [/⚙️|⚙/gu, 'settings'], [/🛒/gu, 'cart'], [/📷|📸/gu, 'camera'], [/✉️|✉|📧|📩/gu, 'mail'],
  [/📞|☎️|☎|📱/gu, 'phone'], [/👤|🧑|👨|👩/gu, 'user'], [/👥/gu, 'users'], [/🗑️|🗑/gu, 'trash'], [/☀️|☀|🌞/gu, 'sun'],
  [/🌙|🌛|🌜/gu, 'moon'], [/☁️|☁/gu, 'cloud'], [/🌧️|🌧/gu, 'rain'], [/❄️|❄/gu, 'snow'], [/⚡/gu, 'lightning'],
  [/🔥/gu, 'fire'], [/🚀/gu, 'rocket'], [/🔒|🔐/gu, 'lock'], [/🔓/gu, 'unlock'], [/🔑|🗝️/gu, 'key'], [/📁|📂/gu, 'folder'],
  [/📄|📃/gu, 'file'], [/📅|📆|🗓️/gu, 'calendar'], [/⏰|⏱️|🕐/gu, 'clock'], [/💬|🗨️/gu, 'chat'], [/👍/gu, 'thumbs up'],
  [/👎/gu, 'thumbs down'], [/✅|✔️|✔|☑️/gu, 'check'], [/❌|✖️|✖/gu, 'close'], [/➕/gu, 'plus'], [/➖/gu, 'minus'],
  [/⬆️|⬆/gu, 'arrow up'], [/⬇️|⬇/gu, 'arrow down'], [/⬅️|⬅/gu, 'arrow left'], [/➡️|➡/gu, 'arrow right'], [/🎵|🎶/gu, 'music'],
  [/🎮/gu, 'game'], [/💰|💵|💲/gu, 'money'], [/💳/gu, 'credit card'], [/🌍|🌎|🌏|🌐/gu, 'globe'], [/📍/gu, 'location'],
  [/🎁/gu, 'gift'], [/🏆/gu, 'trophy'], [/🔗/gu, 'link'], [/✏️|✏|🖊️|📝/gu, 'edit'], [/📊|📈/gu, 'chart'], [/🖼️/gu, 'image'],
  [/😀|😃|😄|😊|🙂|😁/gu, 'smile'], [/😢|😞|☹️|🙁/gu, 'sad'], [/🐱/gu, 'cat'], [/🐶/gu, 'dog'], [/🍕/gu, 'pizza'], [/☕/gu, 'coffee'],
  [/🚗|🚙/gu, 'car'], [/✈️|✈/gu, 'airplane'], [/⚠️|⚠/gu, 'warning'], [/ℹ️|ℹ/gu, 'info'], [/❓|❔/gu, 'question'],
];

export function normalizeText(text: string): string {
  let out = text;
  // "🏠🏠" is still one home.
  for (const [re, word] of EMOJI_WORDS) out = out.replace(re, ` ${word} `).replace(new RegExp(`(?:\\b${word}\\b\\s*){2,}`, 'g'), `${word} `);
  const greeted = out.replace(LEADING_GREETING, '').trim();
  // "hi" on its own stays a greeting.
  if (greeted) out = greeted;
  for (const [re, word] of BRAND_JOINS) out = out.replace(re, word);
  // "next page please", "home icon thanks": a polite ending isn't part of it.
  const polite = out.replace(/[\s,]+(?:please|pls|plz|thanks|thank you|thx|buddy)[!. ]*$/, '').trim();
  if (polite) out = polite;
  // "close/cancel icon": either name will do, so the first.
  out = out.replace(/([\p{L}\p{N}]+)\s*\/\s*[\p{L}\p{N}]+/gu, '$1');
  // "home-icon", "user_logo": the noun is its own word.
  out = out.replace(/[-_](icons?|logos?|illustrations?)\b/g, ' $1');
  // "something that looks like a gear", "similar to a bell": what follows is the subject.
  out = out.replace(/\b(?:that |which )?(?:looks?|looking|look(?:s|ing)? kind of|similar|resembles?|kinda|kind of|sort of)(?: like| to)?\b/g, ' ');
  // "what's popular right now", "open source icons": phrases that name no icon.
  out = out.replace(/\b(?:right now|at the moment|these days|currently|open[ -]source)\b/g, ' ');
  // "go to the logos page": the page is the library.
  out = out.replace(/\b(icons?|logos?|illustrations?) (?:page|section|tab|library)\b/g, '$1');
  return out.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

type Collection = { id: string; name: string };

/**
 * Everyday words that are also source names — "Weather Icons", "Payment
 * Icons", "Material", "Feather". Said plainly they're what to look for
 * ("weather icons"); they only mean the source when said as one ("from Weather
 * Icons", "the Feather set"). Topic names from /stats join these per library.
 */
const PLAIN_WORDS = new Set(
  ('weather payment medical flag flags map maps file files health bitcoin crypto cryptocurrency memory garden ' +
    'spinner spinners feather line mono metro elegant vivid cloud brand brands emoji emojis game games ' +
    'gaming social design pixel color colour flat block windows google kubernetes wordpress covid music food ' +
    'travel sports nature people business finance education home time shapes arrows device').split(' '),
);

type SourceAlias = { alias: string; id: string; name: string; plain: boolean; weak?: boolean };

/**
 * Source names a visitor might type, longest first so "Tabler Icons" beats
 * "Tabler". Names only: ids like "logos" (SVG Logos) or "weather" are words
 * people type for other reasons.
 */
function sourceAliases(stats: LibraryStats | null): SourceAlias[] {
  const topics = new Set(Object.keys(stats?.counts.category ?? {}).map((c) => c.toLowerCase()));
  const isPlain = (core: string) =>
    core.split(/\s+/).every((w) => PLAIN_WORDS.has(w) || FILLER.has(w) || topics.has(w) || topics.has(`${w}s`));
  const out: SourceAlias[] = [];
  for (const c of (stats?.collections ?? []) as Collection[]) {
    if (!c?.id || !c?.name) continue;
    const name = c.name.toLowerCase();
    const short = name.replace(/\s+(icons?|logos?|emoji|illustrations?|glyphs?)$/, '').replace(/\s+v?\d+$/, '');
    const plain = isPlain(short);
    out.push({ alias: name, id: c.id, name: c.name, plain });
    // "Tabler Icons" is also "Tabler"; "Font Awesome 7" is also "Font Awesome".
    if (short !== name && short.length >= 4) out.push({ alias: short, id: c.id, name: c.name, plain });
    // "Material Symbols" is also "material" (the first set listed wins), unless that word is everyday.
    const first = short.split(/\s+/)[0];
    if (first !== short && first.length >= 6 && !isPlain(first) && !/^(simple|pixel|elegant|google)$/.test(first)) {
      out.push({ alias: first, id: c.id, name: c.name, plain: false, weak: true });
    }
  }
  // Longest first; a first-word alias only after every full name, and only once per word.
  const seen = new Set<string>();
  return out
    .sort((a, b) => Number(a.weak ?? false) - Number(b.weak ?? false) || b.alias.length - a.alias.length)
    .filter((entry) => !entry.weak || (!seen.has(entry.alias) && seen.add(entry.alias)));
}

function escapeRe(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export type ParsedFind = {
  category: Category | null;
  query: string;
  styles: string[];
  sources: Array<{ id: string; name: string }>;
  licenses: string[];
  licenseLabel: string | null;
  sort: { value: string; label: string } | null;
  /** Unknown style for the target library ("duotone logos"). */
  unavailableStyle: string | null;
  /** Named examples ("like visa and mastercard"), one name each. */
  examples: string[];
};

/** Reads a "find" sentence into a library, search words and filters. */
export function parseFind(text: string, ctx: BuddyContext): ParsedFind {
  let rest = ` ${text} `;
  const take = (re: RegExp) => {
    const m = rest.match(re);
    if (m) rest = rest.replace(re, ' ');
    return m;
  };

  // Sources first: "Simple Icons" must not leave a stray "icons" behind.
  const sources: Array<{ id: string; name: string }> = [];
  for (const { alias, id, name, plain, weak } of sourceAliases(ctx.stats)) {
    if (weak && sources.length) continue;
    const a = escapeRe(alias);
    const re = plain
      ? new RegExp(`\\b(?:(?:from|by|using|in)(?: the)? ${a}\\b(?: (?:set|pack|library|collection))?|(?:the )?${a} (?:set|pack|library|collection)\\b)`)
      : new RegExp(`\\b${a}\\b`);
    if (re.test(rest) && !sources.some((s) => s.id === id)) {
      sources.push({ id, name });
      rest = rest.replace(re, ' ');
    }
  }

  // Which library: the noun used ("logos", "an illustration"), else this one.
  let category: Category | null = null;
  // "github logo icon" names two: the library you're in wins.
  const here = new RegExp(`\\b${ctx.config.noun}s?\\b`).test(rest);
  if (here) category = null;
  else if (/\billustrations?\b/.test(rest)) category = 'illustrations';
  else if (/\blogos?\b|\bbrand marks?\b/.test(rest)) category = 'logos';
  else if (/\bicons?\b/.test(rest)) category = 'icons';
  const target = category ?? ctx.config.slug;
  const styles = target === ctx.config.slug ? ctx.config.styles : TARGET_STYLES[target];

  const found: string[] = [];
  let unavailableStyle: string | null = null;
  if (styles.includes('color')) {
    // "white apple logo", "dark github logo": one colour; "javascript logo yellow": its brand colour.
    if (take(/\b(?:black (?:and|&) white|white|dark|black|grey|gray|mono|single colou?r)\b/)) found.push('solid');
    else if (take(/\b(?:red|blue|green|yellow|orange|purple|pink|brown|gold|rainbow|gradient)\b/)) found.push('color');
  } else {
    rest = rest.replace(/\b(?:white|red|blue|green|yellow|orange|purple|pink|brown|grey|gray|gold)\b/g, ' ');
  }
  for (const [re, word] of STYLE_WORDS) {
    if (!take(re)) continue;
    const style = styleFor(word, styles);
    if (style && !found.includes(style)) found.push(style);
    else if (!style) unavailableStyle = STYLE_LABEL[word] ?? word;
  }

  const licenseNames = Object.keys(ctx.stats?.counts.license ?? {});
  const licenses = new Set<string>();
  let licenseLabel: string | null = null;
  for (const [re, test, label] of LICENSE_WORDS) {
    if (!take(re)) continue;
    licenseLabel = label;
    for (const name of licenseNames) if (test(name)) licenses.add(name);
  }

  let sort: ParsedFind['sort'] = null;
  for (const [re, value, label] of SORT_WORDS) {
    if (take(re)) {
      sort = { value, label };
      break;
    }
  }

  // "…for my project", "…in our client's app": drop the purpose when something else is left.
  // "payment logos like visa and mastercard": the examples aren't the search.
  const exampleClause = rest.match(/\b(?:like|such as|e\.?g\.?|including|for example)\b(.*)$/);
  const withoutExamples = rest.replace(/\b(?:like|such as|e\.?g\.?|including|for example)\b.*$/, ' ');
  // Only when names follow: "like icon" is the thumbs-up, not "for example: icon".
  const examples: string[] = exampleClause
    ? exampleClause[1]
        .split(/,|\band\b|\bor\b|&/)
        .map((part) => searchWords(part))
        .filter(Boolean)
        .slice(0, 5)
    : [];
  if (examples.length) rest = withoutExamples;
  const withoutPurpose = rest
    .replace(POSSESSIVE_PURPOSE, ' ')
    .replace(PURPOSE, ' ')
    .replace(/\bfor (?:social media|the web|web|mobile|ios|android|print|desktop)\b/, ' ');
  if (searchWords(withoutPurpose)) rest = withoutPurpose;
  // "icons for a food delivery app": what's left is the subject; the trailing "app" is what it's for.
  else
    rest = rest
      .replace(/\b(?:for|in|on)(?: (?:my|our|your|this|the|a|an))?\b/g, ' ')
      .replace(/\b(?:apps?|websites?|site|projects?|footer|header|navbar|nav bar|sidebar|resume|cv|portfolio|slides?|presentation|deck|blog|landing page)\s*$/, ' ');
  // "big tech logos": the brands that means, one at a time.
  if (target === 'logos' && !examples.length) {
    const group = BRAND_GROUPS.find(([re]) => re.test(rest));
    if (group) {
      rest = rest.replace(group[0], ' ');
      if (!searchWords(rest)) examples.push(...group[1]);
    }
  }
  // "home, user and settings icons": a list (commas, or three or more names; on logos, any "and" —
  // brands never combine) is searched one at a time, the first now and the rest as chips.
  let list: string[] = [];
  if (!examples.length) {
    let parts = rest.split(/,|;|\band\b|\bor\b|&|\+/).map((part) => searchWords(part)).filter(Boolean);
    let commas = /,/.test(rest);
    const named = searchWords(rest).split(' ').filter(Boolean);
    if (parts.length === 1 && named.length >= 2 && named.every((word) => BRAND_NAMES.has(word))) {
      parts = named;
      commas = true;
    }
    if (parts.length >= 2 && parts.every((part) => part.split(' ').length <= 2) && (commas || parts.length >= 3 || target === 'logos')) {
      list = parts.slice(0, 5);
      rest = ` ${list[0]} `;
    }
  }
  let query = searchWords(rest);
  // "icons like home and settings": with no subject of its own, the first example is the search.
  if (!query && examples.length) query = examples[0];
  // "light icons": with nothing else to look for, light is the weight, not a lamp.
  if (query === 'light' && !found.length && styles.includes('thin')) {
    query = '';
    found.push('thin');
  }

  return {
    category,
    query,
    // Styles are single-select in the panel; keep the first named.
    styles: found.slice(0, 1),
    // Sources only exist in this library's stats.
    sources: target === ctx.config.slug ? sources : [],
    licenses: target === ctx.config.slug ? [...licenses] : [],
    licenseLabel,
    sort,
    unavailableStyle,
    examples: examples.length ? examples : list.length ? list : [],
  };
}

const TARGET_STYLES: Record<Category, readonly string[]> = {
  icons: ['outline', 'solid', 'duotone', 'thin', '3d'],
  logos: ['color', 'solid'],
  illustrations: ['color', 'solid'],
};

// ---------------------------------------------------------------------------
// Answers
// ---------------------------------------------------------------------------

function reply(text: string, extra: Partial<BuddyReply> = {}): BuddyReply {
  return { text, chips: [], kind: 'answer', ...extra };
}

/** Three starter searches for this library, with real values. */
export function starterChips(ctx: BuddyContext): BuddyChip[] {
  // The first source in the panel's list, the one visitors see first.
  const topSource = ((ctx.stats?.collections ?? []) as Collection[])[0];
  if (ctx.config.slug === 'icons') {
    return [
      { label: 'Thin weather icons', ask: 'thin weather icons' },
      topSource
        ? { label: `${topSource.name} icons`, ask: `${topSource.name} icons` }
        : { label: 'Solid home icons', ask: 'solid home icons' },
      { label: 'Outline arrows, MIT', ask: 'outline arrow icons, MIT only' },
    ];
  }
  if (ctx.config.slug === 'logos') {
    return [
      { label: 'Google logos', ask: 'google logos' },
      { label: 'Solid Apple logos', ask: 'solid apple logos' },
      { label: 'Color Instagram logos', ask: 'color instagram logos' },
    ];
  }
  return [
    { label: 'Doodles of people', ask: 'people doodles' },
    { label: 'Solid illustrations', ask: 'solid illustrations' },
    { label: 'Business illustrations', ask: 'business illustrations' },
  ];
}

function describeFind(p: ParsedFind, target: Category): string {
  const lib = LIBRARIES[target];
  const parts: string[] = [];
  if (p.styles[0]) parts.push(STYLE_LABEL[p.styles[0]] ?? p.styles[0]);
  if (p.query) parts.push(`“${p.query}”`);
  parts.push(lib.nounPlural);
  let text = parts.join(' ');
  if (p.sources.length) text += ` from ${p.sources.map((s) => s.name).join(' and ')}`;
  if (p.licenseLabel) text += p.licenseLabel === 'commercial-friendly' ? ', free for commercial use' : `, ${p.licenseLabel} only`;
  if (p.sort) text += `, sorted ${p.sort.label}`;
  return text;
}

/**
 * Not a search: how-to, licence, count and "what is" questions. Buddy only
 * searches, so these get a pointer back rather than a guessed search for
 * "recolor" or "commercial". A question that asks for something ("do you
 * have heart icons?", "can you show me cart icons") is still a search.
 */
const ASKS = /^(how|can|could|where|what|why|is|are|do|does|which|tell|explain)\b|\?\s*$/;
const NOT_A_SEARCH =
  /\b(recolou?r|colou?r|licen[cs]es?|licensed|commercial(?:ly)?|attribution|credit|allowed|legal|copyright|shortcuts?|keyboard|hotkeys?|download(?:ing)?|export|copy|paste|code|jsx|react code|figma plugin|plugins?|save|saved|favou?rites?|bookmark|collections?|compare|size|bigger|smaller|resize|stroke|thickness|how many|count|number of|difference|means?|meaning|price|cost|pricing|paid|free|use (?:these|them|this|it|an?|the)|work|works)\b/;
const ASKS_FOR_THINGS = /\b(show|find|give|get|need|want|search|looking|have|got|any|some)\b.*\b(icons?|logos?|illustrations?|doodles?)\b/;
const HOW_TO_STATEMENT = /\b(recolou?r|change (?:[\w-]+ ){0,2}colou?rs?|make (?:it|them|the \w+) (?:bigger|smaller))\b|^(download|export|copy)\b(?! (?:an? )?(?:[\w-]+ )?(?:icons?|logos?|illustrations?)\b)/;

function notASearch(t: string, ctx: BuddyContext): BuddyReply | null {
  const offTopic = (ASKS.test(t) && NOT_A_SEARCH.test(t) && !ASKS_FOR_THINGS.test(t)) || HOW_TO_STATEMENT.test(t);
  if (!offTopic) return null;
  const example = { icons: 'outline home icons', logos: 'solid google logos', illustrations: 'doodles of people' }[ctx.config.slug];
  return reply(`I only search icons, logos and illustrations. Tell me what you need — like “${example}” — and I'll show them.`, {
    kind: 'clarify',
    chips: starterChips(ctx),
  });
}

/** The params a find sentence sets. A fresh search replaces filters; a bare refinement keeps the rest. */
function findPatch(p: ParsedFind, ctx: BuddyContext, fresh: boolean): Partial<LibraryParams> {
  const patch: Partial<LibraryParams> = fresh
    ? { query: p.query, styles: p.styles, sources: p.sources.map((s) => s.id), licenses: p.licenses, categories: [] }
    : {
        ...(p.styles.length ? { styles: p.styles } : {}),
        ...(p.sources.length ? { sources: p.sources.map((s) => s.id) } : {}),
        ...(p.licenses.length ? { licenses: p.licenses } : {}),
      };
  if (p.sort) patch.sort = p.sort.value;
  // Saved shows a fixed list; a search means the whole library again.
  if (ctx.params.saved) patch.saved = false;
  return patch;
}

function answerControls(t: string, ctx: BuddyContext): BuddyReply | null {
  const { nounPlural } = ctx.config;
  const p = ctx.params;

  // One filter at a time: "remove the style filter", "any style", "remove phosphor", "all sources".
  const drop = t.match(/^(?:remove|clear|drop|reset|undo|no more|without|forget|get rid of)(?: the)? (.+?)(?: filters?)?$|^(?:any|all|every) (styles?|sources?|sets?|licen[cs]es?|topics?|categor(?:y|ies))$/);
  if (drop) {
    const what = (drop[1] ?? drop[2]).trim();
    const source = ((ctx.stats?.collections ?? []) as Collection[]).find((c) => what === c.name.toLowerCase() || what === c.name.toLowerCase().replace(/\s+icons?$/, ''));
    const patch: Partial<LibraryParams> | null = /^(styles?|weight|the style)$/.test(what)
      ? { styles: [] }
      : /^(sources?|sets?|packs?)$/.test(what)
        ? { sources: [] }
        : /^licen[cs]es?$/.test(what)
          ? { licenses: [] }
          : /^(topics?|categor(y|ies))$/.test(what)
            ? { categories: [] }
            : /^(search|query|words?)$/.test(what)
              ? { query: '' }
              : source
                ? { sources: p.sources.filter((id) => id !== source.id) }
                : null;
    if (patch) {
      const label = Object.keys(patch)[0] === 'sources' && source ? source.name : what;
      // Nothing of that kind is on: say so rather than "removing" it.
      const [key] = Object.keys(patch) as Array<keyof LibraryParams>;
      const before = p[key];
      const unchanged = Array.isArray(before) ? before.length === (patch[key] as string[]).length : before === patch[key];
      if (unchanged) return reply(`No ${source ? source.name : what.replace(/s$/, '')} filter is on${p.query ? ` — still “${p.query}”` : ''}.`, { kind: 'answer' });
      return reply(`Removed ${label} — ${p.query ? `still “${p.query}”` : `the rest stays`}.`, { kind: 'action', action: { type: 'params', patch } });
    }
  }
  if (/^(clear|reset|remove|start over|show all|everything|all of them)\b|\b(clear|reset|remove) (all )?(the )?(filters?|search)\b/.test(t)) {
    return reply(`Cleared — showing all ${nounPlural}.`, {
      kind: 'action',
      action: { type: 'params', patch: { query: '', styles: [], sources: [], licenses: [], categories: [], saved: false } },
    });
  }
  const page = t.match(/^(?:go to |open |show )?page (\d{1,4})$/);
  if (page) {
    return reply(`Page ${page[1]}.`, { kind: 'action', action: { type: 'params', patch: { page: Number(page[1]) } } });
  }
  if (/^(first|1st) page$|^(go )?(back )?to the (start|beginning|first page)$/.test(t)) {
    return reply(`Page 1.`, { kind: 'action', action: { type: 'params', patch: { page: 1 } } });
  }
  if (/^(last|final) page$|^(go )?to the (end|last page)$/.test(t)) {
    const pages = Math.max(1, Math.ceil((ctx.shownTotal ?? 0) / PAGE_SIZE));
    return reply(`Page ${pages}.`, { kind: 'action', action: { type: 'params', patch: { page: pages } } });
  }
  if (/^(next|more|next page|show more|load more|more please|(show |give |see )?(me )?(some )?(more|other|different)( ones| options| icons| logos| illustrations)?|something else|others|more like (these|this|that|them|those))$/.test(t)) {
    return reply(`Page ${p.page + 1}.`, { kind: 'action', action: { type: 'params', patch: { page: p.page + 1 } } });
  }
  if (/^(back|previous|prev|previous page|go back)$/.test(t)) {
    if (p.page <= 1) return reply(`You're on the first page.`);
    return reply(`Page ${p.page - 1}.`, { kind: 'action', action: { type: 'params', patch: { page: p.page - 1 } } });
  }
  if (/^(sort|order)\b/.test(t)) {
    const sort = SORT_WORDS.find(([re]) => re.test(t));
    if (sort) return reply(`Sorted ${sort[2]}.`, { kind: 'action', action: { type: 'params', patch: { sort: sort[1] } } });
  }
  return null;
}

function smallTalk(t: string, ctx: BuddyContext): BuddyReply | null {
  if (/^(hi+|hey|hello|hiya|yo|hola|good (morning|afternoon|evening))( there| buddy| motvin( buddy)?)?[!. ]*$/.test(t)) {
    // Short, as the Inspirations Buddy says it ("Hi! Where would you like to go? …"), worded for this library.
    const ask = {
      icons: 'What icons are you looking for? Tell me a name, a style or a source, or pick one below.',
      logos: 'Which logos are you looking for? Tell me a brand, or pick one below.',
      illustrations: 'What illustrations are you looking for? Tell me a subject or a style, or pick one below.',
    }[ctx.config.slug];
    return reply(`Hi! ${ask}`, { kind: 'small-talk', chips: starterChips(ctx) });
  }
  if (/^(thanks?|thank you|thx|ty|cheers|great|perfect|nice|awesome|cool|ok(ay)?|got it|love it)\b(?: (?:a lot|so much|very much|buddy|man|bro|again|mate))*[!. ]*$/.test(t)) {
    return reply(`Anytime — what else are you looking for?`, { kind: 'small-talk' });
  }
  if (/\b(who|what) are you\b|\bwho (made|built|created|designed) you\b|\byour name\b|\bwhat (can|do) you do\b|\bhow (does|do) (this|you) work\b/.test(t)) {
    return reply(`I'm Motvin Buddy. I search icons, logos and illustrations for you — by name, style, source and licence. Just tell me what you need.`, { kind: 'small-talk', chips: starterChips(ctx) });
  }
  if (/^(bye|goodbye|see you|cya)\b/.test(t)) return reply(`Bye — happy designing!`, { kind: 'small-talk' });
  // "can u help me", "i need help finding an icon": nothing named yet.
  const said = (words: RegExp) => t.split(/\s+/).every((w) => words.test(w) || FILLER.has(w) || NOUN_WORDS.test(w));
  if (/\b(help|assist|helping)\b/.test(t) && said(/^(help|helping|assist|finding|find|choose|choosing|pick|picking|out|with)$/)) {
    return reply(`Sure! Tell me what you need — a name like “home” or “arrow”, and a style or source if you like.`, { kind: 'small-talk', chips: starterChips(ctx) });
  }
  // "that is perfect thanks", "wow amazing": praise, nothing to search.
  if (/\b(thanks?|thank|perfect|great|awesome|amazing|nice|cool|love|lovely|wow|exactly|wonderful|brilliant|helpful|fantastic)\b/.test(t) && said(/^(thanks?|thank|perfect|great|awesome|amazing|nice|cool|love|lovely|wow|exactly|wonderful|brilliant|helpful|fantastic|much|lot|very)$/)) {
    return reply(`Anytime — what else are you looking for?`, { kind: 'small-talk' });
  }
  // "this is wrong", "not what i wanted": say sorry and ask again.
  if (/\b(wrong|incorrect|useless|not (?:what|right|it|that)|doesn'?t work|didn'?t work|not working)\b/.test(t) && said(/^(wrong|incorrect|useless|not|wanted|meant|asked|right|work|working|doesnt|didnt|doesn't|didn't|at|all|totally|completely)$/)) {
    return reply(`Sorry about that. Tell me again in other words — a name, and a style or source if you like.`, { kind: 'clarify', chips: starterChips(ctx) });
  }
  return null;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Words the typo fixer may correct towards: source names, styles, licences, nouns. */
/**
 * What people look for most, so "calender", "notifcation" and "shoping" are
 * read right — and so real words near another ("model" and "modal") are known
 * as themselves rather than "fixed".
 */
const SUBJECT_WORDS = (
  'account action activity add address airplane alarm album alert align anchor android apple archive arrow arrows ' +
  'attachment audio award backward badge balance bank banner barcode basket battery beach bell bicycle bitcoin ' +
  'block bluetooth bold book bookmark bottle brain briefcase browser brush bucket budget bug building bullet ' +
  'burger business button cake calculator calendar camera cancel card cards cart cash castle category chart chat ' +
  'check checkbox checkmark chevron chrome circle city clipboard clock close cloud code coffee coin coins collapse ' +
  'column command comment comments compass computer contact contacts contrast cookie copy credit crop crown cursor ' +
  'customer dashboard database delete delivery desktop device diamond dislike document documents dollar download ' +
  'drawer dribbble dropbox drink earth edit education email emoji energy enter envelope error euro event exit ' +
  'expand export eye facebook factory favorite feather female figma file files film filter finance fingerprint fire ' +
  'flag flash flower folder folders football forward frame friends fullscreen funnel gallery game gamepad garden ' +
  'gear gift github gitlab glass glasses globe google graph grid group hammer hand handshake hashtag headphones ' +
  'health heart help history home hospital hotel hourglass house image images import inbox info instagram invoice ' +
  'italic jewelry kanban keyboard laptop layers layout leaf library lightbulb lightning like link linkedin list ' +
  'location lock login logout magnet magnifier mail male maps marker medal medical megaphone menu message messages ' +
  'microphone minus mobile modal model money monitor moon mouse movie music navigation network newspaper note notes ' +
  'notification notifications office package paint palette paper paperclip parking password pause payment pencil ' +
  'people percent person phone photo picture pie pizza plane planet play plug plus pointer power present presentation ' +
  'printer profile puzzle question queue quote radio rain receipt record recycle redo refresh reload remove repeat ' +
  'reply restaurant rocket rotate route ruler running safety save scale school scissors screen search security ' +
  'select send server settings shape share shield shipping shop shopping shuffle sidebar signal skull slack sliders ' +
  'smartphone smile snow social sort sound spark sparkle speaker sport square stack star stars statistics sticker ' +
  'stop storage store suitcase sun support swap switch sync table tablet tag tags target task tasks team telegram ' +
  'telephone terminal text thermometer thumbs ticket timer toggle tools trash travel tree trending trophy truck ' +
  'twitter umbrella underline undo unlock upload user users vehicle video view volume wallet warning watch water ' +
  'weather website whatsapp wifi window windows world wrench youtube zoom'
).split(' ');

export function vocabularyFor(ctx: BuddyContext): string[] {
  const words = new Set<string>([
    'outline', 'solid', 'duotone', 'thin', 'colored', 'icons', 'logos', 'illustrations', 'recolor', 'download',
    'license', 'licensed', 'commercial', 'commercially', 'attribution', 'shortcuts', 'popular', 'popularity',
    'trending', 'filled', 'apache', 'compare', 'doodle', 'doodles', 'empty', 'state', 'working', 'person',
    ...SUBJECT_WORDS,
    'sharp', 'rounded', 'round', 'bold', 'corners', 'corner', 'square', 'circle', 'smooth', 'regular', 'thick',
    'thicker', 'thinner', 'lighter', 'smiley', 'emojis', 'brand', 'symbol', 'symbols',
    'clear', 'reset', 'remove', 'filter', 'filters', 'sorted', 'previous', 'saved', 'plugins', 'packs', 'again',
    'black', 'white', 'grey', 'gray', 'green', 'yellow', 'orange', 'purple', 'brown', 'colour', 'colours',
    // Request words are known too, so they're never "fixed" — except the -ing ones, which the typo
    // fixer leaves alone anyway and which would tie with real subjects ("shoping": shopping or showing).
    ...[...FILLER].filter((w) => !w.endsWith('ing')),
  ]);
  for (const c of (ctx.stats?.collections ?? []) as Collection[]) {
    for (const w of String(c.name ?? '').toLowerCase().split(/[^\p{L}\p{N}]+/u)) if (w.length >= 5) words.add(w);
  }
  return [...words];
}

export function resolveBuddy(raw: string, ctx: BuddyContext): BuddyReply & { corrections: Correction[] } {
  const cleaned = normalizeText(stripChatter(raw).toLowerCase().replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim());
  const { text, corrections } = correctText(cleaned, vocabularyFor(ctx));
  const t = text.replace(/[.!]+$/, '').trim();
  const done = (r: BuddyReply) => ({ ...r, corrections });

  if (!t) return done(reply(`What are you looking for?`, { kind: 'clarify', chips: starterChips(ctx) }));

  // Icon, logo and illustration names are English: a message in another script ("வீடு ஐகான்")
  // can't be searched yet, so say so plainly rather than search its letters.
  if (/[^\p{Script=Latin}\p{N}\p{P}\p{S}\s]/u.test(t) && !/\p{Script=Latin}{2,}/u.test(t)) {
    return done(reply(`I understand English for now — names here are in English. Try “home ${ctx.config.noun}”, or pick one below.`, { kind: 'clarify', chips: starterChips(ctx) }));
  }

  const answered = smallTalk(t, ctx) ?? answerControls(t, ctx) ?? notASearch(t, ctx);
  if (answered) return done(answered);

  // Everything else is a find.
  const p = parseFind(t.replace(/\?+$/, ''), ctx);
  const target = p.category ?? ctx.config.slug;
  const hasFilter = p.styles.length > 0 || p.sources.length > 0 || p.licenses.length > 0;

  // The conversation so far: after "amazon icon", "logo" (or "and logos?", "what about
  // illustrations", "solid logos") means amazon in that library. Plain navigation — "switch to
  // logos", "go to logos" — just goes.
  const navigating = /\b(switch|go|goto|open|take|browse|navigate|visit|back to|move)\b/.test(t);
  if (p.category && p.category !== ctx.config.slug && !p.query && ctx.params.query && !navigating) {
    p.query = ctx.params.query;
    // …and the style comes too, when that library has it (Solid is in all three; 3D only in icons).
    if (!p.styles.length) p.styles = ctx.params.styles.filter((style) => TARGET_STYLES[p.category!].includes(style));
  }
  // "what about bell?", "now a bell", "and a heart": a new subject in the same conversation keeps
  // the style, source and licence already chosen.
  const sameFilters =
    /^(what about|how about|and|also|now|same for|then|ok now|next)\b/.test(t) &&
    Boolean(p.query) &&
    !hasFilter &&
    target === ctx.config.slug &&
    ctx.params.styles.length + ctx.params.sources.length + ctx.params.licenses.length > 0;
  if (sameFilters) {
    const kept = [
      ...ctx.params.styles.map((s) => STYLE_LABEL[s] ?? s),
      ...((ctx.stats?.collections ?? []) as Collection[]).filter((c) => ctx.params.sources.includes(c.id)).map((c) => `from ${c.name}`),
      ...(ctx.params.licenses.length ? ['the same licences'] : []),
    ].join(', ');
    return done(reply(`Showing “${p.query}” ${ctx.config.nounPlural} — still ${kept}.`, {
      kind: 'action',
      action: { type: 'params', patch: { query: p.query, ...(ctx.params.saved ? { saved: false } : {}) } },
      chips: followUps(ctx.params.styles, ctx.params.licenses, ctx),
    }));
  }

  if (!p.query && !hasFilter && !p.sort) {
    if (p.category && p.category !== ctx.config.slug) {
      return done(reply(`Opening ${LIBRARIES[p.category].title}.`, { kind: 'action', action: { type: 'library', category: p.category } }));
    }
    if (p.unavailableStyle) {
      return done(reply(`${LIBRARIES[target].title} don't come in ${p.unavailableStyle}. Try ${TARGET_STYLES[target].map((s) => STYLE_LABEL[s]).join(' or ')}.`, {
        kind: 'clarify',
        chips: TARGET_STYLES[target].map((s) => ({ label: STYLE_LABEL[s], action: { type: 'params' as const, patch: { styles: [s] } } })),
      }));
    }
    return done(reply(`Which ${ctx.config.nounPlural} do you need? Tell me a name, or pick one below.`, { kind: 'fallback', chips: starterChips(ctx) }));
  }

  // Logos are found by brand name, not by what they're for: "payment logos like visa and
  // mastercard" shows Visa, with the others a tap away.
  if (target === 'logos' && p.examples.length > 0) {
    const [first, ...others] = p.examples;
    const patch: Partial<LibraryParams> = { query: first, styles: p.styles };
    const chips: BuddyChip[] = others.map((name) => ({ label: `“${name}” logos`, action: { type: 'params', patch: { query: name } } }));
    const text = `Showing “${first}” logos${others.length ? ` — logos are found by brand, so the others are below` : ''}.`;
    if (target !== ctx.config.slug) {
      return done(reply(text, { kind: 'action', action: { type: 'library', category: 'logos', patch } }));
    }
    return done(reply(text, { kind: 'action', action: { type: 'params', patch: { ...findPatch(p, ctx, true), ...patch } }, chips }));
  }

  // "home, user and settings icons": the first now, the others a tap away.
  const others = target !== 'logos' && p.examples.length > 1 && p.query === p.examples[0] ? p.examples.slice(1) : [];

  if (target !== ctx.config.slug) {
    const patch: Partial<LibraryParams> = { query: p.query, styles: p.styles };
    if (p.sort) patch.sort = p.sort.value;
    return done(reply(`Opening ${describeFind(p, target)}.`, { kind: 'action', action: { type: 'library', category: target, patch } }));
  }

  // "only MIT", "make it thin": a bare refinement keeps the current search.
  // Only filters, nothing new to look for ("only MIT", "it's not good, give me solid"): a follow-up
  // on what's showing, so the search stays and the rest of the filters too.
  // (A fresh page, with nothing searched or filtered yet, has nothing to follow up on.)
  const current = ctx.params;
  const viewing = Boolean(current.query) || current.styles.length + current.sources.length + current.licenses.length + current.categories.length > 0;
  const refine = !p.query && hasFilter && ctx.shownTotal !== 0 && viewing;
  const patch = findPatch(p, ctx, !refine);
  const note = p.unavailableStyle ? ` (${LIBRARIES[target].title} don't come in ${p.unavailableStyle}.)` : '';
  const added = [
    ...p.styles.map((s) => STYLE_LABEL[s] ?? s),
    ...p.sources.map((s) => `from ${s.name}`),
    ...(p.licenseLabel ? [p.licenseLabel === 'commercial-friendly' ? 'free for commercial use' : `${p.licenseLabel} only`] : []),
  ].join(', ');
  const kept = ctx.params.query ? `Kept “${ctx.params.query}” — now ${added}.` : `Now ${added}.`;
  const said = refine ? kept : `Showing ${describeFind(p, target)}.`;
  const listNote = others.length ? ` The others are below.` : '';
  return done(reply(`${said}${note}${listNote}`, {
    kind: 'action',
    action: { type: 'params', patch },
    chips: [
      ...others.map((name) => ({ label: `“${name}” ${LIBRARIES[target].nounPlural}`, action: { type: 'params' as const, patch: { query: name } } })),
      ...followUps(refine ? (patch.styles ?? ctx.params.styles) : p.styles, refine ? (patch.licenses ?? ctx.params.licenses) : p.licenses, ctx),
    ],
  }));
}

/** Next steps after a find: real filters it could add. */
function followUps(styles: string[], licenses: string[], ctx: BuddyContext): BuddyChip[] {
  const chips: BuddyChip[] = [];
  if (!styles.length) {
    for (const s of ctx.config.styles.slice(0, 3)) chips.push({ label: `Only ${STYLE_LABEL[s]}`, action: { type: 'params', patch: { styles: [s] } } });
  }
  if (!licenses.length && ctx.stats) {
    const ok = Object.keys(ctx.stats.counts.license).filter((name) => !/\bnc\b|-nc/i.test(name));
    if (ok.length) chips.push({ label: 'Commercial-friendly', action: { type: 'params', patch: { licenses: ok } } });
  }
  chips.push({ label: 'Clear filters', ask: 'clear filters' });
  return chips;
}

/**
 * A find that came back empty: say so, and offer to drop one thing at a time.
 * `names` turns source ids back into the names shown.
 */
export function emptyResultReply(params: LibraryParams, ctx: BuddyContext): BuddyReply {
  const nameOf = (id: string) =>
    ((ctx.stats?.collections ?? []) as Collection[]).find((c) => c.id === id)?.name ?? id;
  const chips: BuddyChip[] = [];
  if (params.styles.length) {
    chips.push({ label: `Without ${params.styles.map((s) => STYLE_LABEL[s] ?? s).join(', ')}`, action: { type: 'params', patch: { styles: [] } } });
  }
  if (params.sources.length) {
    chips.push({ label: `Without ${params.sources.map(nameOf).join(', ')}`, action: { type: 'params', patch: { sources: [] } } });
  }
  if (params.licenses.length) chips.push({ label: 'Any licence', action: { type: 'params', patch: { licenses: [] } } });
  if (params.categories.length) chips.push({ label: 'Any topic', action: { type: 'params', patch: { categories: [] } } });
  // "home project should": several words found nothing together; one of them alone may.
  const words = params.query.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    chips.unshift(...words.slice(0, 3).map((word) => ({ label: `Just “${word}”`, action: { type: 'params' as const, patch: { query: word } } })));
  }
  const filtered = params.styles.length + params.sources.length + params.licenses.length + params.categories.length > 0;
  if (params.query && filtered) {
    chips.push({ label: `Only “${params.query}”`, action: { type: 'params', patch: { styles: [], sources: [], licenses: [], categories: [] } } });
  }
  // The same search may be in another library ("travel": no illustrations, hundreds of icons).
  if (params.query && !filtered) {
    for (const slug of Object.keys(LIBRARIES) as Category[]) {
      if (slug === ctx.config.slug) continue;
      chips.push({ label: `“${params.query}” ${LIBRARIES[slug].nounPlural}`, action: { type: 'library', category: slug, patch: { query: params.query } } });
    }
  }
  const tried = chips.some((chip) => chip.label.startsWith('Just “'));
  const text = tried || filtered
    ? words.length > 1
      ? `Nothing has all of “${params.query}” together. Try one word, or loosen a filter:`
      : `No ${describeView(params, ctx)}. Loosen one thing:`
    : chips.length
      ? `No ${ctx.config.nounPlural} match “${params.query}”. Try another word, or look in ${elsewhere(ctx)}:`
      : `No ${ctx.config.nounPlural} match “${params.query}”. Try another word — a simpler one often works.`;
  return { text, chips, kind: 'clarify' };
}

/**
 * Smaller searches to try when every word together found nothing (search
 * needs all of them): "person working laptop" → "person working", "person
 * laptop", "working laptop", then each word alone. Longest first, so the
 * closest to what was asked wins.
 */
export function looserQueries(query: string): string[] {
  const words = query.split(/\s+/).filter(Boolean).slice(0, 4);
  if (words.length < 2) return [];
  const out: string[] = [];
  for (let size = words.length - 1; size >= 1; size--) {
    const pick = (start: number, chosen: string[]) => {
      if (chosen.length === size) return void out.push(chosen.join(' '));
      for (let i = start; i < words.length; i++) pick(i + 1, [...chosen, words[i]]);
    };
    pick(0, []);
  }
  return out;
}

/** Everyday names for the libraries' topics ("big tech" is Technology). */
const TOPIC_WORDS: Record<string, string[]> = {
  Technology: ['tech', 'technology', 'software', 'it', 'developer', 'dev', 'computer'],
  Social: ['social', 'social media', 'socials'],
  Finance: ['finance', 'fintech', 'bank', 'banking', 'money', 'payment', 'payments', 'crypto'],
  Commerce: ['commerce', 'ecommerce', 'e-commerce', 'shop', 'shopping', 'store', 'retail'],
  Food: ['food', 'restaurant', 'drinks', 'cooking'],
  Health: ['health', 'medical', 'healthcare', 'hospital', 'fitness'],
  Healthcare: ['health', 'medical', 'healthcare', 'hospital'],
  Education: ['education', 'school', 'learning', 'study', 'science'],
  Travel: ['travel', 'trip', 'tourism', 'holiday'],
  Automotive: ['car', 'cars', 'auto', 'automotive', 'vehicle'],
  Entertainment: ['entertainment', 'movies', 'games', 'streaming', 'music'],
  Sports: ['sport', 'sports', 'fitness'],
  People: ['people', 'person', 'persons', 'users', 'humans', 'team'],
  Business: ['business', 'office', 'work', 'corporate'],
  Weather: ['weather', 'climate'],
};

/** The library topic a search names, when it has anything in it ("tech" → Technology). */
export function topicFor(query: string, counts: Record<string, number>): string | null {
  const word = query.trim().toLowerCase();
  if (!word) return null;
  for (const [name, total] of Object.entries(counts)) {
    if (!total) continue;
    const lower = name.toLowerCase();
    if (lower === word || `${lower}s` === word || TOPIC_WORDS[name]?.includes(word)) return name;
  }
  return null;
}

/** The other two libraries, as a phrase: "Icons or Logos". */
export function elsewhere(ctx: Pick<BuddyContext, 'config'>): string {
  return (Object.keys(LIBRARIES) as Category[])
    .filter((slug) => slug !== ctx.config.slug)
    .map((slug) => LIBRARIES[slug].title)
    .join(' or ');
}

/** What the page is set to show, in words: "Solid “amazon” logos from SVG Logos". */
function describeView(params: LibraryParams, ctx: BuddyContext): string {
  const parts: string[] = [];
  if (params.styles.length) parts.push(params.styles.map((s) => STYLE_LABEL[s] ?? s).join(', '));
  if (params.query) parts.push(`“${params.query}”`);
  parts.push(ctx.config.nounPlural);
  let text = parts.join(' ');
  const sources = ((ctx.stats?.collections ?? []) as Collection[]).filter((c) => params.sources.includes(c.id)).map((c) => c.name);
  if (sources.length) text += ` from ${sources.join(' and ')}`;
  if (params.categories.length) text += ` in ${params.categories.join(', ')}`;
  if (params.licenses.length) text += ` with that licence`;
  return text;
}
