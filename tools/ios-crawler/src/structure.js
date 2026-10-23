/**
 * The last word on the flow tree's shape, before anything is published.
 *
 * The walk says where the person went; it cannot always say where one task
 * ended and the next began. A journey left open across a detour ("change a
 * setting, then go home, then open a chat") reads as one flow, and a design
 * library would show it as three. So a model that has read the steps is asked
 * one narrow question per journey: at which steps does a different task
 * start? Each answer splits the journey there. Nothing else about the tree
 * changes: no screen moves to another section, none is dropped, none is added.
 *
 * Then, once every journey has its final name, siblings that ended up with
 * the same name are the same task walked more than once ("Opening a project
 * page" three times under Projects) and become one flow.
 */

import { pageLines } from './heuristics.js';
import { flowCategoryFor } from './taxonomy.js';

/** A journey needs at least this many screens before it is worth asking whether it holds two tasks. */
const REVIEW_MIN = 4;

/** A section (Chats, Settings) this long is checked too: what is done inside it splits off as its own flows. */
const SECTION_REVIEW_MIN = 6;

/** A task split off has at least this many screens; a smaller tail stays with the task before it. */
const PART_MIN = 2;

const REVIEW_SYSTEM = `You check flows for a design-reference library like Mobbin, where every flow is exactly one task a person does in an app ("Creating a project", "Connecting GitHub", "Changing the theme").

You get one flow: its steps in the order they were walked, each with its screen type, name and what is on it. Decide whether the steps are one task or several. A new task starts where the person stops doing one thing and starts another: they leave for an unrelated page, open a different feature, or begin a different goal. For example, changing a setting, then looking at subscription plans, then chatting are three tasks, and the plans start a new one even if they were opened from settings. A popup or panel over a page — cookie settings, a feedback form, a menu of tools — is a task of its own, not part of the page under it. Going back to the home page ends the task before it. Moving through the pages, dialogs and confirmations of the same goal is one task, and so is the same page shown again. When unsure, prefer splitting where the page title changes to an unrelated one.

A step that has nothing to do with any task in the flow — a stray screen of another feature caught on the way — is listed in "unrelated" instead, by its index.

Return JSON only, no prose, no markdown fence:
{ "tasks": [ { "start": 0, "name": "<task in 2-5 words, verb ending in -ing, about the feature or tab, never a table's column word>" } ], "unrelated": [] }
List one entry per task, in order. "start" is the index of the task's first step; the first task starts at 0. When the steps are one task, return one entry. "unrelated" is usually empty.`;

/** The words a screen shows on its page, without navigation chrome. */
function pageWords(node) {
  const analysis = node?.analysis ?? {};
  return pageLines(analysis.lines ?? [], analysis.signals?.layout)
    .map((line) => String(line.text || '').trim())
    .filter((text) => text.length >= 3 && /[a-z]{3}/i.test(text));
}

/**
 * Lines shown on most of a flow's steps — a chat's header and greeting, a
 * page's own title bar — tell the steps apart no better than the sidebar
 * does, and crowd out what each step adds (a feedback form, a menu).
 */
function sharedLines(nodes) {
  const counts = new Map();
  for (const node of nodes) for (const text of new Set(pageWords(node).map((t) => t.toLowerCase()))) counts.set(text, (counts.get(text) ?? 0) + 1);
  const most = Math.max(3, Math.ceil(nodes.length * 0.6));
  return new Set([...counts].filter(([, count]) => count >= most).map(([text]) => text));
}

function stepLine(node, index, shared = new Set()) {
  const analysis = node?.analysis ?? {};
  const signals = analysis.signals ?? {};
  // The page's own words only, and only those this step adds: the sidebar,
  // tab bar and anything on nearly every step would make every step look alike.
  const text = pageWords(node)
    .filter((text) => !shared.has(text.toLowerCase()))
    .slice(0, 10)
    .join(' · ');
  const page = signals.title || signals.headline || analysis.name || 'untitled';
  const overlay = node?.capture?.overlay ? ' (over the page before)' : '';
  const tab = signals.activeTab ?? signals.walkTab;
  const on = tab ? ` on its "${tab}" tab` : '';
  const entry = signals.listedInSidebar ? ' (an opened chat)' : '';
  return `${index}: page "${page}"${entry}${on}${overlay}, a ${String(analysis.screenType ?? 'screen').replace(/_/g, ' ')} screen | ${text.slice(0, 200)}`;
}

