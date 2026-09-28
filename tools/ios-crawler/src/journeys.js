/**
 * The flow tree, read off how the person actually moved.
 *
 * A recording is a walk: open the app, land on a section, go into something,
 * come back, go into something else, switch tabs, go deeper, come back twice.
 * Every "go into something and come back" is a journey, and where it started
 * from is the journey it belongs under. That is the whole idea here — the tree
 * is built from returns, not from screen types:
 *
 *   Food                              a section: a screen with a tab bar
 *   ├─ Searching Food                 left Food home, came back
 *   ├─ Paan Corner detail             left Food home, went two deep…
 *   │  └─ Adding to cart              …came back to the detail, went elsewhere
 *   └─ Filtering restaurants          a sheet over Food home, dismissed
 *   Profile                           a section of its own kind
 *   └─ Editing profile
 *
 * The rules, in order of what the walk shows:
 *
 *   1. Everything before the first section screen is the onboarding, one
 *      journey, with the tasks inside it (signing in, subscribing) as its
 *      children.
 *   2. A screen with a tab bar belongs to the section named by its leftmost
 *      tab. Arriving on one closes whatever journey was open.
 *   3. A new screen reached from a section starts a child journey of that
 *      section; its first step is the section screen it was opened from, so
 *      the strip shows where the journey began.
 *   4. A new screen reached from inside a journey extends that journey.
 *   5. Returning to a screen seen earlier in the open journey closes the part
 *      after it into a child journey anchored on that screen — the person went
 *      deeper and came back, which is exactly a sub-flow.
 *   6. A profile or settings screen is a section in its own right, however it
 *      was reached, because that is how a library files it.
 *
 * Names come from the first new screen of a journey: a task when the screen
 * says what task it is (search, cart, sign-in, a filter sheet, a permission
 * prompt), the screen's own title otherwise — "Offer Zone", "Eatlist", "Bolt"
 * — which is how a feature is named on the app's own screen. A model, when one
 * is available, is asked to rename the tree afterwards in task language; the
 * structure stays what the walk showed.
 *
 * Loading states and third-party sign-in pages are transparent: they neither
 * start nor end a journey.
 */

import { cleanTitle, looksLikeNavTitle } from './heuristics.js';
import { flowCategoryFor, labelFor } from './taxonomy.js';

/** Types that open a section of their own wherever they are reached from. */
const SECTION_TYPES = new Set(['profile', 'settings']);

/** Types that never start a journey of their own; they ride along. */
const TRANSPARENT_TYPES = new Set(['loading', 'external_auth']);

/**
 * @typedef {object} Visit
 * @property {object} node   graph node (analysis, capture, id)
 * @property {object} [screen] the timeline screen this visit came from
 */

/**
 * @typedef {object} Journey
 * @property {string} name
 * @property {string} category
 * @property {string[]} nodeIds   steps in order, unique
 * @property {string|null} parent name of the journey this nests under
 * @property {boolean} section
 */

/**
 * @param {Visit[]} visits every screen the recording showed, in order, revisits included
 * @returns {Journey[]} parents before children, walk order
 */
