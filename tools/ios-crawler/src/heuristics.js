/**
 * Classifying a screen, and naming a flow, without a model.
 *
 * Everything here runs from two offline signals: the text Vision read off the
 * screenshot, and its average brightness. That is enough to recognise the
 * screens a design library actually cares about — a login form says "Password",
 * a paywall says "free trial", a checkout says "Total". It is not as good as a
 * vision model and it will never describe a screen in prose, but it produces
 * real screen types and real flow names with no API key and no network.
 *
 * Two deliberate design points:
 *
 *   Order matters. Rules run most-specific first, because "Continue" appears on
 *   both an onboarding screen and a payment screen, and only one of those
 *   should win.
 *
 *   Layout beats vocabulary. An on-screen keyboard is a far stronger signal
 *   that someone is filling in a form than any word is, and a row of short
 *   labels pinned to the bottom is a tab bar whatever the labels say.
 */

/** Text at or below this y (from the top) is in tab-bar territory. */
const TAB_BAR_TOP = 0.88;

/** An iOS keyboard occupies roughly the bottom 45% when open. */
const KEYBOARD_TOP = 0.55;

/** Single letters below KEYBOARD_TOP needed before a keyboard is believed. */
const KEYBOARD_KEYS = 8;

const CURRENCY = /[$€£¥₹]\s?\d|(\d+[.,]\d{2})\s?(usd|eur|gbp|inr)\b/i;

/**
 * Screen-type rules, most specific first. `when` receives the extracted
 * signals; the first match wins.
 */