/**
 * The tasks the model found, as runs of step indexes. A task of one screen is
 * where the next one was opened from — a flow starts on the page it began
 * on — so it becomes that task's first screen; one at the very end joins the
 * task before it.
 * @returns {{nodes: number[], name: string|null}[]} one entry per task, in order
 */
export function taskParts(tasks, length) {
  const named = Array.isArray(tasks) ? tasks : [];
  const starts = [...new Map(
    named
      .map((task) => ({ start: Number(task?.start), name: typeof task?.name === 'string' ? task.name.trim().slice(0, 60) || null : null }))
      .filter((task) => Number.isInteger(task.start) && task.start >= 0 && task.start < length)
      .map((task) => [task.start, task]),
  ).values()].sort((a, b) => a.start - b.start);
  if (!starts.length || starts[0].start !== 0) starts.unshift({ start: 0, name: null });
  // A model that lists every step as a task repeats the name for steps of the
  // same one: consecutive starts with one name are one task.
  for (let at = starts.length - 1; at > 0; at--) {
    if (starts[at].name && starts[at - 1].name && starts[at].name.toLowerCase() === starts[at - 1].name.toLowerCase()) starts.splice(at, 1);
  }
  let parts = starts.map((task, at) => ({
    name: task.name,
    nodes: Array.from({ length: (starts[at + 1]?.start ?? length) - task.start }, (_, k) => task.start + k),
  }));
  const folded = [];
  let carry = [];
  for (const [at, part] of parts.entries()) {
    const nodes = [...carry, ...part.nodes];
    carry = [];
    if (nodes.length < PART_MIN && at < parts.length - 1) {
      carry = nodes;
      continue;
    }
    if (nodes.length < PART_MIN && folded.length) folded[folded.length - 1].nodes.push(...nodes);
    else folded.push({ name: part.name, nodes });
  }
  parts = folded;
  return parts;
}

/**
 * Splits journeys the model says hold more than one task. Journeys are
 * changed in place; new ones are inserted right after the journey they came
 * from, under the same parent.
 *
 * @param {object[]} journeys from buildJourneys
 * @param {{get: (id: string) => object}} graph
 * @param {{complete: Function, extractJson: Function, model?: string|null, actions?: Map, log?: Function, onProgress?: Function}} options
 * @returns {Promise<{reviewed: number, split: number}>}
 */
