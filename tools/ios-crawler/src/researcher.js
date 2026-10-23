/**
 * The UX researcher pass: human content for a flow tree.
 *
 * By the time this runs, the recording has already been read. The segmenter
 * found the screens, the classifier typed them, and the journey builder laid
 * out the tree from how the person moved — what nests under what, which steps
 * each journey has, what was tapped between them. None of that is up for
 * revision here. What a model adds is language: what each screen is for, what
 * the person is trying to do, what a journey should be called so a designer
 * browsing the library recognises the task.
 *
 * The brief the model works to is the one written for it in plain words (see
 * BRIEF), with the screenshots themselves when the model can see and every
 * screen's recognised text either way. The reply is JSON keyed by the ids we
 * gave, validated field by field, and applied only where it is honest: a
 * missing or oversized answer leaves the heuristic name in place.
 *
 * Structure from the walk, words from the model — each doing what it is good
 * at.
 */

import { pageLines } from './heuristics.js';
import { ELEMENTS, typeFromName } from './taxonomy.js';

/** The brief, as written for the researcher. Sent verbatim as the system prompt. */
export const BRIEF = `Analyze the uploaded app screenshots as a UX/UI researcher and product designer.
Do not simply extract or copy the visible text from the screenshots.
Instead, understand the UI, screen purpose, available actions, navigation patterns, visual hierarchy, and relationships between screens and generate a realistic user-flow structure, the way a professional design-reference library organises one.
The goal is to create human-like UX flow content from the screenshots.
For every screen:

1. Understand what the user is trying to accomplish.
2. Identify the screen's primary purpose.
3. Identify the important user action available on that screen.
4. Understand what screen/action would logically come before and after it.
5. Group related screens into meaningful user journeys.
6. Create descriptive flow names based on the user's intent, not the screen title.
7. Generate detailed step-by-step flow content.
8. Do not invent actions or screens that are not supported by the screenshots or established navigation context.
9. Do not treat every screenshot as an independent flow.
10. Do not create a flat list of screens.`;

/**
 * Screens described per call. Three keeps each call short enough that a local
 * vision model answers in well under a minute and rarely runs out of room;
 * a failed call costs three screens' time, not six.
 */
const SCREEN_BATCH = 3;
/**
 * Output room for one batch's names, purposes and descriptions. Qwen3-VL
 * thinks before it answers even with thinking off, and a full answer for
 * three screens can run past 2,000 tokens; at 4,000 nearly every call fits.
 * One that is still cut off has most likely got stuck repeating itself, and
 * is asked once more.
 */
const SCREEN_TOKENS = 4000;

/** A placeholder rather than a name: the journey builder's fallbacks, which say nothing about what was done. */
const PLACEHOLDER_NAME = /^(opening a (page|sheet)|browsing( a category)?|detail|journey|filling in a form|reaching an empty state)\b/i;

/**
 * A verb and a generic word, nothing that says which ("Editing settings" for
 * a cookie banner, "Opening a chat", "Viewing a page"): a name that fits half
 * the flows in any app. Specific words after it ("Editing cookie settings",
 * "Opening chat options") make it a name.
 */
const GENERIC_NAME = /^((opening|viewing|accessing|editing|starting|managing|using|browsing|exploring|checking|visiting|reviewing|going to|navigating to)\s+(an?\s+|the\s+|your\s+)?(settings?|page|screen|chat|chats|menu|options?|details?|item|items|content|feature|features|section|view|panel|popup|dialog|modal|app|information|info|list)|chatting|browsing|viewing|using the app)$/i;

/** A placeholder, or a name too generic to tell this flow from others. */
function isVagueName(name) {
  const text = String(name ?? '').trim();
  return PLACEHOLDER_NAME.test(text) || GENERIC_NAME.test(text);
}
const VAGUE_NAME = { test: isVagueName };

/**
 * When the model still names a flow vaguely, the screens often say plainly
 * what was done: the same interface patterns in any app. Read in order of how
 * decisive they are; the first that shows on a step names the flow.
 */
const CUES = [
  { test: /\b(delete|remove)\s+([a-z ]{2,20}?)\s*\?/i, name: (m) => `Deleting a ${m[2].trim().toLowerCase().replace(/^(this|the|a|an)\s+/, '')}` },
  { test: /\b(microphones?|dictat|listening\.\.\.)/i, name: () => 'Using voice input' },
  { test: /\bwants to\b.*\b(camera)/i, name: () => 'Allowing camera access' },
  { test: /\bwants to\b.*\b(location)/i, name: () => 'Allowing location access' },
  { test: /\b(upload or add files|add files|attach (a )?file)/i, name: () => 'Adding files to a message' },
  { test: /\b(give (negative |positive )?feedback|report (a |an )?(issue|problem))/i, name: () => 'Giving feedback' },
  { test: /\b(rename|edit name)\b/i, name: () => 'Renaming an item' },
  { test: /\b(copy link|share link|invite)\b/i, name: () => 'Sharing a link' },
];

/** A name for the flow from what its screens plainly show, or null. */
function nameFromCues(journey, graph) {
  const steps = journey.nodeIds.map((id) => graph.get(id)).filter(Boolean);
  for (const cue of CUES) {
    for (const node of steps) {
      const text = pageLines(node.analysis?.lines ?? [], node.analysis?.signals?.layout).map((line) => line.text).join(' \n ');
      const match = cue.test.exec(text);
      if (match) return cue.name(match);
    }
  }
  return null;
}

/** What both passes share: the grouping is fixed, the words are the job. */
const SHARED_RULES = `
You are given journeys already grouped from a real recording of one app, in the order they were walked, with the screens in each. That grouping is fixed: keep every journey and every screen id exactly as given, and do not add, merge, split or reorder them. Return JSON only — no prose, no markdown fence. Use keys and ids exactly as written in the input.

The names given in the input are machine guesses read off the screens' text and are often wrong — a dish, a brand, a banner, a fragment. Never repeat such a name. Always write your own name from what the screen is for and what the person does there. A product, dish, restaurant or brand name is never a journey name; a journey about one is "Restaurant detail", "Product detail" or the task done there. Only say what the screenshots and their text support; where you cannot tell, name a screen by its role (for example "Category listing", "Item detail") and do not guess.`;