export function buildJourneys(visits, options = {}) {
  /** `${fromId}->${toId}` → what the person did to get there. */
  const actions = options.actions ?? new Map();
  const steps = visits
    .map((visit) => visit.node)
    .filter((node) => node && !node.skipPublish && !TRANSPARENT_TYPES.has(node.analysis?.screenType));
  if (!steps.length) return [];

  const journeys = [];
  let sequence = 0;
  /**
   * A journey is identified by a key, not its name: two walks of the same
   * journey keep the same name side by side, as a flow library shows them.
   * `parent` holds the parent's key.
   */
  const make = (name, category, parent, section = false) => {
    const journey = { key: `f${++sequence}`, name: name || 'Journey', category, nodeIds: [], parent: parent ? parent.key : null, section };
    journeys.push(journey);
    return journey;
  };
  const add = (journey, node) => {
    if (!journey.nodeIds.includes(node.id)) journey.nodeIds.push(node.id);
  };

  // ─── 1. Onboarding: everything before the app proper ─────────────────────
  const firstSection = steps.findIndex((node) => sectionOf(node) !== null);
  const opening = firstSection === -1 ? steps : steps.slice(0, firstSection);
  if (opening.length) {
    const onboarding = make('Onboarding', 'onboarding', null, true);
    for (const node of opening) add(onboarding, node);
    for (const task of onboardingTasks(opening)) {
      const child = make(task.name, task.category, onboarding);
      for (const node of task.nodes) add(child, node);
    }
  }

  // What the app calls its sections: the labels of its section-switcher
  // chip row. A journey landing on a screen titled by one of these is a
  // section, not a sub-flow. Not every chip row is the switcher — a filter
  // strip ("Pre-Book", "Offers") or a brand carousel sits in the same place
  // on one screen — so a row counts only when it names a tab-bar section
  // ("Food", "Dineout" …) or repeats on three screens, the way a switcher
  // shown on every section page does.
  const context = { hubs: new Set() };
  const sectionNames = new Set(steps.map((node) => sectionOf(node)?.toLowerCase()).filter(Boolean));
  const seenOn = new Map();
  const chipRows = [];
  for (const node of steps) {
    // Written the way an app writes a section name — "Food", "My corner",
    // "Bites & more" — and not the way OCR misreads a product tile ("nOICE").
    const labels = (node.analysis?.signals?.chipLabels ?? []).map((chip) => String(chip).trim()).filter((label) => /^[A-Z][a-z'&]+( [A-Za-z'&]+)?$/.test(label) && label.length <= 16);
    if (!labels.length) continue;
    chipRows.push(labels);
    for (const label of new Set(labels.map((label) => label.toLowerCase()))) seenOn.set(label, (seenOn.get(label) ?? 0) + 1);
  }
  for (const labels of chipRows) {
    const lowered = labels.map((label) => label.toLowerCase());
    if (lowered.some((label) => sectionNames.has(label))) for (const label of lowered) context.hubs.add(label);
  }
  for (const [label, count] of seenOn) if (count >= 3) context.hubs.add(label);

  // ─── 2–6. The app proper: a stack of open journeys ───────────────────────
  const roots = new Map(); // section name → journey
  const stack = [];
  const current = () => stack[stack.length - 1] ?? null;

  const openRoot = (name, category = 'discovery') => {
    let root = roots.get(name.toLowerCase());
    if (!root) {
      root = make(name, category, null, true);
      roots.set(name.toLowerCase(), root);
    }
    stack.length = 0;
    stack.push(root);
    return root;
  };

  for (const node of steps.slice(opening.length)) {
    const section = sectionOf(node);
    const type = node.analysis?.screenType;

    if (section) {
      const root = openRoot(section);
      add(root, node);
      continue;
    }

    // A return: the screen is already in an open journey.
    const depth = stack.findIndex((journey) => journey.nodeIds.includes(node.id));
    if (depth !== -1) {
      stack.length = depth + 1;
      const journey = stack[depth];
      const at = journey.nodeIds.indexOf(node.id);
      const tail = journey.nodeIds.slice(at + 1);
      if (tail.length) {
        // Went deeper from this screen and came back: the part after it is a
        // journey of its own, anchored here. (For a section, this is the
        // excursion from one of its sub-pages.) An excursion that would be
        // named exactly as the journey it came from is the same journey
        // continuing, so it stays where it is.
        const firstNew = steps.find((candidate) => candidate.id === tail[0]);
        const name = journeyName(firstNew, node, actions.get(`${node.id}->${tail[0]}`) ?? null, context);
        if (name.toLowerCase() !== journey.name.toLowerCase()) {
          const child = make(name, flowCategoryFor(firstNew?.analysis?.screenType), journey);
          add(child, node);
          for (const id of tail) child.nodeIds.push(id);
          journey.nodeIds.length = at + 1;
        }
      }
      continue;
    }

    // A section of its own kind, wherever it was reached from.
    if (SECTION_TYPES.has(type)) {
      const root = openRoot(labelFor(type), flowCategoryFor(type));
      add(root, node);
      continue;
    }

    const open = current();
    if (!open) {
      // Nothing is open yet and this screen has no tab bar: the app has no
      // tab bar at all. Its first screen stands as the section.
      const root = openRoot(cleanTitle(node.analysis?.name) || 'Home');
      add(root, node);
      continue;
    }

    if (open.section) {
      // Going into something from a section: a new journey, starting from the
      // section screen it was opened from.
      const anchorId = open.nodeIds[open.nodeIds.length - 1];
      const anchor = steps.find((candidate) => candidate.id === anchorId) ?? null;
      const action = anchor ? actions.get(`${anchor.id}->${node.id}`) ?? null : null;
      // A hub the app itself lists as a section — a chip in its section
      // switcher — is a section, however it was reached.
      const tappedLabel = action && action.kind === 'tap' && action.label ? cleanTitle(action.label) : null;
      const hubTitle = [cleanTitle(node.analysis?.signals?.title ?? ''), tappedLabel, cleanTitle(node.analysis?.name ?? ''), hubMentioned(node, context.hubs)].find(
        (candidate) => candidate && context.hubs.has(candidate.toLowerCase()),
      );
      if (hubTitle) {
        const root = openRoot(hubTitle);
        add(root, node);
        continue;
      }
      const name = journeyName(node, anchor, action, context);
      if (name.toLowerCase() === open.name.toLowerCase()) {
        // Named for the place it is already in: the same journey continuing.
        add(open, node);
        continue;
      }
      const child = make(name, flowCategoryFor(type), open);
      if (anchor) add(child, anchor);
      add(child, node);
      stack.push(child);
    } else {
      add(open, node);
    }
  }

  // A task opened from two different sections belongs to the app, not to
  // either section: "Adding a delivery address" from Food and from Instamart
  // is one top-level journey.
  const byKey = new Map(journeys.map((journey) => [journey.key, journey]));
  const parentsOf = new Map();
  for (const journey of journeys) {
    if (!journey.parent) continue;
    const parent = byKey.get(journey.parent);
    if (!parent || !parent.section) continue;
    const list = parentsOf.get(journey.name.toLowerCase()) ?? new Set();
    list.add(parent.key);
    parentsOf.set(journey.name.toLowerCase(), list);
  }
  // Only a task is promoted — a verb phrase, or a journey that is not
  // browsing. A feature that exists in two sections ("Reorder" in Food and
  // in Instamart) stays in each and is qualified by section below.
  const isTask = (journey) => /^[A-Z][a-z]+ing\b/.test(journey.name) || !['discovery'].includes(journey.category);
  for (const journey of journeys) {
    if (journey.parent && isTask(journey) && (parentsOf.get(journey.name.toLowerCase())?.size ?? 0) >= 2) {
      journey.parent = null;
      journey.section = true;
    }
  }

  // The same name in two different places says where it is: "Reorder
  // (Instamart)", "Restaurant detail (Dineout)". Repeats under one parent
  // keep the plain name side by side.
  const groups = new Map();
  for (const journey of journeys) {
    const list = groups.get(journey.name.toLowerCase()) ?? [];
    list.push(journey);
    groups.set(journey.name.toLowerCase(), list);
  }
  for (const list of groups.values()) {
    const parents = new Set(list.map((journey) => journey.parent ?? ''));
    if (parents.size < 2) continue;
    const first = list[0].parent ?? '';
    for (const journey of list) {
      if ((journey.parent ?? '') === first) continue;
      const parent = journey.parent ? byKey.get(journey.parent) : null;
      if (parent && parent.name.toLowerCase() !== journey.name.toLowerCase()) journey.name = `${journey.name} (${parent.name})`;
    }
  }

  // Each journey's steps, with the action that led to each one from the
  // step before — the move the recording showed between those two screens.
  for (const journey of journeys) {
    journey.steps = journey.nodeIds.map((id, index) => ({
      nodeId: id,
      action: index === 0 ? null : actions.get(`${journey.nodeIds[index - 1]}->${id}`) ?? null,
    }));
  }

  // Parents before children, in the order they were opened.
  return journeys;
}