export async function reviewStructure(journeys, graph, options) {
  const { complete, extractJson, model = null, actions = new Map(), log = () => {}, onProgress = () => {} } = options;
  // A flow inside a section, and a long section itself: Chats is chatting,
  // giving feedback and a tool menu, each a flow of its own. Onboarding is
  // left alone: its tasks are found from the screens' types already.
  const candidates = journeys.filter((journey) =>
    journey.parent && !journey.section
      ? journey.nodeIds.length >= REVIEW_MIN
      : !journey.parent && !journey.promoted && journey.category !== 'onboarding' && journey.nodeIds.length >= SECTION_REVIEW_MIN,
  );
  const byKey = new Map(journeys.map((journey) => [journey.key, journey]));
  let reviewed = 0;
  let split = 0;
  for (const [index, journey] of candidates.entries()) {
    onProgress(index, candidates.length);
    const isSection = !journey.parent;
    const shared = sharedLines(journey.nodeIds.map((id) => graph.get(id)));
    const steps = journey.nodeIds.map((id, at) => stepLine(graph.get(id), at, shared)).join('\n');
    let reply;
    try {
      reply = await complete({
        system: REVIEW_SYSTEM,
        blocks: [{ type: 'text', text: `${isSection ? `Section "${journey.name}" — a whole area of the app, holding everything done in it, so it nearly always holds several tasks; list each one (sending a message, giving feedback, opening a menu, using voice input are different tasks)` : `Flow "${journey.name}"`}, ${journey.nodeIds.length} steps:\n${steps}` }],
        maxTokens: 500,
        json: true,
        temperature: 0,
        ...(model ? { model } : {}),
      });
    } catch (error) {
      log(`structure: could not review "${journey.name}" — ${String(error.message).split('\n')[0]}`);
      continue;
    }
    reviewed += 1;
    let parsed = null;
    try {
      parsed = extractJson(reply);
    } catch {
      continue;
    }

    // Screens that belong to no task here move up to the section the flow is
    // in: still in the library, no longer muddying this flow. A section keeps
    // all of its screens.
    let ids = journey.nodeIds;
    const parent = journey.parent ? byKey.get(journey.parent) : null;
    const unrelated = new Set(
      (Array.isArray(parsed?.unrelated) ? parsed.unrelated : [])
        .map(Number)
        .filter((at) => Number.isInteger(at) && at > 0 && at < ids.length),
    );
    if (parent && unrelated.size && unrelated.size <= ids.length - PART_MIN) {
      const moved = ids.filter((_, at) => unrelated.has(at));
      for (const id of moved) if (!parent.nodeIds.includes(id)) parent.nodeIds.push(id);
      parent.steps = stepsOf(parent.nodeIds, actions);
      // The task starts the model gave were counted over every step; drop the
      // moved ones and shift the rest back.
      const kept = ids.map((_, at) => at).filter((at) => !unrelated.has(at));
      const remap = new Map(kept.map((at, k) => [at, k]));
      parsed.tasks = (parsed.tasks ?? [])
        .map((task) => ({ ...task, start: remap.get(kept.find((at) => at >= Number(task?.start)) ?? -1) }))
        .filter((task) => task.start !== undefined);
      ids = ids.filter((_, at) => !unrelated.has(at));
      journey.nodeIds = ids;
      journey.steps = stepsOf(ids, actions);
      log(`structure: ${moved.length} screen(s) in "${journey.name}" belonged to no task there — moved up to "${parent.name}"`);
    }

    const parts = taskParts(parsed?.tasks, ids.length);
    if (parts.length < 2) continue;

    // A section keeps its name and the screen it opened on; every task in it,
    // the first one too, becomes a flow under it. A flow splits into
    // siblings, the first renamed.
    const own = isSection ? [] : [parts[0]];
    const flows = isSection ? parts : parts.slice(1);
    if (!isSection && parts[0].name) journey.name = parts[0].name;
    journey.nodeIds = isSection ? [ids[0]] : own[0].nodes.map((at) => ids[at]);
    const created = flows.map((part, at) => ({
      key: `${journey.key}-${at + 2}`,
      name: part.name || journey.name,
      category: isSection ? 'discovery' : journey.category,
      parent: isSection ? journey.key : journey.parent,
      section: false,
      nodeIds: part.nodes.map((k) => ids[k]),
    }));
    journeys.splice(journeys.indexOf(journey) + 1, 0, ...created);
    for (const part of [journey, ...created]) part.steps = stepsOf(part.nodeIds, actions);
    split += created.length;
    log(`structure: "${journey.name}" was ${isSection ? created.length : created.length + 1} tasks — ${isSection ? 'each is now a flow under it' : 'split'}`);
  }
  return { reviewed, split };
}

function stepsOf(nodeIds, actions) {
  return nodeIds.map((id, index) => ({ nodeId: id, action: index === 0 ? null : actions.get(`${nodeIds[index - 1]}->${id}`) ?? null }));
}

/**
 * A name with its place stripped off: "Opening a greeting page from
 * Projects", "Opening a greeting page (Projects)" and "Opening a greeting
 * page" are one task under Projects.
 */