/** Pass one: the journey names, from the whole tree, no images. */
const JOURNEY_RULES = `${SHARED_RULES}

Return exactly this shape — a flat map from each journey key given (J0, J1, …) to its new name, one line per journey, and nothing else:
{ "journeys": { "J0": "Onboarding", "J1": "Food", "J2": "Searching dishes & restaurants", "J3": "Adding a dish to cart" } }
Name each journey from what its steps show: the page titles, the tab and the words on the pages. A page titled with a chat's or a document's own title ("Greeting", "Untitled") is that chat or document, so the journey is "Chatting with Claude" or "Editing a document", never about the title's word. A journey on a page's tab is named for the task on that tab ("Browsing skills", "Connecting a connector"). Use the app's words for its features. Each flow is exactly one task, so each name names one task: never join two with "and" ("Adding to a project and accessing support" is wrong; "Adding to a project" is right). Siblings that are the same task walked again get the same name. The names in quotes here are examples from a different app; never copy one. Do not repeat the steps or the machine guesses from the input; the guess is there only to show which journey is meant, and it is usually wrong. Do not add keys that were not given. Every value is a name of two to six words.

Journey names read like a professional design-reference library's: the task in the person's own terms, starting with a verb ending in -ing whenever the person is doing something — "Searching dishes & restaurants", "Adding a dish to cart", "Turning on veg mode filter", "Booking a table", "Subscribing to Swiggy One", "Editing profile". A journey that opens a feature is named for the feature as the app names it — "Offer Zone", "Eatlist", "Restaurant detail". A journey inside a section is never named after the section it is in: a journey inside "Food" is the task done there, not "Food". A top-level section keeps its tab name — "Food", "Instamart", "Profile" — and "Onboarding" stays "Onboarding".`;

/**
 * The library's screen types, each with what it means, for the model to
 * choose from. A screen's type decides where it is filed — the Screens
 * filters, "Compare … with" — so it is the model's call from the picture,
 * not the on-device rules' guess from the words on it.
 */
const SCREEN_TYPE_MEANINGS = {
  splash: 'the launch screen, a logo and little else',
  landing: 'a welcome page before sign-in, with sign-in or sign-up buttons',
  onboarding: 'intro, tour or setup steps before the app is used — "how will you use it?", feature slides',
  permission: 'a system or in-app request for access — photos, notifications, location',
  login: 'signing in: email or password entry, a verification code, sign-in options',
  signup: 'creating an account',
  home: 'the app\'s main page after sign-in',
  dashboard: 'an overview of numbers, charts or status',
  feed: 'a scrolling list of posts, items or content',
  search: 'searching, search results, or sorting and filtering them',
  detail: 'one item, document, page or record opened',
  product: 'one product for sale',
  cart: 'items gathered to buy',
  checkout: 'paying or confirming a purchase',
  pricing: 'plans, prices, a paywall or an upgrade offer',
  profile: 'a person\'s profile',
  settings: 'settings, preferences, account, workspace or member management',
  notifications: 'an inbox of notifications or activity',
  messages: 'a chat or conversation — with people or with an AI assistant',
  map: 'a map',
  calendar: 'a calendar, schedule or date picking',
  player: 'playing video or audio',
  form: 'filling in fields — a name, an address, details — outside signing in',
  modal: 'a sheet, menu, dialog or popup over a page',
  success: 'a confirmation that something worked',
  error: 'something failed',
  empty: 'a page with nothing in it yet',
  loading: 'a page still loading',
  other: 'none of these',
};
const SCREEN_TYPE_GUIDE = Object.entries(SCREEN_TYPE_MEANINGS)
  .map(([type, meaning]) => `"${type}" (${meaning})`)
  .join('; ');

/** Pass two: the screens of one batch, with their images. */
const SCREEN_RULES = `${SHARED_RULES}

Return exactly this shape, one entry per screen id given, and nothing else:
{ "screens": { "<screen id exactly as given, e.g. s004>": { "name": "...", "type": "...", "elements": ["..."], "purpose": "...", "primaryAction": "..." } } }

The type is the one word from this list that says what the screen is, judged from the screenshot, not from single words on it: ${SCREEN_TYPE_GUIDE}

The elements are the UI parts clearly visible on the screenshot, only from this list, most prominent first, at most six: ${ELEMENTS.join(', ')}. A row of buttons at the bottom is a "tab-bar" only when it switches between the app's main sections; a keyboard on screen is "keyboard".

Screen names are short plain nouns a designer would file the screen under — "Phone number entry", "Restaurant detail", "Filter sheet", "Location picker (logged out)", "Order placed" — never the marketing line or a fragment of visible text. A purpose is one short sentence (under 15 words) on what the screen is for. The primary action is the one thing the person mostly does there, as a short imperative — "Enter mobile number", "Add to cart", "Apply filters" — or "" when there is none (a splash, a loading state). Write no descriptions and no other fields. Be brief; every field is one line.`;

/** Kept for callers that build the old single prompt; the passes above are what runs. */
const OUTPUT_RULES = `${JOURNEY_RULES}\n${SCREEN_RULES}`;

/**
 * Serialises the tree for the model, with an [image N] marker per screen when
 * images are being sent, so the reply can be tied back to ids.
 *
 * @param {object[]} journeys  from buildJourneys, with keys
 * @param {import('./graph.js').ScreenGraph} graph
 * @param {{maxLines?: number, withImages?: boolean, focus?: string[]}} options
 */
/** A section name that is a misread tab label rather than a word: "Ch", "Ho", "|". */
export function brokenSectionName(name) {
  const text = String(name ?? '').trim();
  return text.replace(/[^a-z]/gi, '').length < 3;
}

export function describeTree(journeys, graph, options = {}) {
  const maxLines = options.maxLines ?? 30;
  const focus = options.focus ? new Set(options.focus) : null;
  const screenIds = [];
  const lines = [];
  const nameOfKey = new Map(journeys.map((journey) => [journey.key ?? journey.name, journey.name]));

  journeys.forEach((journey, index) => {
    const parent = journey.parent ? nameOfKey.get(journey.parent) ?? journey.parent : null;
    const misread = !parent && journey.section && brokenSectionName(journey.name) ? ' (its tab name was misread — name the section for the area it is, like "Home" or "Getting started")' : '';
    lines.push(`Journey key "${journeyKey(journey, index)}"${parent ? ` — inside "${parent}"` : journey.section ? ` — top-level section${misread}` : ' — top level'}`);
    (journey.steps ?? journey.nodeIds.map((nodeId) => ({ nodeId, action: null }))).forEach((step, position) => {
      const node = graph.get(step.nodeId);
      if (!node) return;
      const inFocus = !focus || focus.has(node.id);
      if (inFocus && !screenIds.includes(node.id)) screenIds.push(node.id);
      const imageIndex = options.withImages && inFocus ? screenIds.indexOf(node.id) + 1 : null;
      const analysis = node.analysis ?? {};
      // Text travels only for the screens this call is about; the rest of the
      // tree is there for context and needs only its names.
      const text = !inFocus ? '' : screenText(analysis, maxLines);
      const arrived = step.action ? ` ← ${step.action.kind}${step.action.label ? ` "${step.action.label}"` : ''}` : '';
      lines.push(
        `  step ${position + 1}${imageIndex ? ` [image ${imageIndex}]` : ''}: id=${node.id} · "${analysis.name}" · type=${analysis.screenType}${(analysis.states ?? []).length ? ` · state=${analysis.states.join(',')}` : ''}${arrived}`,
      );
      if (text) lines.push(`     text: ${text.slice(0, 600)}`);
    });
    lines.push('');
  });

  return { text: lines.join('\n'), screenIds };
}

