/**
 * Which platform a message means, in the words people type. Motvin has three:
 *
 * - Apps — iPhone apps (iOS): "ios", "iphone", "settings for apps", "in apps". A plain "apps" keeps to the section
 *   the visitor is in ("food apps" on Webs are Webs' food apps).
 * - Web Apps — tools used in a browser: "web app", "web apps", "browser apps".
 * - Webs — "web", "webs": the Webs section, web apps and websites together; "website", "sites": websites alone.
 *
 * The message is rewritten with one plain phrase for the platform ("on ios", "on web apps", "on the web",
 * "on websites") that the rest of Buddy reads, whatever the visitor's own wording or word order was.
 */
export type PlatformAsk = 'ios' | 'webapp' | 'webs' | 'website';

const WEBAPP = /\b(?:web ?apps?|web applications?|browser apps?|online apps?)\b/g;
const WEBSITE = /\b(?:web ?sites?|sites?)\b/g;
// Not the "web" of "web design" or "web developer": those are crafts, not a platform.
const WEBS = /\b(?:webs|web(?! ?(?:design|designers?|development|developers?|dev)\b)|desktop|browser)\b/g;
const IOS = /\b(?:ios|iphone|ipad)(?: ?apps?)?\b/g;
// "apps" as a place to look: "login for apps", "pricing in apps", "what about the apps".
const APP_PLACE = /\b(?:in|on|for|from)\s+(?:the\s+)?apps?\b/g;

const PHRASE: Record<PlatformAsk, string> = { ios: 'on ios', webapp: 'on web apps', webs: 'on the web', website: 'on websites' };

/** What is left once the words that only point somewhere are gone ("for", "what about", "the"). */
const POINTING = /\b(?:for|on|in|of|from|to|the|what|about|how|and|or|only|just|now|instead|show|me|please|pls|ok|okay|then|versions?|platforms?|ones?|side|sections?|too|also|same|but|it|them|those|that|this|i|want|need|see|mean|meant|no|yes|try|there|here|view|open|go)\b/g;

function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s+([?.!,])/g, '$1').trim();
}

// "not on web", "except websites", "other than ios": a platform ruled out, which Buddy reads as it stands.
const RULED_OUT = /\b(?:not|except|excluding|without|other than|apart from|but not|no)\s+(?:\w+\s+){0,3}$/;

/**
 * The platform a message names, and the message with that platform said the one plain way, where it was said.
 * A message naming two platforms ("ios and web", "web apps vs websites"), or ruling one out ("not on web"), is
 * left as it is; so is one that is only the platform ("on ios?", "what about web apps"), which Buddy reads about
 * the app being talked about.
 */
export function readPlatformAsk(raw: string, opts: { asksCount: boolean }): { ask: PlatformAsk | null; text: string; rest: string } {
  const lower = raw.toLowerCase();
  const none = { ask: null, text: raw, rest: tidy(lower) };
  const matches: { ask: PlatformAsk; index: number; length: number }[] = [];
  let masked = lower;
  const take = (re: RegExp, ask: PlatformAsk) => {
    for (const m of masked.matchAll(re)) {
      matches.push({ ask, index: m.index ?? 0, length: m[0].length });
    }
    masked = masked.replace(re, (m) => ' '.repeat(m.length));
  };
  take(WEBAPP, 'webapp');
  take(WEBSITE, 'website');
  take(WEBS, 'webs');
  take(IOS, 'ios');
  if (!matches.length && !opts.asksCount) take(APP_PLACE, 'ios');
  const kinds = new Set(matches.map((m) => m.ask));
  if (kinds.size !== 1) return none;
  if (matches.some((m) => RULED_OUT.test(lower.slice(0, m.index)))) return none;
  const ask = matches[0].ask;
  const rest = tidy(masked.replace(/\b(?:in|on|for|of|from|to)\s+(?:the\s+)?(?=\s*$)/, ' '));
  // Nothing but the platform: as typed.
  if (!rest.replace(POINTING, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()) return { ask, text: raw, rest };
  // The first mention becomes the plain phrase (taking any "for"/"on" before it); later ones go.
  const first = [...matches].sort((a, b) => a.index - b.index)[0];
  let text = lower;
  for (const m of [...matches].sort((a, b) => b.index - a.index)) {
    const before = text.slice(0, m.index);
    const lead = m === first ? before.replace(/\b(?:in|on|for|from|to)\s+(?:the\s+)?$/, '') : before;
    text = `${lead}${m === first ? PHRASE[ask] : ''}${text.slice(m.index + m.length)}`;
  }
  return { ask, text: tidy(text), rest };
}

/**
 * A message that only moves the last question to another platform: "for web", "on ios", "what about web apps",
 * "websites?". Plain "apps" alone is a page to open, not a move.
 */
export function isPlatformMove(raw: string): boolean {
  const lower = raw.toLowerCase();
  const read = readPlatformAsk(lower, { asksCount: false });
  if (!read.ask) return false;
  if (read.rest.replace(POINTING, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()) return false;
  // "show websites", "list web apps", "open webs": a list to open, not the last question moved.
  const asksForList = /\b(?:show|list|open|give|browse|see|view|all|which|any)\b/.test(lower);
  return !asksForList;
}

/** The last question without its platform words, so a move can say the new platform instead. */
export function withoutPlatform(raw: string): string {
  const read = readPlatformAsk(raw, { asksCount: /\bhow (?:many|much)\b/.test(raw.toLowerCase()) });
  return read.ask ? read.rest : raw;
}