function bareName(name, parentName) {
  let bare = String(name).toLowerCase().trim();
  if (parentName) {
    const place = parentName.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    bare = bare.replace(new RegExp(`\\s*\\(${place}\\)$`), '').replace(new RegExp(`\\s+(from|in|on|under|within)\\s+(the\\s+)?${place}$`), '');
  }
  // Coming back to something is looking at it again.
  bare = bare.replace(/^(returning to|going back to|reopening|revisiting)\s+/, 'viewing ');
  return bare.replace(/\s+/g, ' ').trim();
}

/** The screen type most of a journey's screens share, when at least half do (a flow also starts on the page it was opened from). */
function dominantType(journey, graph) {
  const counts = new Map();
  for (const id of journey.nodeIds) {
    const type = graph?.get(id)?.analysis?.screenType;
    if (type) counts.set(type, (counts.get(type) ?? 0) + 1);
  }
  // On a tie, an app-wide task outranks the pages it was opened from.
  const [type, count] = [...counts].sort((a, b) => b[1] - a[1] || Number(APP_WIDE_TYPES.has(b[0])) - Number(APP_WIDE_TYPES.has(a[0])))[0] ?? [];
  return type && count / journey.nodeIds.length >= 0.5 ? type : null;
}

/** Folds `from` into `into`: screens appended in order, children moved, `from` removed. */
function fold(journeys, into, from, actions) {
  for (const nodeId of from.nodeIds) if (!into.nodeIds.includes(nodeId)) into.nodeIds.push(nodeId);
  if (!into.summary && from.summary) into.summary = from.summary;
  for (const child of journeys) if (child.parent === from.key) child.parent = into.key;
  journeys.splice(journeys.indexOf(from), 1);
  into.steps = stepsOf(into.nodeIds, actions);
}

/** Task types a design library files once per app, wherever they were opened from. */
const APP_WIDE_TYPES = new Set(['paywall', 'checkout', 'payment', 'login', 'signup', 'otp']);

/**
 * One task, one flow:
 *  - siblings whose names are the same once their place is stripped off
 *    ("Opening a greeting page from Projects" beside "Opening a greeting
 *    page") are the same task walked again, and merge into the first;
 *  - a sub-flow that is mostly the screens of an app-wide task (a paywall, a
 *    checkout, a sign-in) that also stands at the top level is that task
 *    opened from somewhere else, and merges into it.
 * Children of a merged journey move to the one it merged into.
 * @returns {number} journeys merged away
 */
export function mergeSameNamedSiblings(journeys, actions = new Map(), graph = null) {
  const byKey = new Map(journeys.map((journey) => [journey.key, journey]));
  let merged = 0;

  const first = new Map();
  for (const journey of [...journeys]) {
    if (journey.section && !journey.parent) continue;
    const parentName = journey.parent ? byKey.get(journey.parent)?.name ?? null : null;
    const id = `${journey.parent ?? ''}\u0000${bareName(journey.name, parentName)}`;
    // "Exporting a presentation with content" beside "Exporting a
    // presentation" is the same task with more words.
    const bare = bareName(journey.name, parentName);
    const keep = first.get(id) ?? [...first].find(([other]) => {
      const [otherParent, otherBare] = other.split('\u0000');
      return otherParent === (journey.parent ?? '') && (bare.startsWith(`${otherBare} `) || otherBare.startsWith(`${bare} `));
    })?.[1];
    if (!keep) {
      first.set(id, journey);
      continue;
    }
    fold(journeys, keep, journey, actions);
    merged += 1;
  }

  if (graph) {
    const topByType = new Map();
    for (const journey of journeys) {
      if (journey.parent) continue;
      const type = dominantType(journey, graph);
      // Only a top-level task ("Subscribing"), never a section such as
      // Onboarding, whose own sign-in is rightly its child.
      const isTask = journey.promoted || !journey.section;
      if (isTask && type && APP_WIDE_TYPES.has(type) && !topByType.has(type)) topByType.set(type, journey);
    }
    for (const journey of [...journeys]) {
      if (!journey.parent) continue;
      const type = dominantType(journey, graph);
      const top = type ? topByType.get(type) : null;
      if (!top || top === journey) continue;
      fold(journeys, top, journey, actions);
      merged += 1;
    }
  }
  // A flow holding its parent's screens says nothing the parent does
  // not ("Logging in with email" inside an Onboarding that is only that): it
  // goes, and anything under it moves up to the parent.
  for (const journey of [...journeys]) {
    const parent = journey.parent ? journeys.find((candidate) => candidate.key === journey.parent) : null;
    if (!parent) continue;
    // The same screens, or all but one of a longer parent's (a stray screen
    // moved up to it): still the parent again under another name.
    const inside = journey.nodeIds.every((id) => parent.nodeIds.includes(id));
    const same = inside && (journey.nodeIds.length === parent.nodeIds.length || (parent.nodeIds.length >= 6 && parent.nodeIds.length - journey.nodeIds.length <= 1));
    if (!same) continue;
    for (const child of journeys) if (child.parent === journey.key) child.parent = parent.key;
    journeys.splice(journeys.indexOf(journey), 1);
    merged += 1;
  }
  return merged;
}