/**
 * The tree at a glance, for naming the journeys: every journey with where it
 * sits and its steps as names and the taps between them. No recognised text
 * — a small model handed the text copies it back instead of naming things.
 *
 * `journeys` is what gets a line and a "J{index}" label each; `all` (default:
 * `journeys` itself) is the wider set a parent's own name is looked up
 * against — the two differ when this is one batch of a larger tree split
 * across several calls, so a child whose parent sits in a different batch
 * still says what it is inside, not the parent's raw key.
 */
/** Lowercased page lines shown on most of these screens. */
function sharedPageWords(nodes) {
  if (nodes.length < 3) return new Set();
  const counts = new Map();
  for (const node of nodes) {
    const seen = new Set(pageLines(node.analysis?.lines ?? [], node.analysis?.signals?.layout).map((line) => String(line.text || '').trim().toLowerCase()));
    for (const text of seen) counts.set(text, (counts.get(text) ?? 0) + 1);
  }
  const most = Math.ceil(nodes.length * 0.6);
  return new Set([...counts].filter(([, count]) => count >= most).map(([text]) => text));
}

export function describeJourneys(journeys, graph, all = journeys) {
  const nameOfKey = new Map(all.map((journey) => [journey.key ?? journey.name, journey.name]));
  const indexOfJourney = new Map(all.map((journey, index) => [journey, index]));
  const lines = [];
  for (const journey of journeys) {
    const index = indexOfJourney.get(journey);
    const parent = journey.parent ? nameOfKey.get(journey.parent) ?? journey.parent : null;
    // Words on most of the journey's steps (a chat's header and greeting, the
    // page under a popup) say nothing about any one step; each step shows
    // what it adds — the cookie banner's own words, not the home page's.
    const shared = sharedPageWords(journey.nodeIds.map((id) => graph.get(id)).filter(Boolean));
    // A screen that names no tab is on the tab of the step before it.
    let lastTab = null;
    const steps = (journey.steps ?? journey.nodeIds.map((nodeId) => ({ nodeId, action: null })))
      .map((step) => {
        const node = graph.get(step.nodeId);
        if (!node) return null;
        const analysis = node.analysis ?? {};
        lastTab = analysis.signals?.activeTab ?? analysis.signals?.walkTab ?? lastTab;
        const tap = step.action?.kind === 'tap' && step.action.label ? ` (after tapping "${step.action.label}")` : step.action?.kind === 'type' && step.action.label ? ` (after typing "${step.action.label}")` : '';
        // What the page itself says — its title, the tab it is on and its
        // first few lines, navigation chrome left out — so a chat titled
        // "Greeting" reads as a chat, not as a greeting page.
        const signals = analysis.signals ?? {};
        const words = pageLines(analysis.lines ?? [], signals.layout)
          .map((line) => String(line.text || '').trim())
          .filter((text) => text.length >= 4 && /[a-z]{3}/i.test(text) && text !== signals.title && !shared.has(text.toLowerCase()))
          .slice(0, 4)
          .join('; ');
        const entry = signals.listedInSidebar ? ' (an item from the sidebar’s list, such as a chat or document)' : '';
        const page = signals.title ? ` page "${signals.title}"${entry}` : '';
        const tab = lastTab ? ` on the "${lastTab}" tab` : '';
        const says = words ? ` showing: ${words.slice(0, 120)}` : '';
        return `${analysis.name}${analysis.screenType && analysis.screenType !== 'other' ? ` [${analysis.screenType.replace(/_/g, ' ')}]` : ''}${page}${tab}${says}${tap}`;
      })
      .filter(Boolean);
    // A long journey is shown by its first and last steps; its middle is more of the same.
    if (steps.length > 8) steps.splice(5, steps.length - 7, `… ${steps.length - 7} more steps …`);
    // Bare keys on purpose: a key that carried the guessed name came back as
    // the answer, word for word. The guess is given separately, as a guess.
    const misread = !parent && brokenSectionName(journey.name) ? ' (its tab name was misread — name the section for the area it is, like "Home" or "Search")' : '';
    lines.push(`J${index} — ${parent ? `inside "${parent}"` : 'top-level section'}${misread} — machine guess "${journey.name}" — steps: ${steps.join(' → ')}`);
  }
  return lines.join('\n');
}

function screenText(analysis, maxLines) {
  return pageLines(analysis.lines ?? [], analysis.signals?.layout)
    .filter((line) => line.y > 0.045)
    .slice(0, maxLines)
    .map((line) => String(line.text || '').trim())
    .filter((t) => t.length > 1)
    .join(' | ');
}

/**
 * One batch of screens, and only those: each with the journey it sits in,
 * its type and state, and its recognised text. Nothing else is listed, so a
 * small model cannot wander off and rewrite the whole library in one reply.
 */
export function describeScreens(batch, journeys, graph, options = {}) {
  const nameOfKey = new Map(journeys.map((journey) => [journey.key ?? journey.name, journey.name]));
  const pathOf = (journey) => {
    const parts = [journey.name];
    let cursor = journey;
    for (let guard = 0; cursor?.parent && guard < 6; guard++) {
      cursor = journeys.find((candidate) => (candidate.key ?? candidate.name) === cursor.parent);
      if (cursor) parts.unshift(cursor.name);
    }
    return parts.join(' › ');
  };
  const lines = [];
  batch.forEach((node, index) => {
    const analysis = node.analysis ?? {};
    const home = journeys.find((journey) => journey.nodeIds.includes(node.id));
    const text = screenText(analysis, options.maxLines ?? 30);
    lines.push(
      `${options.withImages ? `[image ${index + 1}] ` : ''}id=${node.id}${home ? ` · in "${pathOf(home)}"` : ''} · guessed name "${analysis.name}" · type=${analysis.screenType}${(analysis.states ?? []).length ? ` · state=${analysis.states.join(',')}` : ''}`,
    );
    if (text) lines.push(`   text: ${text.slice(0, 700)}`);
  });
  void nameOfKey;
  return lines.join('\n');
}

