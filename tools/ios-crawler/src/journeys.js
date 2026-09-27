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

import { cleanTitle } from './heuristics.js';
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
export function buildJourneys(visits) {
  const steps = visits
    .map((visit) => visit.node)
    .filter((node) => node && !node.skipPublish && !TRANSPARENT_TYPES.has(node.analysis?.screenType));
  if (!steps.length) return [];

  const journeys = [];
  const nameCount = new Map();
  const make = (name, category, parent, section = false) => {
    const base = name || 'Journey';
    const count = (nameCount.get(`${parent ?? ''}|${base.toLowerCase()}`) ?? 0) + 1;
    nameCount.set(`${parent ?? ''}|${base.toLowerCase()}`, count);
    const journey = { name: count === 1 ? base : `${base} (${count})`, category, nodeIds: [], parent, section };
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
      const child = make(task.name, task.category, onboarding.name);
      for (const node of task.nodes) add(child, node);
    }
  }

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
      if (tail.length && !journey.section) {
        // Went deeper from this screen and came back: the part after it is a
        // journey of its own, anchored here.
        const firstNew = steps.find((candidate) => candidate.id === tail[0]);
        const child = make(journeyName(firstNew, node), flowCategoryFor(firstNew?.analysis?.screenType), journey.name);
        add(child, node);
        for (const id of tail) child.nodeIds.push(id);
        journey.nodeIds.length = at + 1;
      } else if (tail.length && journey.section) {
        // Came back to a section screen that has no tab bar of its own (a
        // sub-page of the section): the excursion after it is a child.
        const firstNew = steps.find((candidate) => candidate.id === tail[0]);
        const child = make(journeyName(firstNew, node), flowCategoryFor(firstNew?.analysis?.screenType), journey.name);
        add(child, node);
        for (const id of tail) child.nodeIds.push(id);
        journey.nodeIds.length = at + 1;
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
      const child = make(journeyName(node, anchor), flowCategoryFor(type), open.name);
      if (anchor) add(child, anchor);
      add(child, node);
      stack.push(child);
    } else {
      add(open, node);
    }
  }

  // Parents before children, in the order they were opened.
  return journeys;
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
  if (type === 'signup') return 'Creating an account';
  if (type === 'login' || type === 'otp') return 'Logging in';
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
export function journeyName(node, anchor = null) {
  if (!node) return 'Journey';
  const analysis = node.analysis ?? {};
  const type = analysis.screenType;
  const signals = analysis.signals ?? {};
  const text = `${signals.title ?? ''} ${signals.headline ?? ''} ${(signals.ctas ?? []).join(' ')} ${(analysis.tags ?? []).join(' ')} ${analysis.description ?? ''}`.toLowerCase();
  const anchorSection = anchor ? sectionOf(anchor) : null;
  const title = cleanTitle(signals.title ?? '') || null;
  const overlay = node.capture?.overlay?.kind ?? null;

  switch (type) {
    case 'search':
    case 'search_results':
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
    case 'otp':
      return 'Logging in';
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
      return title ? `${title} detail` : 'Item detail';
    case 'detail':
      return title ?? 'Detail';
    case 'form':
      if (/address|pincode|zip|flat|landmark|street/.test(text)) return 'Adding a delivery address';
      if (/name|email|phone|birthday|date of birth/.test(text)) return 'Editing profile';
      return title ?? 'Filling in a form';
    case 'settings':
      return 'Settings';
    case 'profile':
      return 'Profile';
    case 'messages':
      return /support|help|agent/.test(text) ? 'Chatting with support' : 'Messages';
    case 'notifications':
      return 'Notifications';
    case 'empty_state':
    case 'error':
    case 'confirmation':
      return title ?? labelFor(type);
    default:
      break;
  }

  if (overlay || ['dialog', 'bottom_sheet', 'toast', 'coach_mark'].includes(type)) {
    if (/filter|sort by/.test(text)) return anchorSection ? `Filtering ${anchorSection}` : 'Filtering';
    if (/veg mode|veg only|pure veg/.test(text)) return 'Turning on veg mode';
    if (/language/.test(text)) return 'Changing language';
    if (/report/.test(text)) return 'Reporting an issue';
    if (/share/.test(text)) return 'Sharing';
    if (/log ?out|sign ?out/.test(text)) return 'Logging out';
    if (/delete/.test(text)) return 'Deleting';
    if (title) return title;
    return anchor?.analysis?.name ? `${anchor.analysis.name} options` : labelFor(type);
  }

  return title ?? cleanTitle(analysis.name ?? '') ?? labelFor(type);
}
