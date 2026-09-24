/**
 * Classifying a screen, naming a flow, and describing what was seen — without
 * a model.
 *
 * Everything here runs from offline signals: the text Vision read off the
 * screenshot, its brightness and dominant colours, and what the segmenter
 * worked out about the frame's place in the recording — first thing shown,
 * flashed briefly, drawn over a scrim, still loading, a scrolled view. That is
 * enough to recognise the screens a design library cares about: a login form
 * says "Password", a paywall says "free trial", a checkout says "Total", an
 * empty state says "nothing here yet", a splash says nothing at all and comes
 * first. It will never describe a screen in prose the way a vision model
 * would, but every sentence it does write is backed by something it measured.
 *
 * Three deliberate design points:
 *
 *   Order matters. Rules run most-specific first, because "Continue" appears
 *   on both an onboarding screen and a payment screen, and only one of those
 *   should win.
 *
 *   Layout beats vocabulary. An on-screen keyboard is a far stronger signal
 *   that someone is filling in a form than any word is, and a row of short
 *   labels pinned to the bottom is a tab bar whatever the labels say.
 *
 *   Chrome and boilerplate are held apart from content. A tab bar shows the
 *   same words on every screen of an app, and a legal footer says "Privacy
 *   Policy" under a phone-number field — neither should type the screen.
 */

import { isExternalAuthScreen } from './safety.js';
import { labelFor as typeLabel, stateFor } from './taxonomy.js';

/** Text at or below this y (from the top) is in tab-bar territory. */
const TAB_BAR_TOP = 0.88;

/** Text above this y is the status bar: the clock, signal, battery. */
const STATUS_BAR_BOTTOM = 0.045;

/** The navigation bar / page title zone. */
const HEADER_BOTTOM = 0.17;

/** An iOS keyboard occupies roughly the bottom 45% when open. */
const KEYBOARD_TOP = 0.55;

/** Single letters below KEYBOARD_TOP needed before a keyboard is believed. */
const KEYBOARD_KEYS = 8;

const CURRENCY = /[$€£¥₹]\s?\d|(\d+[.,]\d{2})\s?(usd|eur|gbp|inr)\b|\brs\.?\s?\d/i;

/** Legal boilerplate, which sits under forms and must not type them as settings. */
const LEGAL = /(by (clicking|continuing|signing|proceeding|tapping|creating)\b|privacy policy|terms (of|and) (use|service|conditions)|terms & conditions|t&c apply|\bterms\b)/i;