/** The key a journey is referred to by in the exchange: index plus name, hard to mix up. */
export function journeyKey(journey, index) {
  return `J${index} ${journey.name}`;
}

/**
 * What can be read from a reply that was cut off mid-way: the complete
 * entries before the cut. Every open string, object and array is closed
 * after the last complete value, so `{"a": {"x": 1}, "b": {"y": "par` gives
 * `{"a": {"x": 1}}`. Returns null when nothing complete is there.
 */
export function salvageJson(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  if (start === -1) return null;
  const stack = [];
  let inString = false;
  let escaped = false;
  // Positions just after a complete value at each depth, so the cut can fall
  // back to the last one.
  let lastComplete = -1;
  let lastCompleteDepth = 0;
  for (let i = start; i < raw.length; i++) {
    const char = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') {
        inString = false;
        if (stack.length && stack[stack.length - 1].expect === 'value') {
          lastComplete = i + 1;
          lastCompleteDepth = stack.length;
        }
      }
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{' || char === '[') {
      stack.push({ kind: char, expect: char === '{' ? 'key' : 'value' });
      continue;
    }
    if (char === '}' || char === ']') {
      stack.pop();
      if (!stack.length) return safeParse(raw.slice(start, i + 1));
      lastComplete = i + 1;
      lastCompleteDepth = stack.length;
      continue;
    }
    if (char === ':' && stack.length) stack[stack.length - 1].expect = 'value';
    if (char === ',' && stack.length) stack[stack.length - 1].expect = stack[stack.length - 1].kind === '{' ? 'key' : 'value';
    if (/[0-9a-z]/i.test(char) && stack.length && stack[stack.length - 1].expect === 'value') {
      // A bare number/true/false/null: complete when the next char is not part of it.
      const next = raw[i + 1];
      if (next === undefined || !/[0-9a-z.+\-]/i.test(next)) {
        lastComplete = i + 1;
        lastCompleteDepth = stack.length;
      }
    }
  }
  if (lastComplete === -1) return null;
  // Rebuild the closers for the depth at the cut.
  let head = raw.slice(start, lastComplete);
  const closers = [];
  {
    // Re-walk to find which brackets are open at lastComplete.
    const open = [];
    let str = false;
    let esc = false;
    for (let i = 0; i < head.length; i++) {
      const c = head[i];
      if (str) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') str = false;
        continue;
      }
      if (c === '"') str = true;
      else if (c === '{') open.push('}');
      else if (c === '[') open.push(']');
      else if (c === '}' || c === ']') open.pop();
    }
    closers.push(...open.reverse());
  }
  void lastCompleteDepth;
  head = head.replace(/,\s*$/, '');
  return safeParse(head + closers.join(''));
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Runs the researcher over a tree and applies what comes back, in two passes:
 *
 *   1. the journey names, from the whole tree as text — one short call;
 *   2. the screens, six at a time with their images, each call seeing only
 *      its own six.
 *
 * One call that asked for everything at once was the slow part: a small
 * model would restart from the first screen every time and run out of room
 * before it reached the six it was asked about. Splitting the job makes
 * each reply short and impossible to get wrong in that way. A reply that is
 * still cut off keeps its complete entries; only the screens it missed are
 * asked again, in a smaller call.
 *
 * `complete` is the model adapter: `({system, blocks, maxTokens}) =>
 * Promise<string>`, where blocks are text and image parts. `encodeImage(path)`
 * returns base64 PNG for a screenshot.
 *
 * @returns {Promise<{journeysRenamed: number, screensUpdated: number, batches: number}>}
 */
