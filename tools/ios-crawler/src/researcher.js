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

/** The brief, as written for the researcher. Sent verbatim as the system prompt. */
export const BRIEF = `Analyze the uploaded app screenshots as a UX/UI researcher and product designer.
Do not simply extract or copy the visible text from the screenshots.
Instead, understand the UI, screen purpose, available actions, navigation patterns, visual hierarchy, and relationships between screens and generate a realistic user-flow structure similar to Mobbin.
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

/** What both passes share: the grouping is fixed, the words are the job. */
const SHARED_RULES = `
You are given journeys already grouped from a real recording of one app, in the order they were walked, with the screens in each. That grouping is fixed: keep every journey and every screen id exactly as given, and do not add, merge, split or reorder them. Return JSON only — no prose, no markdown fence. Use keys and ids exactly as written in the input.

The names given in the input are machine guesses read off the screens' text and are often wrong — a dish, a brand, a banner, a fragment. Never repeat such a name. Always write your own name from what the screen is for and what the person does there. A product, dish, restaurant or brand name is never a journey name; a journey about one is "Restaurant detail", "Product detail" or the task done there. Only say what the screenshots and their text support; where you cannot tell, name a screen by its role (for example "Category listing", "Item detail") and do not guess.`;

/** Pass one: the journey names, from the whole tree, no images. */
const JOURNEY_RULES = `${SHARED_RULES}

Return exactly this shape — a flat map from each journey key given (J0, J1, …) to its new name, one line per journey, and nothing else:
{ "journeys": { "J0": "Onboarding", "J1": "Food", "J2": "Searching dishes & restaurants", "J3": "Adding a dish to cart" } }
Do not repeat the steps or the machine guesses from the input; the guess is there only to show which journey is meant, and it is usually wrong. Do not add keys that were not given. Every value is a name of two to six words.

Journey names read like Mobbin's: the task in the person's own terms, starting with a verb ending in -ing whenever the person is doing something — "Searching dishes & restaurants", "Adding a dish to cart", "Turning on veg mode filter", "Booking a table", "Subscribing to Swiggy One", "Editing profile". A journey that opens a feature is named for the feature as the app names it — "Offer Zone", "Eatlist", "Restaurant detail". A journey inside a section is never named after the section it is in: a journey inside "Food" is the task done there, not "Food". A top-level section keeps its tab name — "Food", "Instamart", "Profile" — and "Onboarding" stays "Onboarding".`;

/** Pass two: the screens of one batch, with their images. */
const SCREEN_RULES = `${SHARED_RULES}

Return exactly this shape, one entry per screen id given, and nothing else:
{ "screens": { "<screen id exactly as given, e.g. s004>": { "name": "...", "purpose": "...", "primaryAction": "..." } } }

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
export function describeTree(journeys, graph, options = {}) {
  const maxLines = options.maxLines ?? 30;
  const focus = options.focus ? new Set(options.focus) : null;
  const screenIds = [];
  const lines = [];
  const nameOfKey = new Map(journeys.map((journey) => [journey.key ?? journey.name, journey.name]));

  journeys.forEach((journey, index) => {
    const parent = journey.parent ? nameOfKey.get(journey.parent) ?? journey.parent : null;
    lines.push(`Journey key "${journeyKey(journey, index)}"${parent ? ` — inside "${parent}"` : journey.section ? ' — top-level section' : ' — top level'}`);
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
 */
export function describeJourneys(journeys, graph) {
  const nameOfKey = new Map(journeys.map((journey) => [journey.key ?? journey.name, journey.name]));
  const lines = [];
  journeys.forEach((journey, index) => {
    const parent = journey.parent ? nameOfKey.get(journey.parent) ?? journey.parent : null;
    const steps = (journey.steps ?? journey.nodeIds.map((nodeId) => ({ nodeId, action: null })))
      .map((step) => {
        const node = graph.get(step.nodeId);
        if (!node) return null;
        const analysis = node.analysis ?? {};
        const tap = step.action?.kind === 'tap' && step.action.label ? ` (after tapping "${step.action.label}")` : step.action?.kind === 'type' && step.action.label ? ` (after typing "${step.action.label}")` : '';
        return `${analysis.name}${analysis.screenType && analysis.screenType !== 'other' ? ` [${analysis.screenType}]` : ''}${tap}`;
      })
      .filter(Boolean);
    // Bare keys on purpose: a key that carried the guessed name came back as
    // the answer, word for word. The guess is given separately, as a guess.
    lines.push(`J${index} — ${parent ? `inside "${parent}"` : 'top-level section'} — machine guess "${journey.name}" — steps: ${steps.join(' → ')}`);
  });
  return lines.join('\n');
}

function screenText(analysis, maxLines) {
  return (analysis.lines ?? [])
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
  const { complete, encodeImage, app, vision = true, batchSize = 6, extractJson, log, analyzer = 'ai', onBatch, only = null, journeyModel = null } = options;
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

  // ── Pass one: journey names ────────────────────────────────────────────────
  if (only !== 'screens') {
    log?.(`researcher: naming ${journeys.length} journey(s) from the tree${journeyModel ? ` with ${journeyModel}` : ''}`);
    onBatch?.(0, nodes.length, 0, 'journeys');
    try {
      calls++;
      const tree = describeJourneys(journeys, graph);
      const reply = await complete({ system: `${BRIEF}\n${JOURNEY_RULES}`, blocks: [{ type: 'text', text: `${header}${tree}` }], maxTokens: 1200, ...(journeyModel ? { model: journeyModel } : {}) });
      debug(reply);
      const raw = parse(reply);
      if (raw && typeof raw.journeys === 'object') Object.assign(proposals.journeys, raw.journeys);
    } catch (error) {
      log?.(`researcher: journey names failed — ${String(error.message).split('\n')[0]}; keeping the names read off the screens`);
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
      // Six names, purposes and actions run to a few hundred tokens; the
      // budget leaves room for a talkative model without inviting an essay.
      const reply = await complete({ system: `${BRIEF}\n${SCREEN_RULES}`, blocks, maxTokens: 1800 });
      debug(reply);
      raw = parse(reply);
    } catch (error) {
      log?.(`researcher: batch ${screenCalls} failed — ${String(error.message).split('\n')[0]}`);
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

  const applied = applyProposals(journeys, graph, proposals);
  for (const id of Object.keys(proposals.screens)) {
    const node = graph.get(id);
    if (node && node.analysis.viaHeuristics === false) node.analysis.analyzer = analyzer;
  }
  return { ...applied, batches: calls };
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
export function applyProposals(journeys, graph, proposals) {
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
    // A section keeps its tab name and onboarding its own; the model names
    // the journeys inside them.
    const isSectionName = journey.section && journey.category === 'discovery';
    // A journey named after the section it sits in, or after another
    // section, is the model losing its place; that name is refused.
    const echoesAPlace =
      Boolean(journey.parent) &&
      (name.toLowerCase() === (parentName ?? '').toLowerCase() || sectionNames.has(name.toLowerCase()) || /^onboarding$/i.test(name));
    if (name && !echoesAPlace && name.split(' ').length <= 7 && !isSectionName && !/^onboarding$/i.test(journey.name)) {
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
    if (changed) {
      analysis.viaHeuristics = false;
      screensUpdated++;
    }
  }

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