/**
 * A section name written on the screen itself, away from the switcher row: a
 * section page usually shows its own name somewhere — a header, a hero
 * caption — even when the navigation bar holds a location widget instead.
 * Lines sitting in the switcher row (two or more hub labels on one row) are
 * skipped, since every page shows the whole row.
 */
function hubMentioned(node, hubs) {
  const lines = node.analysis?.lines ?? [];
  const hubLines = lines.filter((line) => hubs.has(String(line.text || '').trim().toLowerCase()));
  for (const line of hubLines) {
    const rowMates = hubLines.filter((other) => other !== line && Math.abs(other.y - line.y) < 0.02).length;
    if (rowMates >= 1) continue;
    if (line.y > 0.9) continue; // a tab bar item, not a heading
    const text = String(line.text).trim();
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return null;
}

/** The tab a screen is on, when it has a tab bar. */
function sectionOf(node) {
  const label = node.analysis?.signals?.tabLabels?.[0];
  if (!label || !/^[A-Za-z][A-Za-z' ]{1,13}$/.test(label)) return null;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * The tasks inside an onboarding: consecutive screens of one kind of task
 * (authentication, a purchase), two or more long, named for how they began.
 */
function onboardingTasks(nodes) {
  const runs = [];
  for (const node of nodes) {
    const type = node.analysis?.screenType;
    const category = flowCategoryFor(type);
    const task = ['authentication', 'checkout'].includes(category) ? category : null;
    const last = runs[runs.length - 1];
    if (last && (task === null || task === last.category)) {
      if (task !== null || last.category !== 'other') last.nodes.push(node);
      continue;
    }
    runs.push({ category: task ?? 'other', nodes: [node] });
  }
  return runs
    .filter((run) => run.category !== 'other' && run.nodes.length >= 2)
    .map((run) => ({ ...run, name: taskName(run.nodes[0]) }));
}

/** The name of an authentication or purchase task from its first screen. */
function taskName(node) {
  const type = node.analysis?.screenType;
  const name = String(node.analysis?.name ?? '');
  if (type === 'signup') return 'Creating an account';
  if (type === 'otp') return 'Verifying OTP';
  if (type === 'login') {
    if (/phone/i.test(name)) return 'Entering phone number';
    if (/email/i.test(name)) return 'Logging in with email';
    return 'Logging in';
  }
  if (type === 'paywall') return 'Subscribing';
  if (type === 'payment' || type === 'checkout' || type === 'cart') return 'Placing an order';
  return labelFor(type);
}

/**
 * What to call a journey, from the first new screen it opened and the screen
 * it was opened from.
 *
 * A task where the screen says which task — searching, adding to a cart,
 * signing in, filtering, allowing a permission — and the screen's own title
 * otherwise, which is how the app itself names the feature.
 */
/** Base verbs a tapped label can start with, and their present participle. */
const PARTICIPLE = {
  add: 'Adding', apply: 'Applying', book: 'Booking', buy: 'Buying', call: 'Calling', cancel: 'Cancelling',
  change: 'Changing', chat: 'Chatting', check: 'Checking', choose: 'Choosing', complete: 'Completing',
  contact: 'Contacting', create: 'Creating', delete: 'Deleting', disable: 'Disabling', edit: 'Editing',
  enable: 'Enabling', explore: 'Exploring', filter: 'Filtering', get: 'Getting', hide: 'Hiding',
  invite: 'Inviting', join: 'Joining', link: 'Linking', log: 'Logging', manage: 'Managing', order: 'Ordering',
  pay: 'Paying', rate: 'Rating', record: 'Recording', redeem: 'Redeeming', remove: 'Removing',
  reorder: 'Reordering', report: 'Reporting', request: 'Requesting', reset: 'Resetting', save: 'Saving',
  schedule: 'Scheduling', search: 'Searching', see: 'Viewing', select: 'Selecting', send: 'Sending',
  set: 'Setting', share: 'Sharing', show: 'Showing', sign: 'Signing', sort: 'Sorting', start: 'Starting',
  subscribe: 'Subscribing', switch: 'Switching', track: 'Tracking', try: 'Trying', turn: 'Turning',
  unlock: 'Unlocking', update: 'Updating', upgrade: 'Upgrading', use: 'Using', verify: 'Verifying',
  view: 'Viewing', watch: 'Watching', write: 'Writing',
};

/**
 * "Add balance" → "Adding balance"; "Turn on Veg Mode" → "Turning on veg
 * mode"; "Hide restaurant" → "Hiding a restaurant". A label that does not
 * begin with a verb is not a task and returns null.
 */
export function taskPhrase(label) {
  const words = String(label || '').trim().replace(/\s+/g, ' ').split(' ');
  if (words.length < 2 || words.length > 6) return null;
  const verb = words[0].toLowerCase();
  const participle = PARTICIPLE[verb];
  if (!participle) return null;
  const rest = words.slice(1).map((word) => (/^[A-Z]{2,}$/.test(word) ? word : word.toLowerCase())).join(' ');
  // A bare noun after the verb reads better with an article: "Hiding a
  // restaurant", "Reporting an issue"; a phrase already carrying one, or a
  // plural, is left alone.
  const needsArticle = words.length === 2 && !/^(a|an|the|your|my|all|to|on|off|in|up|out|now|more)$/i.test(rest) && !/s$/i.test(rest) && !/^(balance|money|cash|account|profile|language|payment|settings|location|address|feedback)$/i.test(rest);
  const article = needsArticle ? (/^[aeiou]/i.test(rest) ? 'an ' : 'a ') : '';
  return `${participle} ${article}${rest}`.trim();
}

/** What kind of thing a detail page is about, from the words on it. */
function entityOf(text, anchorSection) {
  if (/(menu|dishes?|cuisine|restaurant|delivery in|veg|for two|order now|mins?\b.*km)/.test(text)) return 'Restaurant';
  if (/(add to cart|in stock|brand|pack of|\bqty\b|units?|grocer|instamart)/.test(text)) return 'Product';
  if (/(event|tickets?|venue|lineup|gates? open|dandiya|concert|show)/.test(text)) return 'Event';
  if (/(hotel|check[- ]?in|rooms?|nights?|guests?)/.test(text)) return 'Hotel';
  if (/(recipe|ingredients|servings)/.test(text)) return 'Recipe';
  if (/(episode|season|watch now|trailer)/.test(text)) return 'Title';
  if (/(job|apply now|salary)/.test(text)) return 'Job';
  if (anchorSection && /dine|food|eat/i.test(anchorSection)) return 'Restaurant';
  if (anchorSection && /mart|shop|store|grocer/i.test(anchorSection)) return 'Product';
  return null;
}

export function journeyName(node, anchor = null, action = null, context = { hubs: new Set() }) {
  if (!node) return 'Journey';
  const analysis = node.analysis ?? {};
  const type = analysis.screenType;
  const signals = analysis.signals ?? {};
  const name = String(analysis.name ?? '');
  const text = `${name} ${signals.title ?? ''} ${signals.headline ?? ''} ${(signals.ctas ?? []).join(' ')} ${(analysis.tags ?? []).join(' ')} ${analysis.description ?? ''}`.toLowerCase();
  const anchorSection = anchor ? sectionOf(anchor) : null;
  // A title only counts when it reads like the name of a page; a dish, a
  // brand or a shouted banner on the screen is not what the journey is.
  const rawTitle = cleanTitle(signals.title ?? '') || null;
  const title = rawTitle && looksLikeNavTitle(rawTitle) ? rawTitle : null;
  const overlay = node.capture?.overlay?.kind ?? null;
  const typed = action && action.kind === 'type' && action.label ? action.label : null;
  const rawTapped = action && action.kind === 'tap' && action.label ? cleanTitle(action.label) : null;
  const tapped = rawTapped && looksLikeNavTitle(rawTapped) ? rawTapped : null;

  switch (type) {
    case 'search':
    case 'search_results':
      if (typed) return `Searching for “${typed}”`;
      return anchorSection ? `Searching ${anchorSection}` : 'Searching';
    case 'cart':
      return 'Adding to cart';
    case 'checkout':
      return 'Placing an order';
    case 'payment':
      return 'Paying';
    case 'paywall':
      return 'Subscribing';
    case 'login':
      if (/phone/i.test(name)) return 'Logging in with phone number';
      if (/email/i.test(name)) return 'Logging in with email';
      return 'Logging in';
    case 'otp':
      return 'Verifying OTP';
    case 'signup':
      return 'Creating an account';
    case 'permission':
      if (/location/.test(text)) return 'Allowing location access';
      if (/notification/.test(text)) return 'Allowing notifications';
      if (/camera|photo/.test(text)) return 'Allowing camera access';
      if (/contact/.test(text)) return 'Allowing contacts access';
      return 'Allowing a permission';
    case 'map':
      return 'Choosing a location';
    case 'calendar':
      return 'Choosing a date';
    case 'product_detail':
    case 'detail': {
      // A library names detail pages by what they are about, not by the
      // particular item: "Restaurant detail", "Product detail", "Event detail".
      const entity = entityOf(text, anchorSection);
      if (entity) return `${entity} detail`;
      const taskFromTap = tapped ? taskPhrase(tapped) : null;
      if (taskFromTap) return taskFromTap;
      return title ? `${title} detail` : 'Detail';
    }
    case 'form':
      if (/address|pincode|zip|flat|landmark|street/.test(text)) return 'Adding a delivery address';
      if (tapped && taskPhrase(tapped)) return taskPhrase(tapped);
      if (/name|email|phone|birthday|date of birth|profile/.test(text)) return 'Editing profile';
      return title ? `Filling in ${title}` : 'Filling in a form';
    case 'settings':
      return 'Opening settings';
    case 'profile':
      return 'Viewing profile';
    case 'messages':
      return /support|help|agent/.test(text) ? 'Chatting with support' : 'Reading messages';
    case 'notifications':
      return 'Checking notifications';
    case 'empty_state':
      if (/location picker/i.test(name)) return 'Choosing a location';
      return title ? `Opening ${title}` : 'Reaching an empty state';
    case 'error':
      return 'Hitting an error';
    case 'confirmation':
      return /order/i.test(name) ? 'Completing an order' : /payment/i.test(name) ? 'Completing a payment' : 'Completing the task';
    case 'coach_mark':
      return /welcome/i.test(name) ? 'Dismissing the welcome tip' : 'Reading a feature tip';
    default:
      break;
  }

  // What was tapped, when it names a task: "Add balance" → "Adding balance",
  // "Turn on Veg Mode" → "Turning on veg mode".
  const tappedTask = tapped ? taskPhrase(tapped) : null;

  if (overlay || ['dialog', 'bottom_sheet', 'toast'].includes(type)) {
    if (/veg mode|veg only|pure veg/.test(text) || /veg/i.test(tapped ?? '')) return 'Turning on veg mode';
    if (tappedTask) return tappedTask;
    if (/filter|sort by/.test(text)) return anchorSection ? `Filtering ${anchorSection}` : 'Filtering';
    if (/language/.test(text)) return 'Changing language';
    if (/report/.test(text)) return 'Reporting an issue';
    if (/share/.test(text)) return 'Sharing';
    if (/log ?out|sign ?out/.test(text)) return 'Logging out';
    if (/delete/.test(text)) return 'Deleting';
    if (title) return `Opening ${title}`;
    if (tapped) return `Opening ${tapped}`;
    return anchor?.analysis?.name ? `Opening ${anchor.analysis.name} options` : 'Opening a sheet';
  }

  // A feature screen: the task the tapped label names when it names one, else
  // the app's own title for it — "Offer Zone", "Eatlist", "Bolt" — the way the
  // app lists its features. Without a real title, a generic name stands in
  // for the model to replace; a dish or a brand never becomes a journey.
  if (tappedTask) return tappedTask;
  if (title) return title;
  if (tapped) return tapped;
  if (['home', 'feed', 'category', 'dashboard'].includes(type)) {
    if (signals.chips || type === 'category') return anchorSection ? `Browsing a category (${anchorSection})` : 'Browsing a category';
    return anchorSection ? `Browsing ${anchorSection}` : 'Browsing';
  }
  const entity = entityOf(text, anchorSection);
  if (entity) return `${entity} detail`;
  return anchorSection ? `Opening a page (${anchorSection})` : 'Opening a page';
}