export async function researchTree(journeys, graph, options) {
  const { complete, encodeImage, app, vision = true, batchSize = SCREEN_BATCH, extractJson, log, analyzer = 'ai', onBatch, only = null, journeyModel = null } = options;
  if (!journeys.length) return { journeysRenamed: 0, screensUpdated: 0, batches: 0 };

  const nodes = [];
  for (const journey of journeys) {
    for (const nodeId of journey.nodeIds) {
      const node = graph.get(nodeId);
      if (node && !nodes.includes(node)) nodes.push(node);
    }
  }
  const header = `App: ${app?.name ?? 'unknown'}${app?.industry ? ` (${app.industry})` : ''}.\n\n`;
  const parse = (reply) => {
    try {
      return extractJson(reply);
    } catch (error) {
      const partial = salvageJson(reply);
      if (partial) return partial;
      throw error;
    }
  };
  const debug = (reply) => {
    if (process.env.MOTVIN_RESEARCH_DEBUG) process.stderr.write(`\n[researcher reply]\n${reply}\n`);
  };

  const proposals = { journeys: {}, screens: {} };
  let calls = 0;

  // ── Pass one: journey names, a batch at a time ─────────────────────────────
  // One call for the whole tree used to mean a long recording's 40-odd
  // journeys all had to fit the reply in a single maxTokens budget — a model
  // that ran out of room partway through simply left everything after the
  // cut unrenamed, the heuristic guess (often a stray name or label off the
  // screen) standing uncorrected. Batched and retried the same way the
  // screens pass already is, so every journey gets an actual naming attempt.
  if (only !== 'screens') {
    const JOURNEY_BATCH = 15;
    const journeyQueue = [];
    for (let i = 0; i < journeys.length; i += JOURNEY_BATCH) journeyQueue.push(journeys.slice(i, i + JOURNEY_BATCH));
    log?.(`researcher: naming ${journeys.length} journey(s) from the tree${journeyModel ? ` with ${journeyModel}` : ''}`);
    onBatch?.(0, nodes.length, 0, 'journeys');
    let journeyEmptyInARow = 0;
    while (journeyQueue.length) {
      if (journeyEmptyInARow >= 3) {
        log?.(`researcher: the model returned nothing ${journeyEmptyInARow} times running — keeping the names read off the screens for the ${journeyQueue.reduce((n, b) => n + b.length, 0)} journey(s) left`);
        break;
      }
      const batch = journeyQueue.shift();
      calls++;
      let got = [];
      try {
        const tree = describeJourneys(batch, graph, journeys);
        const reply = await complete({ system: `${BRIEF}\n${JOURNEY_RULES}`, blocks: [{ type: 'text', text: `${header}${tree}` }], maxTokens: 1200, temperature: 0, ...(journeyModel ? { model: journeyModel } : {}) });
        debug(reply);
        const raw = parse(reply);
        if (raw && typeof raw.journeys === 'object') {
          for (const journey of batch) {
            const index = journeys.indexOf(journey);
            const proposal = raw.journeys[journeyKey(journey, index)] ?? raw.journeys[String(index)] ?? raw.journeys[`J${index}`];
            if (proposal !== undefined) {
              proposals.journeys[`J${index}`] = proposal;
              got.push(journey);
            }
          }
        }
      } catch (error) {
        log?.(`researcher: journey names failed — ${String(error.message).split('\n')[0]}`);
      }
      const missing = batch.filter((journey) => !got.includes(journey));
      journeyEmptyInARow = got.length ? 0 : journeyEmptyInARow + 1;
      if (missing.length && missing.length < batch.length) {
        journeyQueue.unshift(missing);
        log?.(`researcher: ${got.length} of ${batch.length} journey name(s) came back; asking again for ${missing.length}`);
      } else if (missing.length && batch.length > 1) {
        const half = Math.ceil(batch.length / 2);
        journeyQueue.unshift(batch.slice(0, half), batch.slice(half));
        log?.(`researcher: retrying those ${batch.length} journey name(s) as two smaller calls`);
      }
      // One journey, refused after already being halved down to it: it keeps the name read off the screen.
    }

    // A name that says nothing ("Opening a page") is often the machine guess
    // handed back. Those journeys are asked once more, on their own, told why.
    const nameOf = (journey) => {
      const proposal = proposals.journeys[`J${journeys.indexOf(journey)}`];
      return typeof proposal === 'string' ? proposal : proposal?.name ?? journey.name;
    };
    const vague = journeys.filter((journey) => !journey.section && VAGUE_NAME.test(String(nameOf(journey)).trim()));
    if (vague.length) {
      calls++;
      log?.(`researcher: ${vague.length} journey name(s) came back vague; asking once more for those`);
      try {
        const tree = describeJourneys(vague, graph, journeys);
        const note = [
          'These journeys were given names that could fit any flow — "Opening a page", "Editing settings", "Opening a chat", "Viewing a chat". Give each a specific name: the action its steps show, on the very thing used, in the words on its pages.',
          'Read what each step adds: a confirmation ("Delete …?", "Remove …?") means the task is deleting or removing it ("Deleting a chat"); a browser or system prompt asking for the microphone, camera or location is allowing that access ("Allowing microphone access"); a menu of files, connectors or tools is adding them ("Adding files to a message"); a form being filled is what it saves ("Renaming a chat", "Editing a message"); a list of settings toggled is that setting ("Managing cookie settings").',
          'Never a bare "settings", "chat", "page" or "menu", and never "Viewing", "Opening" or "Accessing" when a step shows something being done.\n\n',
        ].join(' ');
        const reply = await complete({ system: `${BRIEF}\n${JOURNEY_RULES}`, blocks: [{ type: 'text', text: `${header}${note}${tree}` }], maxTokens: 800, temperature: 0, ...(journeyModel ? { model: journeyModel } : {}) });
        debug(reply);
        const raw = parse(reply);
        for (const journey of vague) {
          const index = journeys.indexOf(journey);
          const proposal = raw?.journeys?.[`J${index}`] ?? raw?.journeys?.[String(index)];
          const name = typeof proposal === 'string' ? proposal : proposal?.name;
          if (name && !VAGUE_NAME.test(String(name).trim())) proposals.journeys[`J${index}`] = proposal;
        }
      } catch (error) {
        log?.(`researcher: asking again for vague names failed — ${String(error.message).split('\n')[0]}`);
      }
      // Still vague after asking twice: named from what the screens show.
      for (const journey of vague) {
        const index = journeys.indexOf(journey);
        if (!VAGUE_NAME.test(String(nameOf(journey)).trim())) continue;
        const cued = nameFromCues(journey, graph);
        if (cued) {
          proposals.journeys[`J${index}`] = cued;
          log?.(`researcher: “${journey.name}” named “${cued}” from what its screens show`);
        }
      }
    }
  }

  // ── Pass two: screens, a batch at a time ─────────────────────────────────
  const queue = [];
  if (only !== 'journeys') for (let i = 0; i < nodes.length; i += batchSize) queue.push(nodes.slice(i, i + batchSize));
  const planned = queue.length;
  let doneScreens = 0;
  let screenCalls = 0;

  // A model that answers nothing three times running is not going to start;
  // the names read off the screens stand, and the run finishes instead of
  // asking a smaller question every twenty seconds for ten minutes.
  let emptyInARow = 0;
  /** Batches already asked a second time after being cut off at the limit. */
  const widened = new WeakSet();
  while (queue.length) {
    if (emptyInARow >= 3) {
      log?.(`researcher: the model returned nothing ${emptyInARow} times running — keeping the names read off the screens for the ${queue.reduce((n, b) => n + b.length, 0)} left`);
      doneScreens = nodes.length;
      break;
    }
    const batch = queue.shift();
    const total = Math.max(planned, screenCalls + queue.length + 1);
    screenCalls++;
    calls++;
    const focus = batch.map((node) => node.id);
    const blocks = [];
    if (vision) {
      for (const node of batch) {
        try {
          blocks.push({ type: 'image', base64: await encodeImage(node.screenshot) });
        } catch {
          // A frame that cannot be read is described by its text alone.
        }
      }
    }
    const scope = `${vision ? `The images attached are, in order, the screens listed below. ` : ''}Write "screens" entries for exactly these ids and no others: ${focus.join(', ')}.\n\n`;
    blocks.push({ type: 'text', text: `${header}${scope}${describeScreens(batch, journeys, graph, { withImages: vision })}` });

    log?.(`researcher: batch ${screenCalls}/${total} — ${batch.length} screen(s)${vision ? ' with images' : ' from text'}`);
    onBatch?.(doneScreens, nodes.length, batch.length, 'screens');
    let raw = null;
    try {
      // A few names, purposes and actions run to a few hundred tokens; the
      // budget leaves room for a model that thinks before it answers.
      const reply = await complete({ system: `${BRIEF}\n${SCREEN_RULES}`, blocks, maxTokens: SCREEN_TOKENS });
      debug(reply);
      raw = parse(reply);
    } catch (error) {
      log?.(`researcher: batch ${screenCalls} failed — ${String(error.message).split('\n')[0]}`);
      // Cut off at the limit: the model got stuck repeating itself, which
      // rarely happens twice running — the same screens are asked once more
      // before they are split into smaller calls.
      if (error?.cutOff && !widened.has(batch)) {
        widened.add(batch);
        queue.unshift(batch);
        log?.(`researcher: asking again for those ${batch.length} screen(s)`);
        continue;
      }
      raw = null;
    }
    const got = [];
    if (raw && typeof raw.screens === 'object') {
      for (const id of focus) {
        if (raw.screens[id] && typeof raw.screens[id] === 'object') {
          proposals.screens[id] = raw.screens[id];
          got.push(id);
        }
      }
    }
    const missing = batch.filter((node) => !got.includes(node.id));
    doneScreens += got.length;
    emptyInARow = got.length ? 0 : emptyInARow + 1;
    if (missing.length && missing.length < batch.length) {
      // The reply covered some of the six: only the rest go again.
      queue.unshift(missing);
      log?.(`researcher: ${got.length} of ${batch.length} came back; asking again for ${missing.length}`);
    } else if (missing.length && batch.length > 1) {
      const half = Math.ceil(batch.length / 2);
      queue.unshift(batch.slice(0, half), batch.slice(half));
      log?.(`researcher: retrying those ${batch.length} screen(s) as two smaller calls`);
    } else if (missing.length) {
      // One screen, twice refused: it keeps the name read off the screen.
      doneScreens += missing.length;
    }
  }
  onBatch?.(nodes.length, nodes.length, 0, 'done');

  const applied = applyProposals(journeys, graph, proposals, { appName: app?.name ?? null });
  // The self-review: a type that does not fit its screen's own name or the
  // parts on it gets a second look at the screenshot before anything is kept.
  if (vision && only !== 'journeys') {
    const audit = await auditTypes(nodes, { complete, encodeImage, extractJson, log }).catch((error) => {
      log?.(`researcher: could not double-check the types — ${String(error.message).split('\n')[0]}`);
      return { checked: 0, changed: 0, calls: 0 };
    });
    calls += audit.calls;
    applied.typesRechecked = audit.checked;
    applied.typesFixed = audit.changed;
    harmonizeTypes(graph);
  }
  for (const id of Object.keys(proposals.screens)) {
    const node = graph.get(id);
    if (node && node.analysis.viaHeuristics === false) node.analysis.analyzer = analyzer;
  }
  return { ...applied, batches: calls };
}