/** Words a title is never made of: navigation chrome and generic actions. */
const NOT_A_TITLE = /^(skip|back|cancel|done|close|next|continue|edit|save|ok|got it|allow|don'?t allow|not now|<|›|x)$/i;

const CTA = /^(continue|get started|let'?s go|next|sign ?up|log ?in|sign ?in|create account|add to (cart|bag)|buy now|order now|shop now|book now|pay now|place order|subscribe|start( free)? trial|allow|enable|turn on|got it|done|save|apply|confirm|send|submit|try again|retry|go to home|explore|continue to \w+|continue with \w+)\b/i;

const PROMO = /(\d{1,2}% ?off|deals?|offers?|trending|recommended|flat \d|save \d|free delivery|limited time|coupon)/i;

/**
 * Pulls the signals every rule reads out of one screenshot's text.
 *
 * The important part is what `all` excludes. A tab bar shows the same words on
 * every screen of an app — a delivery app's says "Food" whether you are
 * looking at a restaurant or a settings page — so matching content rules
 * against it types every screen the same. Legal footers are stripped for the
 * same reason. Chrome is therefore held separately from content: the tab bar
 * is used to detect that a tab bar exists, and nothing else.
 */
export function extractSignals(lines, options = {}) {
  const clean = lines
    .map((line) => ({ ...line, text: String(line.text || '').trim() }))
    .filter((line) => line.text.length > 0);

  const content = clean.filter((line) => line.y > STATUS_BAR_BOTTOM && line.y < TAB_BAR_TOP);
  const header = content.filter((line) => line.y < HEADER_BOTTOM);
  // Tab labels are short words on one row at the very bottom. OCR also reads
  // badges, timers and promo pills down there, so only wordy items on the
  // most populated row count.
  const bottomWords = clean.filter(
    (line) => line.y >= TAB_BAR_TOP && /^[A-Za-z][A-Za-z' ]{1,13}$/.test(line.text) && !/^[A-Z]{2,5}$/.test(line.text),
  );
  const bottomRows = groupByRow(bottomWords).sort((a, b) => b.length - a.length);
  // Left to right, so the first label is the leftmost tab — the section name
  // in most tab bars.
  const bottomItems = [...(bottomRows[0] ?? [])].sort((a, b) => a.x - b.x);

  const singleLetters = clean.filter((line) => line.y > KEYBOARD_TOP && /^[a-z]$/i.test(line.text)).length;
  const keyRows = clean.filter((line) => line.y > KEYBOARD_TOP && /^(qwertyuiop|asdfghjkl|zxcvbnm)$/i.test(line.text.replace(/\s+/g, ''))).length;
  const numpad = clean.filter((line) => line.y > 0.6 && /^(abc|def|ghi|jkl|mno|pqrs|tuv|wxyz)$/i.test(line.text)).length;
  const keyboard = singleLetters >= KEYBOARD_KEYS || keyRows >= 2 || numpad >= 4;

  const rawAll = content.map((line) => line.text).join(' \n ');
  const legalLines = content.filter((line) => line.y > 0.4 && LEGAL.test(line.text));
  const all = content
    .filter((line) => !legalLines.includes(line))
    .map((line) => line.text)
    .join(' \n ')
    .toLowerCase();

  // A row of three or more short labels just under the header is a segmented
  // control or a category strip.
  const chipRow = content.filter((line) => line.y >= 0.1 && line.y <= 0.32 && line.text.length <= 12 && /^[a-z][a-z &'-]*$/i.test(line.text));
  const chipRows = groupByRow(chipRow);
  const chips = chipRows.some((row) => row.length >= 3);

  const pageIndicator = content.some((line) => /^\d{1,2}\s?\/\s?\d{1,3}$/.test(line.text) || /^[•·●○]{2,}$/.test(line.text));
  const ctas = content.filter((line) => line.y > 0.3 && line.text.length <= 28 && CTA.test(line.text)).map((line) => line.text);
  const fields = content.filter(
    (line) =>
      line.y > HEADER_BOTTOM &&
      line.text.length <= 18 &&
      /^(email|e-mail|password|phone( number)?|mobile( number)?|full name|first name|last name|name|username|address|city|zip|postcode|card number|cvv|expiry)\b/i.test(line.text),
  ).length;

  return {
    rawAll,
    all,
    chrome: bottomItems.map((line) => line.text).join(' ').toLowerCase(),
    lines: clean,
    content,
    header,
    lineCount: content.length,
    keyboard,
    tabBar: bottomItems.length >= 3,
    tabLabels: bottomItems.map((line) => line.text),
    chips,
    chipLabels: chips ? chipRows.find((row) => row.length >= 3).map((line) => line.text) : [],
    pageIndicator,
    ctas,
    fields,
    legal: legalLines.length > 0,
    promo: PROMO.test(all),
    currency: CURRENCY.test(all),
    luminance: options.luminance ?? null,
    colors: options.colors ?? [],
  };
}

function groupByRow(lines) {
  const rows = [];
  for (const line of [...lines].sort((a, b) => a.y - b.y)) {
    const row = rows.find((r) => Math.abs(r[0].y - line.y) < 0.02);
    if (row) row.push(line);
    else rows.push([line]);
  }
  return rows;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

/**
 * Screen-type rules, most specific first. `when` receives the signals and the
 * capture context; the first match wins.
 */
const RULES = [
  {
    type: 'permission',
    when: (s) => /\ballow\b/.test(s.all) && /(don'?t allow|not now|would like to|access your|while using|only while|allow once)/.test(s.all),
  },
  {
    type: 'splash',
    when: (s, c) => (c.isFirst && (s.lineCount <= 2 || c.flat)) || (s.lineCount <= 1 && c.flat && !c.overlay),
  },
  {
    type: 'loading',
    when: (s, c) =>
      /\b(loading|please wait|just a (sec|second|moment)|hang tight|fetching|getting things ready|one moment)\b/.test(s.all) ||
      (c.kind === 'loading' && s.lineCount <= 12) ||
      (c.brief && !c.isFirst && s.lineCount <= 3 && c.edge < 6),
  },
  {
    type: 'coach_mark',
    when: (s, c) =>
      Boolean(c.overlay) &&
      /(got it|explore all|tap (here|to|the)|swipe (up|left|right|down)|next tip|show me|take a tour|let'?s (start|begin)|\bnew!|introducing|pick up where|where you'?ve left off|here'?s (how|what)|did you know)/.test(s.all),
  },
  {
    type: 'paywall',
    when: (s) => /(free trial|start trial|subscribe|go premium|upgrade to|unlock (all|premium|everything)|per month|per year|\/mo\b|\/month|\/year|restore purchase|billed (monthly|annually|yearly))/.test(s.all),
  },
  {
    type: 'payment',
    when: (s) => /(card number|cardholder|cvv|cvc|expiry|expiration|payment method|add card|apple pay|google pay|pay now|\bupi\b|net ?banking)/.test(s.all),
  },
  {
    type: 'checkout',
    when: (s) => /(checkout|place order|order summary|confirm and pay|subtotal|order total|delivery address|bill details|to pay)/.test(s.all) || (/\btotal\b/.test(s.all) && s.currency),
  },
  {
    // "Add to cart" is the button on a product page, not the cart itself, so
    // it is removed before the word is looked for.
    type: 'cart',
    when: (s) => {
      const withoutButton = s.all.replace(/add to (cart|bag|basket)/g, ' ');
      return (
        /(your (cart|bag|basket)|shopping (cart|bag)|items in your|view cart)/.test(withoutButton) ||
        (/\b(cart|bag|basket)\b/.test(withoutButton) && s.currency)
      );
    },
  },
  {
    type: 'otp',
    when: (s) =>
      /(verification code|verify (your )?(number|phone|email|mobile)|enter (the )?(\d[- ])?(digit|otp|code)|one[- ]?time (pass)?code|resend (code|otp)|didn'?t (get|receive)|(sent|we sent) (a|the|you a) code|code sent to|\botp\b)/.test(s.all),
  },
  {
    type: 'login',
    when: (s) =>
      /(log ?in|sign ?in|welcome back|enter your (mobile|phone)( number)?|mobile number|phone number|continue with (google|apple|email|facebook|phone)|send otp|get otp|get started with your (phone|number|email))/.test(s.all) &&
      /(password|email|phone|mobile|continue|forgot|otp|number|\+\d{1,3}\b|google|apple)/.test(s.all),
  },
  {
    type: 'signup',
    when: (s) => /(sign ?up|create (an |your )?account|register|join (now|free|us)|get started for free)/.test(s.all),
  },
  {
    type: 'confirmation',
    when: (s) => /(thank you|you'?re all set|confirmed|successfully|your order is|booking confirmed|all done|order placed|payment successful|\bsuccess(ful)?!?\b|congratulations|welcome aboard|you'?re in\b|added to (cart|bag|favou?rites|wishlist)|saved!)/.test(s.all),
  },
  {
    type: 'error',
    when: (s) => /(something went wrong|couldn'?t (load|connect|find)|unable to|no internet|no connection|\berror\b|oops|failed to|not found|\b404\b|you'?re offline|try again later)/.test(s.all),
  },
  {
    type: 'empty_state',
    when: (s) =>
      /(nothing here|no results|no items|it'?s empty|you have no|start by adding|nothing to (show|see)|logged out|please log ?in to (see|view|continue)|no (saved|recent|items|orders|bookings|messages|notifications|favou?rites|history|addresses)\b|nothing (here|yet)|haven'?t [a-z ]+ yet|get started by|looks like you|no [a-z]+ found|your [a-z]+ (is|are) empty|start (adding|exploring|saving))/.test(s.all),
  },
  {
    type: 'search_results',
    when: (s) => /(results|filters?|sort by|showing \d)/.test(s.all) && s.lineCount > 6,
  },
  {
    type: 'search',
    when: (s) => /\bsearch\b/.test(s.all) && (s.keyboard || s.lineCount < 10) && !s.tabBar,
  },
  {
    type: 'settings',
    when: (s) => {
      const hits = s.all.match(/(settings|preferences|privacy(?! policy)|account settings|log ?out|sign ?out|notification settings|language|dark mode|appearance|help (center|centre)|about|manage account|delete account)/g) || [];
      const titled = s.header.some((line) => /^(settings|account|preferences|profile settings|my account)$/i.test(line.text));
      return titled || new Set(hits).size >= 2;
    },
  },
  {
    type: 'notifications',
    when: (s) => /(notifications|activity)/.test(s.all) && s.lineCount > 4 && s.header.some((line) => /notifications|activity/i.test(line.text)),
  },
  {
    type: 'messages',
    when: (s) => /(messages?|chats?|inbox|say hello|type a message|send a message)/.test(s.all) && (s.header.some((line) => /messages?|chats?|inbox/i.test(line.text)) || s.keyboard),
  },
  {
    type: 'profile',
    when: (s) => /(edit profile|my profile|followers|following|my account|your profile)/.test(s.all),
  },
  {
    type: 'calendar',
    when: (s) => /(check.?in|check.?out|select dates?|\bcalendar\b)/.test(s.all) || /\b(mon|tue|wed|thu|fri|sat|sun)\b.*\b(mon|tue|wed|thu|fri|sat|sun)\b/.test(s.all),
  },
  {
    // A distance on its own is not a map — dating and delivery apps print
    // "2 km away" on ordinary cards. Something must actually say map.
    type: 'map',
    when: (s) => /(\bmap\b|directions|nearby places|show on map|view map|use current location|drop a pin)/.test(s.all) && !/logged out/.test(s.all),
  },
  {
    type: 'player',
    when: (s) => /(now playing|up next|shuffle|episodes?|play all|\d{1,2}:\d{2} ?\/ ?\d{1,2}:\d{2})/.test(s.all),
  },
  {
    type: 'product_detail',
    when: (s) => s.currency && /(add to (cart|bag)|buy now|book now|reserve|reviews?|in stock|select size|add item|customi[sz]able)/.test(s.all),
  },
  {
    type: 'detail',
    when: (s) => /(about|details|overview|description|read more|see all reviews)/.test(s.all) && !s.tabBar,
  },
  {
    // An overlay whose words did not name it more precisely above is filed by
    // its shape: what the segmenter measured it to be.
    type: 'overlay',
    when: (s, c) => Boolean(c.overlay),
  },
  {
    type: 'onboarding',
    when: (s, c) =>
      (/(get started|let'?s go|\bskip\b|\bnext\b|welcome|continue with|one app for|enable|turn on|allow)/.test(s.all) && s.lineCount <= 12 && !s.tabBar) ||
      (c.index <= 2 && !s.tabBar && s.lineCount <= 14 && /(continue|next|get started|skip|welcome)/.test(s.all)),
  },
  {
    type: 'form',
    when: (s) => s.keyboard || s.fields >= 2,
  },
  {
    type: 'category',
    when: (s) => s.chips && !s.tabBar && s.lineCount > 6,
  },
  {
    type: 'feed',
    when: (s, c) => s.tabBar && !c.firstTabBarScreen && (s.lineCount > 10 || s.promo),
  },
  {
    type: 'home',
    when: (s) => s.tabBar,
  },
  {
    type: 'feed',
    when: (s) => s.lineCount > 14 && (s.promo || s.chips),
  },
];

/** Words that, when present, are worth keeping as tags. */
const TAG_WORDS = [
  'search', 'filter', 'profile', 'settings', 'chat', 'message', 'cart', 'checkout',
  'payment', 'price', 'review', 'rating', 'map', 'calendar', 'photo', 'video',
  'notification', 'login', 'signup', 'premium', 'subscription', 'delivery',
  'booking', 'offer', 'discount', 'wallet', 'rewards', 'location', 'address',
];

/**
 * Best guess at a screen's title.
 *
 * The navigation-bar zone comes first: a line there that reads as words is
 * what the app itself calls the screen. Failing that, the largest real text in
 * the upper half — a headline. OCR on a phone screenshot returns a lot that is
 * not language (clock digits, signal glyphs, icon fragments read as
 * punctuation), so a title has to survive looking like actual words, or the
 * screen is better off named after its type.
 */
function titleFrom(lines, box = null) {
  const wordy = (line) => {
    const text = line.text;
    if (text.length < 3 || text.length > 48) return false;
    if (/^\d{1,2}[:.]\d{2}$/.test(text)) return false; // the clock
    if (NOT_A_TITLE.test(text)) return false;
    const letters = (text.match(/[a-z]/gi) || []).length;
    return letters >= 3 && letters / text.length >= 0.6 && /[a-z]{3}/i.test(text);
  };

  // An overlay is named by what is written on it, not by the screen showing
  // through the scrim behind it.
  if (box) {
    const inside = lines
      .filter((line) => line.y >= box.y - 0.03 && line.y <= box.y + box.h + 0.03 && wordy(line))
      .sort((a, b) => b.h - a.h);
    if (inside[0]) return cleanTitle(inside[0].text);
  }

  const header = lines
    .filter((line) => line.y > STATUS_BAR_BOTTOM && line.y < HEADER_BOTTOM && wordy(line))
    .sort((a, b) => b.h - a.h);
  const headline = lines
    .filter((line) => line.y > STATUS_BAR_BOTTOM && line.y < 0.55 && wordy(line))
    .sort((a, b) => b.h - a.h);

  const pick = header[0] ?? headline[0];
  return pick ? cleanTitle(pick.text) : null;
}

/** The largest wordy line in the body of the screen, below the header. */
function headlineFrom(lines) {
  const body = lines
    .filter((line) => line.y >= HEADER_BOTTOM && line.y < 0.7)
    .filter((line) => {
      const text = line.text;
      if (text.length < 4 || text.length > 40 || NOT_A_TITLE.test(text) || CTA.test(text)) return false;
      const letters = (text.match(/[a-z]/gi) || []).length;
      return letters >= 4 && letters / text.length >= 0.6 && /[a-z]{3}/i.test(text) && !/search/i.test(text);
    })
    .sort((a, b) => b.h - a.h);
  return body[0] ? cleanTitle(body[0].text) : null;
}

/** Strips OCR leftovers and chevrons, and trims to a name-sized length. */
export function cleanTitle(text) {
  let title = String(text)
    .replace(/^[^a-z0-9"'“(]+/i, '')
    // A back chevron or a menu glyph read as a lone letter in front of the
    // real title: "E Select your location".
    .replace(/^[A-Za-z]\s+(?=[A-Z])/, '')
    .replace(/[›>»&|:;,.\s-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (title.length > 40) {
    const cut = title.slice(0, 40);
    title = (cut.includes(' ') ? cut.slice(0, cut.lastIndexOf(' ')) : cut).trim();
  }
  return title || null;
}

/** Splits screens whose type has a state from those that are a place. */
const OVERLAY_TYPE_FOR = { dialog: 'dialog', bottom_sheet: 'bottom_sheet', toast: 'toast' };

/**
 * Classifies one screen from its text and its place in the recording.
 *
 * Returns the same shape the model backend returns, so the rest of the
 * pipeline cannot tell which produced it — plus `states`, `signals` and a
 * description assembled only from things that were measured.
 *
 * @param {import('./ocr.js').TextLine[]} lines
 * @param {{luminance?: number|null, colors?: object[], fallbackName?: string, context?: object}} options
 */
export function classifyScreen(lines, options = {}) {
  const context = {
    index: 0,
    total: 1,
    isFirst: false,
    brief: false,
    holdSeconds: null,
    kind: 'screen',
    overlay: null,
    loadingOfName: null,
    scrolledFromName: null,
    flat: false,
    edge: 10,
    firstTabBarScreen: false,
    ...(options.context || {}),
  };
  const signals = extractSignals(lines, options);

  const external = isExternalAuthScreen(signals.rawAll);
  let screenType;
  if (external) {
    screenType = 'external_auth';
  } else {
    const matched = RULES.find((rule) => rule.when(signals, context));
    screenType = matched?.type ?? 'other';
  }
  if (screenType === 'overlay') screenType = OVERLAY_TYPE_FOR[context.overlay?.kind] ?? 'dialog';

  // A screen the segmenter called a loading state but that is full of text is
  // not loading; it was simply sparse against a very dense neighbour. The
  // segmenter's evidence is structural (same chrome, content arriving), so it
  // takes a lot of text to overrule it.
  if (context.kind === 'loading' && screenType !== 'loading' && signals.lineCount > 20) context.kind = 'screen';
  if (context.kind === 'loading' && screenType !== 'loading' && !['splash', 'external_auth'].includes(screenType)) screenType = 'loading';

  const elements = [];
  if (signals.tabBar) elements.push('tab-bar');
  if (signals.header.length) elements.push('nav-bar');
  if (signals.keyboard) elements.push('keyboard', 'text-field');
  else if (signals.fields >= 1) elements.push('text-field');
  if (signals.fields >= 2 || screenType === 'form') elements.push('form');
  if (/\bsearch\b/.test(signals.all)) elements.push('search-bar');
  if (signals.currency) elements.push('price');
  if (signals.lineCount > 12) elements.push('list');
  if (signals.chips) elements.push('chip');
  if (signals.pageIndicator) elements.push('carousel', 'page-indicator');
  if (signals.ctas.length) elements.push('cta', 'button');
  if (signals.legal) elements.push('legal-text');
  if (signals.promo) elements.push('banner');
  if (context.overlay?.kind === 'dialog') elements.push('modal');
  if (context.overlay?.kind === 'bottom_sheet') elements.push('bottom-sheet');
  if (context.overlay?.kind === 'toast') elements.push('toast');
  if (screenType === 'coach_mark') elements.push('coach-mark');
  if (screenType === 'empty_state') elements.push('empty-state');
  if (screenType === 'loading' || context.kind === 'loading') elements.push('skeleton', 'progress');
  if (screenType === 'permission') elements.push('alert');

  const style = [];
  if (typeof signals.luminance === 'number') style.push(signals.luminance < 100 ? 'dark' : 'light');
  const background = signals.colors.find((c) => c.role === 'background');
  const accent = signals.colors.find((c) => c.role === 'accent');
  if (background && saturationOf(background.hex) > 0.5 && background.share > 0.5) style.push('bold');
  else if (!accent && signals.lineCount <= 6) style.push('minimal');

  const states = [];
  const implied = stateFor(screenType);
  if (implied) states.push(implied);
  if (context.kind === 'loading' && !states.includes('loading')) states.push('loading');
  if (context.overlay?.kind === 'dialog' && !states.includes('modal') && !implied) states.push('modal');
  if (context.overlay?.kind === 'bottom_sheet' && !states.includes('bottom-sheet') && !implied) states.push('bottom-sheet');
  if (context.overlay?.kind === 'toast' && !states.includes('toast') && !implied) states.push('toast');
  if (context.kind === 'scrolled') states.push('scrolled');
  if (signals.keyboard) states.push('keyboard');

  const tags = TAG_WORDS.filter((word) => signals.all.includes(word)).slice(0, 6);
  const tabTags = signals.tabLabels.map((label) => label.toLowerCase()).filter((label) => /^[a-z][a-z ]{1,13}$/.test(label)).slice(0, 4);

  const name = nameFor(screenType, signals, context, options.fallbackName);
  const description = describe(screenType, signals, context, states);

  return {
    screenType,
    category: null,
    flow: null,
    name,
    description,
    tags: [...new Set([...tags, ...tabTags, screenType.replace(/_/g, '-'), ...states])].slice(0, 10),
    elements: [...new Set(elements)],
    style,
    states,
    blocked: false,
    blockedReason: null,
    external: external ? external.reason : null,
    actions: [],
    signals: {
      lineCount: signals.lineCount,
      tabLabels: signals.tabLabels,
      chipLabels: signals.chipLabels,
      ctas: signals.ctas.slice(0, 4),
      keyboard: signals.keyboard,
      title: titleFrom(signals.lines, context.overlay?.box ?? null),
      // The largest real words in the body — a section heading or a hero
      // line — kept so a screen can be told apart from siblings that share
      // its navigation title.
      headline: headlineFrom(signals.lines),
    },
    viaHeuristics: true,
  };
}

function saturationOf(hex) {
  const value = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(value)) return 0;
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max ? (max - min) / max : 0;
}

function nameFor(screenType, signals, context, fallbackName) {
  if (screenType === 'splash') return 'Splash screen';
  if (screenType === 'external_auth') return 'External sign-in';
  if (screenType === 'loading' || context.kind === 'loading') {
    return context.loadingOfName ? `${context.loadingOfName} — loading` : 'Loading state';
  }
  const title = titleFrom(signals.lines, context.overlay?.box ?? null);
  if (context.kind === 'scrolled' && context.scrolledFromName) {
    return `${context.scrolledFromName} — scrolled`;
  }
  if (title) return title;
  if (context.overlay && context.overlayOfName) return `${typeLabel(screenType)} over ${context.overlayOfName}`;
  return typeLabel(screenType) || fallbackName || 'Screen';
}

/**
 * One or two sentences about the screen, every clause backed by a signal. A
 * rule knows what a screen is, not what it is for, so nothing here speculates
 * about intent.
 */
function describe(screenType, signals, context, states) {
  const parts = [];
  const label = typeLabel(screenType);

  if (screenType === 'splash') parts.push('Launch screen shown while the app starts');
  else if (screenType === 'external_auth') parts.push("A third-party sign-in page, not the app's own design");
  else if (context.kind === 'loading' || screenType === 'loading') {
    parts.push(context.loadingOfName ? `Loading state of ${context.loadingOfName}` : 'Loading state');
  } else if (context.overlay) {
    const shape = { dialog: 'dialog', bottom_sheet: 'bottom sheet', toast: 'toast' }[context.overlay.kind] ?? 'overlay';
    parts.push(
      `${label === 'Dialog' || label === 'Bottom sheet' || label === 'Toast' ? capitalise(shape) : `${label} ${shape}`}${context.overlay.dimmed ? ' over a dimmed screen' : ''}${context.overlayOfName ? `, on top of ${context.overlayOfName}` : ''}`,
    );
  } else if (context.kind === 'scrolled') {
    parts.push(`${label} screen, scrolled further down${context.scrolledFromName ? ` from ${context.scrolledFromName}` : ''}`);
  } else {
    parts.push(`${label} screen`);
  }

  const structure = [];
  if (signals.tabBar) structure.push(`a ${signals.tabLabels.length}-item tab bar`);
  if (signals.chips) structure.push(`a row of ${signals.chipLabels.length} category chips`);
  if (/\bsearch\b/.test(signals.all)) structure.push('a search bar');
  if (signals.keyboard) structure.push('the keyboard open');
  else if (signals.fields >= 1) structure.push(`${signals.fields} input field${signals.fields === 1 ? '' : 's'}`);
  if (signals.pageIndicator) structure.push('a paged carousel');
  if (signals.ctas.length) structure.push(`a primary action labelled “${signals.ctas[0]}”`);
  if (signals.currency) structure.push('prices');
  if (structure.length) parts[0] += ` with ${listWords(structure)}`;

  const extras = [];
  if (typeof signals.luminance === 'number') extras.push(`${signals.luminance < 100 ? 'Dark' : 'Light'} theme`);
  if (signals.lineCount) extras.push(`${signals.lineCount} text element${signals.lineCount === 1 ? '' : 's'}`);
  if (context.brief) extras.push('shown only briefly');
  if (states.includes('empty')) extras.push('an empty state');
  if (extras.length) parts.push(extras.join(', '));

  return `${parts.join('. ')}.`;
}

function listWords(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function capitalise(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ─── Brand ───────────────────────────────────────────────────────────────────

const GENERIC_WORDS = new Set([
  'privacy', 'terms', 'continue', 'google', 'apple', 'facebook', 'instagram', 'twitter',
  'sign', 'log', 'login', 'welcome', 'skip', 'next', 'back', 'done', 'cancel', 'settings',
  'home', 'search', 'get', 'the', 'and', 'your', 'please', 'enter', 'allow', 'email',
  'phone', 'mobile', 'number', 'password', 'account', 'create', 'use', 'our', 'these',
  'this', 'all', 'you', 'app', 'store', 'play', 'policy', 'service', 'conditions', 'inc',
  'ltd', 'llc', 'with', 'for', 'from', 'more', 'new', 'free', 'premium', 'plus', 'pro',
]);

const BRAND_PATTERNS = [
  { weight: 3, pattern: /\b(?:welcome to|log ?in to|sign in to|sign up (?:for|to)|get started with|join)\s+([A-Z][A-Za-z0-9&'.-]{2,24})/i },
  { weight: 3, pattern: /\b([A-Z][A-Za-z0-9&'.-]{2,24})\s+(?:terms of (?:use|service)|privacy policy|terms & conditions|inc\.|ltd\.|llc)\b/i },
  { weight: 3, pattern: /©\s*(?:\d{4}\s*)?([A-Z][A-Za-z0-9&'.-]{2,24})/ },
  { weight: 1, pattern: /\b([A-Z][A-Za-z0-9'.-]{2,24})\s+(?:premium|plus|pro|gold|one|pass|wallet|money|pay|rewards|coins|cash|care|plus\b)/ },
];

/**
 * The app's name, read off its own screens.
 *
 * Apps rarely print their name as a heading, but they do print it in the
 * places lawyers make them: "Acme Terms of Use", "© Acme", "Welcome to Acme",
 * "Log in to Acme". Those are strong evidence; a product tier ("Acme Gold") is
 * weaker. The result is offered as a guess, never as a confident identity,
 * because a rule cannot recognise a logo.
 *
 * @param {import('./ocr.js').TextLine[][]} lineSets text of several screens
 * @returns {{name: string, score: number, evidence: string}|null}
 */
export function guessBrand(lineSets) {
  const scores = new Map();
  for (const lines of lineSets) {
    for (const line of lines) {
      for (const { weight, pattern } of BRAND_PATTERNS) {
        const match = pattern.exec(line.text || '');
        if (!match) continue;
        const name = match[1].replace(/[.'&-]+$/, '');
        if (name.length < 3 || GENERIC_WORDS.has(name.toLowerCase())) continue;
        const entry = scores.get(name.toLowerCase()) ?? { name, score: 0, evidence: line.text.trim() };
        entry.score += weight;
        scores.set(name.toLowerCase(), entry);
      }
    }
  }
  const best = [...scores.values()].sort((a, b) => b.score - a.score)[0];
  return best && best.score >= 3 ? best : null;
}

// ─── Flows ───────────────────────────────────────────────────────────────────

/**
 * Which journey a screen type belongs to. Types absent from this map have no
 * journey of their own and attach to whatever surrounds them — a form, a
 * dialog, a loading state or a confirmation belongs to the flow that led to
 * it, not to a flow of its own.
 */
const FLOW_OF = {
  splash: ['Onboarding', 'onboarding'],
  onboarding: ['Onboarding', 'onboarding'],
  coach_mark: ['Onboarding', 'onboarding'],
  permission: ['Onboarding', 'onboarding'],
  login: ['Logging in', 'authentication'],
  otp: ['Logging in', 'authentication'],
  signup: ['Signing up', 'authentication'],
  search: ['Searching', 'search'],
  search_results: ['Searching', 'search'],
  cart: ['Checkout', 'checkout'],
  checkout: ['Checkout', 'checkout'],
  payment: ['Checkout', 'checkout'],
  paywall: ['Upgrading', 'checkout'],
  product_detail: ['Browsing', 'discovery'],
  detail: ['Browsing', 'discovery'],
  home: ['Browsing', 'discovery'],
  feed: ['Browsing', 'discovery'],
  category: ['Browsing', 'discovery'],
  media: ['Browsing', 'discovery'],
  player: ['Browsing', 'discovery'],
  map: ['Browsing', 'discovery'],
  profile: ['Profile', 'settings'],
  settings: ['Settings', 'settings'],
  notifications: ['Notifications', 'discovery'],
  messages: ['Messaging', 'discovery'],
  calendar: ['Booking', 'creation'],
};

/**
 * Groups screens into named flows by walking the capture in order.
 *
 * A flow is a consecutive run of screens belonging to the same journey, which
 * is what walking an app actually produces: a splash and some onboarding, then
 * a login, then browsing. Screens with no journey of their own join the run
 * they interrupt, and a run too short to be a flow is absorbed by its
 * neighbour — so every screen ends up somewhere and no flow has one screen in
 * it.
 *
 * @param {{screenType: string}[]} screens in capture order
 * @returns {{name: string, category: string, screens: number[]}[]}
 */
export function groupFlowsLocally(screens) {
  if (screens.length < 2) return [];

  // Pass one: label each screen, carrying the previous label through the gaps.
  const labels = [];
  let carried = null;
  for (const screen of screens) {
    const entry = FLOW_OF[screen.screenType];
    if (entry) carried = entry;
    labels.push(entry ?? carried);
  }
  // Anything before the first labelled screen belongs to whatever came first.
  const firstLabelled = labels.find(Boolean) ?? ['Walkthrough', 'discovery'];
  for (let i = 0; i < labels.length; i++) {
    if (!labels[i]) labels[i] = firstLabelled;
    else break;
  }

  // Pass two: consecutive runs of the same journey.
  const runs = [];
  for (let i = 0; i < labels.length; i++) {
    const [name, category] = labels[i];
    const last = runs[runs.length - 1];
    if (last && last.name === name) last.screens.push(i);
    else runs.push({ name, category, screens: [i] });
  }

  // Pass three: absorb runs too short to stand alone into a neighbour, so no
  // flow is a single screen and nothing is dropped. A lone splash or welcome
  // screen absorbed into the sign-in that follows makes that flow the app's
  // onboarding, which is what a library calls "splash, then sign in".
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].screens.length >= 2 || runs.length === 1) continue;
    const previous = runs[i - 1];
    const next = runs[i + 1];
    const target = previous ?? next;
    if (!target) continue;
    if (i === 0 && runs[i].name === 'Onboarding' && target.category === 'authentication') {
      target.name = 'Onboarding';
      target.category = 'onboarding';
    }
    target.screens.push(...runs[i].screens);
    target.screens.sort((a, b) => a - b);
    runs.splice(i, 1);
    i--;
  }

  // A journey visited twice (browse → checkout → browse) becomes one flow.
  const merged = new Map();
  for (const run of runs) {
    const existing = merged.get(run.name);
    if (existing) {
      existing.screens.push(...run.screens);
      existing.screens.sort((a, b) => a - b);
    } else {
      merged.set(run.name, { ...run });
    }
  }

  return [...merged.values()].filter((flow) => flow.screens.length >= 2);
}

// ─── Report ──────────────────────────────────────────────────────────────────

function clock(seconds) {
  if (typeof seconds !== 'number' || Number.isNaN(seconds)) return null;
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * The findings the screen page shows under "Analyze UI", assembled from the
 * classification and the capture record. Every point is something measured
 * or observed; nothing is inferred about intent or quality.
 *
 * @param {{analysis: object, capture?: object, flow?: {name: string, position: number, total: number}|null,
 *          from?: string[], to?: string[]}} input
 * @returns {{title: string, points: string[]}[]}
 */
export function buildSections({ analysis, capture, flow, from = [], to = [] }) {
  const s = analysis.signals ?? {};
  const layout = [];
  if (s.tabLabels?.length >= 3) layout.push(`Tab bar with ${s.tabLabels.length} items: ${s.tabLabels.join(', ')}`);
  else layout.push('No tab bar');
  if (s.title) layout.push(`Navigation title reads “${s.title}”`);
  if (s.chipLabels?.length) layout.push(`Category strip: ${s.chipLabels.join(', ')}`);
  if (s.keyboard) layout.push('Keyboard is open, so the lower half is input');
  if (analysis.elements?.includes('search-bar')) layout.push('Search bar present');
  if (analysis.elements?.includes('carousel')) layout.push('Paged carousel with a page indicator');
  if (capture?.overlay) {
    const kind = { dialog: 'Dialog', bottom_sheet: 'Bottom sheet', toast: 'Toast' }[capture.overlay.kind] ?? 'Overlay';
    const box = capture.overlay.box;
    layout.push(
      `${kind}${capture.overlay.dimmed ? ' over a dimmed background' : ''}${box ? `, covering ${Math.round(box.h * 100)}% of the height from ${Math.round(box.y * 100)}% down` : ''}`,
    );
  }
  if (analysis.style?.length) layout.push(`${analysis.style.map((v) => v.charAt(0).toUpperCase() + v.slice(1)).join(', ')} style`);

  const content = [];
  if (analysis.description) content.push(analysis.description);
  if (s.ctas?.length) content.push(`Calls to action: ${s.ctas.map((c) => `“${c}”`).join(', ')}`);
  if (typeof s.lineCount === 'number') content.push(`${s.lineCount} text element${s.lineCount === 1 ? '' : 's'} recognised`);
  if (analysis.states?.length) content.push(`State: ${analysis.states.join(', ')}`);

  const navigation = [];
  if (flow) navigation.push(`Step ${flow.position} of ${flow.total} in “${flow.name}”`);
  if (from.length) navigation.push(`Reached from ${listWords(from.map((n) => `“${n}”`))}`);
  if (to.length) navigation.push(`Leads to ${listWords(to.map((n) => `“${n}”`))}`);
  if (capture?.visits > 1) navigation.push(`Returned to ${capture.visits} times in the recording`);
  if (capture?.overlayOfName) navigation.push(`Shown on top of “${capture.overlayOfName}”`);
  if (capture?.loadingOfName) navigation.push(`Resolves into “${capture.loadingOfName}”`);
  if (capture?.scrolledFromName) navigation.push(`Scrolled view of “${capture.scrolledFromName}”`);

  const captured = [];
  if (capture?.start !== undefined && capture?.holdSeconds !== undefined) {
    captured.push(`Held for ${capture.holdSeconds}s at ${clock(capture.start)} in the recording`);
  }
  if (capture?.brief) captured.push('Shown only briefly; kept because it was distinct from its neighbours');
  if (capture?.frame !== undefined) captured.push(`Frame ${capture.frame} of ${capture.frames ?? '?'} sampled at ${capture.fps ?? '?'} fps`);
  captured.push(analysis.viaHeuristics ? 'Classified on-device from recognised text and pixels' : `Classified by ${analysis.analyzer ?? 'a model'}`);

  return [
    { title: 'Layout', points: layout },
    { title: 'Content', points: content },
    { title: 'Navigation', points: navigation.length ? navigation : ['Not part of a recorded journey'] },
    { title: 'Capture', points: captured },
  ];
}