/** What a flow's named task is, read off its name: the verb and what it is done to. */
const CATEGORY_BY_NAME = [
  { category: 'authentication', test: /^(signing (in|up|out)|logging (in|out)|verifying|creating an account|authenticating|resetting (a |your )?password)\b|\bwith (google|apple|email)\b/i },
  { category: 'checkout', test: /^(subscribing|upgrading|paying|checking out|buying|ordering|purchasing|selecting a (plan|subscription))\b|\b(plan|subscription|checkout|payment)s?\b/i },
  { category: 'search', test: /^search(ing)?\b/i },
  { category: 'settings', test: /\b(settings?|preferences|appearance|profile|notifications|permissions?|privacy|access|account)\b/i },
  { category: 'creation', test: /^(creating|adding|editing|writing|sending|uploading|composing|drafting|making|building|renaming)\b/i },
];

/**
 * Each flow's category, once its name is final. Onboarding is a place — the
 * app before it is used — so only the Onboarding section and what sits in it
 * keep it; a chat titled "Welcome" is not onboarding because its screen was
 * typed a welcome screen. Every other flow is filed by the task its name
 * says, then by the screens it is made of, then as browsing.
 * @returns {number} flows whose category changed
 */
export function settleCategories(journeys, graph) {
  const byKey = new Map(journeys.map((journey) => [journey.key, journey]));
  const inOnboarding = (journey) => {
    for (let cursor = journey, guard = 0; cursor && guard < 8; cursor = cursor.parent ? byKey.get(cursor.parent) : null, guard++) {
      if (!cursor.parent && (cursor.category === 'onboarding' || /^onboarding$/i.test(cursor.name))) return true;
    }
    return false;
  };
  let changed = 0;
  for (const journey of journeys) {
    let category = journey.category;
    if (!journey.parent) {
      // A section keeps what it is, unless it is wrongly an onboarding.
      if (category === 'onboarding' && !/^onboarding$/i.test(journey.name)) category = 'discovery';
    } else if (inOnboarding(journey)) {
      // Inside Onboarding: signing in stays authentication, the rest onboarding.
      category = CATEGORY_BY_NAME.find((rule) => rule.category === 'authentication' && rule.test.test(journey.name)) ? 'authentication' : category === 'authentication' ? category : 'onboarding';
    } else {
      const byName = CATEGORY_BY_NAME.find((rule) => rule.test.test(journey.name))?.category;
      const type = byName ? null : dominantType(journey, graph);
      const byScreens = type ? flowCategoryFor(type) : null;
      category = byName ?? (byScreens && byScreens !== 'onboarding' ? byScreens : 'discovery');
    }
    if (category !== journey.category) {
      journey.category = category;
      changed += 1;
    }
  }
  return changed;
}