/**
 * Why a screen's type deserves a second look, or null: it disagrees with
 * what the screen's own name says, or the parts that type always has are not
 * on the screen (a "search" screen with no search bar).
 */
function doubtAbout(node) {
  const analysis = node.analysis ?? {};
  const type = analysis.modelType;
  if (!type) return null;
  const name = String(analysis.name ?? '');
  const elements = analysis.modelElements ?? analysis.elements ?? [];
  const named = typeFromName(name);
  // A weak word in a name ("details", "page", "entry") says less than the picture.
  if (named && named !== type && !['detail', 'form', 'home', 'onboarding'].includes(named)) return { why: `its name "${name}" suggests ${named}`, also: named };
  if (type === 'search' && !elements.includes('search-bar') && !/search|filter|sort|result|find/i.test(name)) return { why: 'no search bar is on it and its name is not about searching', also: null };
  if (type === 'pricing' && !elements.includes('price') && !/plan|pric|subscri|upgrade|premium|trial|pay|offer/i.test(name)) return { why: 'no prices are on it and its name is not about plans', also: null };
  if (type === 'login' && !/sign|log ?in|password|verif|code|otp|email|account/i.test(name)) return { why: 'its name is not about signing in', also: null };
  if (type === 'messages' && !/chat|message|conversation|thread|inbox|reply|comment|assistant|ai\b/i.test(name) && !elements.includes('text-field')) return { why: 'no message field is on it and its name is not about a conversation', also: null };
  return null;
}

/**
 * The second look: screens whose type is in doubt, three at a time with
 * their pictures, each with the type it was given and why it is in doubt.
 * The model's answer stands; a type outside the list is ignored.
 */