const RULES = [
  {
    type: 'permission',
    when: (s) => /\ballow\b/.test(s.all) && /(don'?t allow|not now|would like to|access your|while using)/.test(s.all),
  },
  {
    type: 'paywall',
    when: (s) => /(free trial|start trial|subscribe|go premium|upgrade to|unlock (all|premium)|per month|per year|\/mo\b|restore purchase)/.test(s.all),
  },
  {
    type: 'payment',
    when: (s) => /(card number|cardholder|cvv|cvc|expiry|expiration|payment method|add card|apple pay|google pay|pay now)/.test(s.all),
  },
  {
    type: 'checkout',
    when: (s) => /(checkout|place order|order summary|confirm and pay|subtotal|order total)/.test(s.all) || (/\btotal\b/.test(s.all) && CURRENCY.test(s.all)),
  },
  {
    // "Add to cart" is the button on a product page, not the cart itself, so
    // it is removed before the word is looked for.
    type: 'cart',
    when: (s) => {
      const withoutButton = s.all.replace(/add to (cart|bag|basket)/g, ' ');
      return (
        /(your (cart|bag|basket)|shopping (cart|bag)|items in your)/.test(withoutButton) ||
        (/\b(cart|bag|basket)\b/.test(withoutButton) && CURRENCY.test(withoutButton))
      );
    },
  },
  {
    type: 'login',
    when: (s) => /(log ?in|sign ?in|welcome back)/.test(s.all) && /(password|email|phone|continue|forgot)/.test(s.all),
  },
  {
    type: 'signup',
    when: (s) => /(sign ?up|create (an )?account|register|join (now|free))/.test(s.all),
  },
  {
    type: 'confirmation',
    when: (s) => /(thank you|you'?re all set|confirmed|successfully|your order is|booking confirmed|all done)/.test(s.all),
  },
  {
    type: 'error',
    when: (s) => /(something went wrong|try again|couldn'?t|unable to|no internet|error)/.test(s.all),
  },
  {
    type: 'empty_state',
    when: (s) => /(nothing here|no results|no items|it'?s empty|you have no|start by adding|nothing to show)/.test(s.all),
  },
  {
    type: 'search_results',
    when: (s) => /(results|filters?|sort by|showing \d)/.test(s.all) && s.lineCount > 6,
  },
  {
    type: 'search',
    when: (s) => /\bsearch\b/.test(s.all) && (s.keyboard || s.lineCount < 12),
  },
  {
    type: 'settings',
    when: (s) => /(settings|preferences|privacy|account settings|log ?out|sign ?out|terms of service)/.test(s.all),
  },
  {
    type: 'notifications',
    when: (s) => /(notifications|activity)/.test(s.all) && s.lineCount > 4,
  },
  {
    type: 'messages',
    when: (s) => /(messages?|chats?|inbox|say hello|type a message|send a message)/.test(s.all),
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
    when: (s) => /(\bmap\b|directions|nearby places|show on map|view map)/.test(s.all),
  },
  {
    type: 'player',
    when: (s) => /(now playing|up next|shuffle|episodes?)/.test(s.all),
  },
  {
    type: 'product_detail',
    when: (s) => CURRENCY.test(s.all) && /(add to (cart|bag)|buy now|book now|reserve|reviews?|in stock|select size)/.test(s.all),
  },
  {
    type: 'detail',
    when: (s) => /(about|details|overview|description|read more)/.test(s.all) && !s.tabBar,
  },
  {
    type: 'onboarding',
    when: (s) => /(get started|let'?s go|skip|next|welcome|continue with)/.test(s.all) && s.lineCount <= 12 && !s.tabBar,
  },
  {
    type: 'form',
    when: (s) => s.keyboard,
  },
  {
    type: 'feed',
    when: (s) => s.tabBar && s.lineCount > 10,
  },
  {
    type: 'home',
    when: (s) => s.tabBar,
  },
];

/** Words that, when present, are worth keeping as tags. */
const TAG_WORDS = [
  'search', 'filter', 'profile', 'settings', 'chat', 'message', 'cart', 'checkout',
  'payment', 'price', 'review', 'rating', 'map', 'calendar', 'photo', 'video',
  'notification', 'login', 'signup', 'premium', 'subscription',
];

/** Text above this y is the status bar: the clock, signal, battery. */
const STATUS_BAR_BOTTOM = 0.045;

/**
 * Pulls the signals every rule reads out of one screenshot's text.
 *
 * The important part is what `all` excludes. A tab bar shows the same words on
 * every screen of an app — Bumble's says "Chats" whether you are looking at a
 * profile or a settings page — so matching content rules against it types every
 * screen the same. Chrome is therefore held separately from content: the tab
 * bar is used to detect that a tab bar exists, and nothing else.
 */
export function extractSignals(lines, options = {}) {
  const content = lines.filter((line) => line.y > STATUS_BAR_BOTTOM && line.y < TAB_BAR_TOP);
  const bottomItems = lines.filter((line) => line.y >= TAB_BAR_TOP && line.text.length <= 14);

  const singleLetters = lines.filter(
    (line) => line.y > KEYBOARD_TOP && /^[a-z]$/i.test(line.text.trim()),
  ).length;

  return {
    all: content.map((line) => line.text).join(' \n ').toLowerCase(),
    chrome: bottomItems.map((line) => line.text).join(' ').toLowerCase(),
    lines,
    content,
    lineCount: content.length,
    keyboard: singleLetters >= KEYBOARD_KEYS,
    tabBar: bottomItems.length >= 3,
    tabLabels: bottomItems.map((line) => line.text),
    luminance: options.luminance ?? null,
  };
}

/**
 * Best guess at a screen's title: the largest real words in the upper half.
 *
 * OCR on a phone screenshot returns a lot that is not language — clock digits,
 * signal glyphs, icon fragments read as punctuation. A title has to survive
 * looking like actual words, or the screen is better off named after its type.
 */
function titleFrom(lines) {
  const candidates = lines
    .filter((line) => line.y > STATUS_BAR_BOTTOM && line.y < 0.5)
    .map((line) => ({ ...line, text: line.text.trim() }))
    .filter((line) => {
      const text = line.text;
      if (text.length < 3 || text.length > 40) return false;
      if (/^\d{1,2}[:.]\d{2}$/.test(text)) return false; // the clock
      const letters = (text.match(/[a-z]/gi) || []).length;
      // Mostly letters, and at least one word of real length — this is what
      // rejects "•l =" and "0-".
      return letters >= 3 && letters / text.length >= 0.6 && /[a-z]{3}/i.test(text);
    })
    .sort((a, b) => b.h - a.h);

  return candidates[0]?.text ?? null;
}

const TYPE_LABEL = {
  search_results: 'Search results',
  product_detail: 'Product detail',
  empty_state: 'Empty state',
};

function labelFor(type) {
  return TYPE_LABEL[type] ?? type.charAt(0).toUpperCase() + type.slice(1).replace(/_/g, ' ');
}

/**
 * Classifies one screen from its text.
 *
 * Returns the same shape the model backend returns, so the rest of the pipeline
 * cannot tell which produced it — with `description` left empty, because a rule
 * has nothing honest to say there.
 *
 * @param {import('./ocr.js').TextLine[]} lines
 * @param {{luminance?: number|null, fallbackName?: string}} options
 */
export function classifyScreen(lines, options = {}) {
  const signals = extractSignals(lines, options);
  const matched = RULES.find((rule) => rule.when(signals));
  const screenType = matched?.type ?? 'other';

  const elements = [];
  if (signals.tabBar) elements.push('tab-bar');
  if (signals.keyboard) elements.push('text-field');
  if (/\bsearch\b/.test(signals.all)) elements.push('search-bar');
  if (CURRENCY.test(signals.all)) elements.push('price');
  if (signals.lineCount > 12) elements.push('list');

  const style = [];
  if (typeof signals.luminance === 'number') {
    style.push(signals.luminance < 100 ? 'dark' : 'light');
  }

  const tags = TAG_WORDS.filter((word) => signals.all.includes(word)).slice(0, 6);

  return {
    screenType,
    category: null,
    flow: null,
    name: titleFrom(lines) || labelFor(screenType) || options.fallbackName || 'Screen',
    // A rule knows what a screen is, not what it is for. Saying nothing beats
    // inventing a sentence that reads like analysis and is not.
    description: '',
    tags: [...new Set([...tags, screenType.replace(/_/g, '-')])].slice(0, 8),
    elements: [...new Set(elements)],
    style,
    blocked: false,
    blockedReason: null,
    actions: [],
    viaHeuristics: true,
  };
}

// ─── Flows ───────────────────────────────────────────────────────────────────

/**
 * Which journey a screen type belongs to. Types absent from this map have no
 * journey of their own and attach to whatever surrounds them — a form or a
 * confirmation belongs to the flow that led to it, not to a flow of its own.
 */
const FLOW_OF = {
  splash: ['Onboarding', 'onboarding'],
  onboarding: ['Onboarding', 'onboarding'],
  permission: ['Onboarding', 'onboarding'],
  login: ['Login', 'authentication'],
  signup: ['Sign up', 'authentication'],
  search: ['Search', 'search'],
  search_results: ['Search', 'search'],
  cart: ['Checkout', 'checkout'],
  checkout: ['Checkout', 'checkout'],
  payment: ['Checkout', 'checkout'],
  paywall: ['Checkout', 'checkout'],
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
  messages: ['Messages', 'discovery'],
  calendar: ['Booking', 'creation'],
};

/**
 * Groups screens into named flows by walking the capture in order.
 *
 * A flow is a consecutive run of screens belonging to the same journey, which
 * is what walking an app actually produces: several onboarding screens, then a
 * login, then browsing. Screens with no journey of their own join the run they
 * interrupt, and a run too short to be a flow is absorbed by its neighbour —
 * so every screen ends up somewhere and no flow has one screen in it.
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
  // flow is a single screen and nothing is dropped.
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].screens.length >= 2 || runs.length === 1) continue;
    const previous = runs[i - 1];
    const next = runs[i + 1];
    const target = previous ?? next;
    if (!target) continue;
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