async function auditTypes(nodes, { complete, encodeImage, extractJson, log }) {
  const doubtful = nodes.map((node) => ({ node, doubt: doubtAbout(node) })).filter((entry) => entry.doubt);
  let changed = 0;
  let calls = 0;
  for (let at = 0; at < doubtful.length; at += 3) {
    const batch = doubtful.slice(at, at + 3);
    const blocks = [];
    for (const { node } of batch) {
      try {
        blocks.push({ type: 'image', base64: await encodeImage(node.screenshot) });
      } catch {
        // Judged from its name alone.
      }
    }
    const lines = batch.map(({ node, doubt }) => `${node.id}: "${node.analysis.name}" was filed as ${node.analysis.modelType}${doubt.also ? ` (or ${doubt.also}?)` : ''} — ${doubt.why}`);
    blocks.push({ type: 'text', text: `The images attached are, in order, these screens:\n${lines.join('\n')}` });
    calls += 1;
    let reply;
    try {
      reply = extractJson(await complete({ system: AUDIT_RULES, blocks, maxTokens: 300, json: true, temperature: 0 }));
    } catch {
      continue;
    }
    for (const { node } of batch) {
      const type = String(reply?.types?.[node.id] ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
      // "Other" gives up; the type it had stands then.
      if (!type || type === 'other' || !Object.hasOwn(SCREEN_TYPE_MEANINGS, type) || type === node.analysis.modelType) continue;
      log?.(`researcher: "${node.analysis.name}" is ${type}, not ${node.analysis.modelType}`);
      node.analysis.modelType = type;
      changed += 1;
    }
  }
  if (doubtful.length) log?.(`researcher: ${doubtful.length} type(s) double-checked, ${changed} corrected`);
  return { checked: doubtful.length, changed, calls };
}

const AUDIT_RULES = `You double-check how screens of an app are filed in a design-reference library like Mobbin. For each screen you get its picture, its name, the type it was filed as and why that type is in doubt. Look at the picture and give the type that says what the screen is, from this list only — choose the closest one; every screen fits one of them: ${Object.entries(SCREEN_TYPE_MEANINGS)
  .filter(([type]) => type !== 'other')
  .map(([type, meaning]) => `"${type}" (${meaning})`)
  .join('; ')}. Keep the type it was given when it is right.

Return JSON only, no prose, no markdown fence:
{ "types": { "<screen id>": "<type>" } }`;

/** One name, one type (see applyProposals). */
function harmonizeTypes(graph) {
  // One name, one type: "AI chat input" twice is the same kind of screen,
  // whatever each picture was judged as alone — the type most of them got,
  // or on a tie the one the name itself says.
  const byName = new Map();
  for (const node of graph.nodes?.values?.() ?? []) {
    const key = String(node.analysis?.name ?? '').trim().toLowerCase();
    if (!key || !node.analysis?.modelType) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(node);
  }
  for (const [key, nodes] of byName) {
    if (nodes.length < 2) continue;
    const votes = new Map();
    for (const node of nodes) votes.set(node.analysis.modelType, (votes.get(node.analysis.modelType) ?? 0) + 1);
    const ranked = [...votes].sort((a, b) => b[1] - a[1]);
    const tied = ranked.filter(([, count]) => count === ranked[0][1]).map(([type]) => type);
    const named = typeFromName(key);
    const type = tied.length > 1 && tied.includes(named) ? named : ranked[0][0];
    for (const node of nodes) node.analysis.modelType = type;
  }

}

const clean = (value, max) => {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return text && text.length <= max ? text : text ? text.slice(0, max).trim() : '';
};

/**
 * Writes accepted proposals onto the journeys and nodes. Exported for the
 * self-test, which feeds it a hand-made reply.
 */
/**
 * The example names the prompts give. A small model sometimes hands one back
 * verbatim for an app it has nothing to do with ("Searching dishes &
 * restaurants" for a chat app), so an example is only taken when the
 * journey's own screens show its words.
 */
const EXAMPLE_NAMES = new Set(
  [...`${JOURNEY_RULES}\n${SHARED_RULES}`.matchAll(/[“"]([A-Z][^“”"]{2,40})[”"]/g)].map((match) => match[1].trim().toLowerCase()),
);

/** Whether the words of a name (beyond its verb and small words) appear on the journey's screens. */
function shownOnScreens(name, journey, graph, screenProposals = {}) {
  const text = journey.nodeIds
    .map((id) => {
      const analysis = graph.get(id)?.analysis ?? {};
      const proposed = screenProposals[id] ?? {};
      return `${analysis.name ?? ''} ${(analysis.lines ?? []).map((line) => line.text).join(' ')} ${analysis.description ?? ''} ${proposed.name ?? ''} ${proposed.purpose ?? ''} ${proposed.description ?? ''}`;
    })
    .join(' ')
    .toLowerCase();
  const words = name.toLowerCase().split(/[^a-z]+/).filter((word) => word.length > 3 && !/ing$/.test(word));
  return words.length > 0 && words.some((word) => text.includes(word.replace(/e?s$/, '')));
}

/**
 * A flow is one task, so its name is too: "Adding to a project and accessing
 * support" is two names glued together, and the first is the flow's. A name
 * whose first half is a lone verb ("Searching and configuring connectors")
 * shares its object and stays whole.
 */
/** "Chatting" or "Editing a document" for a journey mostly made of one sidebar entry opened; null otherwise. */
function openedEntry(journey, graph) {
  // Only a browsing journey of ordinary pages: a paywall or a sign-in shown
  // over a chat still carries the chat's title, and is not the chat.
  if (journey.category && journey.category !== 'discovery') return null;
  const ordinary = new Set(['other', 'detail', 'feed', 'home', 'category', 'messages']);
  const entries = journey.nodeIds.map((id) => graph.get(id)?.analysis).filter((analysis) => analysis?.signals?.listedInSidebar && ordinary.has(analysis.screenType));
  if (entries.length < Math.max(2, journey.nodeIds.length * 0.6)) return null;
  const title = String(entries[0].signals.title ?? '').toLowerCase();
  if (/presentation|slides?|deck/.test(title)) return 'Editing a presentation';
  if (/design/.test(title)) return 'Editing a design';
  if (/document|doc\b|untitled/.test(title)) return 'Editing a document';
  // What was done in the chat, when its screens show it, before a bare "Chatting".
  return nameFromCues(journey, graph) ?? 'Chatting';
}

export function oneTask(name) {
  const match = /^(.+?)\s+(?:and|&|then)\s+([a-z]+ing\b.*)$/i.exec(String(name || ''));
  if (!match || match[1].trim().split(/\s+/).length < 2) return name;
  return match[1].trim();
}

export function applyProposals(journeys, graph, proposals, context = {}) {
  let journeysRenamed = 0;
  let screensUpdated = 0;

  const nameOfKey = new Map(journeys.map((journey) => [journey.key ?? journey.name, journey.name]));
  const sectionNames = new Set(journeys.filter((journey) => journey.section && !journey.parent).map((journey) => journey.name.toLowerCase()));
  // Words that belong to the app and keep their capitals in a name.
  const properNouns = new Set();
  for (const journey of journeys) {
    for (const nodeId of journey.nodeIds) {
      const signals = graph.get(nodeId)?.analysis?.signals ?? {};
      for (const label of [...(signals.tabLabels ?? []), ...(signals.chipLabels ?? [])]) properNouns.add(String(label).toLowerCase());
    }
  }
  const appName = String(context.appName ?? '').trim();
  if (appName) properNouns.add(appName.toLowerCase());

  journeys.forEach((journey, index) => {
    const entries = proposals.journeys ?? {};
    let proposal = entries[journeyKey(journey, index)] ?? entries[String(index)] ?? entries[`J${index}`] ?? findByLooseKey(entries, index, journey.name);
    // The flat shape: the value is the name itself.
    if (typeof proposal === 'string') proposal = { name: proposal };
    if (!proposal || typeof proposal !== 'object') return;

    const parentName = journey.parent ? nameOfKey.get(journey.parent) ?? null : null;
    let name = clean(proposal.name, 60);
    // "Onboarding - Phone number entry" is the parent's name glued on; the
    // journey is the part after it.
    if (name && parentName) name = name.replace(new RegExp(`^${escapeRegExp(parentName)}\\s*[-–—:›>]\\s*`, 'i'), '').trim();
    // "Instamart product search" inside Instamart says Instamart twice; the
    // section is already the heading above it.
    if (name && parentName) {
      const bare = name.replace(new RegExp(`^${escapeRegExp(parentName)}\\s+`, 'i'), '').trim();
      if (bare !== name && bare.split(' ').length >= 2) name = bare.charAt(0).toUpperCase() + bare.slice(1);
    }
    name = sentenceCase(name, properNouns);
    name = fixReadErrors(name, appName);
    name = oneTask(name);
    // A section keeps its tab name and onboarding its own; the model names
    // the journeys inside them.
    // That holds for every top-level section ("Settings", "Projects"), not only
    // browsing ones; a task promoted to the top ("Subscribing") is still a task
    // and takes its name.
    // A tab name read wrong ("Ch") is not one to keep.
    const isSectionName = journey.section && ((!journey.parent && !journey.promoted) || journey.category === 'discovery') && !brokenSectionName(journey.name);
    // A journey named after the section it sits in, or after another
    // section, is the model losing its place; that name is refused.
    const echoesAPlace =
      Boolean(journey.parent) &&
      (name.toLowerCase() === (parentName ?? '').toLowerCase() || sectionNames.has(name.toLowerCase()) || /^onboarding$/i.test(name));
    const copiedExample = Boolean(name) && EXAMPLE_NAMES.has(name.toLowerCase()) && !shownOnScreens(name, journey, graph, proposals.screens ?? {});
    // A journey that is mostly one chat or document opened from the sidebar
    // is about using it, whatever words appear inside it.
    const opened = openedEntry(journey, graph);
    const entryWord = String(journey.nodeIds.map((id) => graph.get(id)?.analysis?.signals).find((signals) => signals?.listedInSidebar)?.title ?? '').toLowerCase();
    const aboutTitle = entryWord.length >= 4 && name.toLowerCase().includes(entryWord);
    // Only a name built on the chat's own title ("Reporting a greeting issue")
    // is replaced; a task done in the chat ("Giving negative feedback") stays.
    if (name && opened && aboutTitle && /^[a-z]+ing\b/i.test(name) && name.toLowerCase().replace(/^[a-z]+ing\s+(a |an |the )?/, '').startsWith(entryWord)) name = opened;
    // A chat's own title is not a feature: "Opening Greeting options" is
    // "Opening chat options".
    else if (name && aboutTitle && !/(document|presentation|design|untitled)/i.test(entryWord) && !name.toLowerCase().startsWith(entryWord)) {
      name = name.replace(new RegExp(`\\b${escapeRegExp(entryWord)}\\b`, 'i'), 'chat').replace(/\bchat chat\b/i, 'chat');
    }
    if (name && !echoesAPlace && !copiedExample && name.split(' ').length <= 7 && !isSectionName && !/^onboarding$/i.test(journey.name)) {
      if (name.toLowerCase() !== journey.name.toLowerCase()) journeysRenamed++;
      journey.name = name;
    }

    // A summary has to be about this journey: it must share a real word with
    // the journey's own name, section or screens. A small model that mixes
    // journeys up would otherwise file the Instamart summary under Dineout.
    const summary = clean(proposal.summary, 240);
    if (summary && summaryFits(summary, journey, graph, nameOfKey)) journey.summary = summary;
  });

  for (const [id, proposal] of Object.entries(proposals.screens ?? {})) {
    const node = graph.get(id);
    if (!node || !proposal || typeof proposal !== 'object') continue;
    const analysis = node.analysis;
    let changed = false;
    const name = clean(proposal.name, 48);
    if (name && !/^(screen|image|screenshot|untitled)$/i.test(name)) {
      analysis.name = name;
      changed = true;
    }
    const description = clean(proposal.description, 320);
    if (description) {
      analysis.description = description;
      changed = true;
    }
    const purpose = clean(proposal.purpose, 200);
    if (purpose) {
      analysis.purpose = purpose;
      changed = true;
    }
    const primaryAction = clean(proposal.primaryAction, 60);
    analysis.primaryAction = primaryAction || null;
    // The model saw the screenshot; its type stands over the rules' guess.
    const type = String(proposal.type ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (type && type !== 'other' && Object.hasOwn(SCREEN_TYPE_MEANINGS, type)) {
      analysis.modelType = type;
      changed = true;
    }
    // And the UI parts it saw, from the library's list only.
    const elements = [...new Set((Array.isArray(proposal.elements) ? proposal.elements : []).map((element) => String(element).trim().toLowerCase().replace(/[\s_]+/g, '-')).filter((element) => ELEMENTS.includes(element)))].slice(0, 6);
    if (elements.length) {
      analysis.modelElements = elements;
      changed = true;
    }
    if (changed) {
      analysis.viaHeuristics = false;
      screensUpdated++;
    }
  }

  harmonizeTypes(graph);

  return { journeysRenamed, screensUpdated };
}

const STOP = new Set(['the', 'user', 'users', 'app', 'screen', 'screens', 'and', 'for', 'with', 'their', 'this', 'that', 'from', 'into', 'through', 'section', 'home', 'main', 'page', 'view', 'sees', 'goes', 'then', 'they', 'browse', 'browses', 'navigates', 'explores', 'available', 'various']);

function words(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));
}

/** Whether a summary talks about this journey rather than a neighbour. */
function summaryFits(summary, journey, graph, nameOfKey) {
  const own = new Set();
  for (const w of words(journey.name)) own.add(w);
  if (journey.parent) for (const w of words(nameOfKey.get(journey.parent))) own.add(w);
  for (const nodeId of journey.nodeIds) {
    const analysis = graph.get(nodeId)?.analysis ?? {};
    for (const w of words(analysis.name)) own.add(w);
    for (const label of analysis.signals?.tabLabels ?? []) for (const w of words(label)) own.add(w);
    for (const line of (analysis.lines ?? []).slice(0, 12)) for (const w of words(line.text)) own.add(w);
  }
  const mentioned = words(summary);
  return mentioned.some((w) => own.has(w) || [...own].some((o) => o.startsWith(w) || w.startsWith(o)));
}

/** A journey entry the model keyed slightly differently: by name, or "J<n>: name". */
function findByLooseKey(entries, index, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(entries)) {
    const k = key.toLowerCase().replace(/^j\d+\s*[:\-]?\s*/, '').trim();
    if (k === wanted || key.toLowerCase() === `j${index}`) return value;
  }
  return null;
}

/** "Phone Number Entry" → "Phone number entry", keeping the app's own names capitalised. */
/**
 * What reading a screen gets wrong in a name: "AI" read as "al" ("Using
 * notion al"), and the app's own name lower-cased ("notion").
 */
export function fixReadErrors(name, appName = '') {
  if (!name) return name;
  let fixed = String(name).replace(/(\S) [aA]l\b/g, '$1 AI');
  if (appName && /^[A-Za-z][A-Za-z0-9 ]+$/.test(appName)) fixed = fixed.replace(new RegExp(`\\b${appName}\\b`, 'gi'), appName);
  return fixed;
}

function sentenceCase(name, properNouns) {
  if (!name) return name;
  const parts = name.split(' ');
  const titleCased = parts.length > 1 && parts.every((w) => /^[A-Z]/.test(w) || /^[&(-]/.test(w));
  if (!titleCased) return name;
  return parts
    .map((w, i) => {
      if (i === 0) return w;
      if (properNouns.has(w.toLowerCase().replace(/[()]/g, ''))) return w;
      if (/^[A-Z]{2,}$/.test(w)) return w;
      return w.toLowerCase();
    })
    .join(' ');
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
