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
import { brokenSectionName, fixReadErrors } from './researcher.js';

/** A journey needs at least this many screens before it is worth asking whether it holds two tasks. */
const REVIEW_MIN = 4;

/** A section (Chats, Settings) this long is checked too: what is done inside it splits off as its own flows. */
const SECTION_REVIEW_MIN = 6;

/** A task split off has at least this many screens; a smaller tail stays with the task before it. */
const PART_MIN = 2;

/** A flow this long is asked a second time whether it is really one task. */
const OVERSIZED = 16;

/** An Onboarding this long, stored before onboarding was cut off where it ends, is asked where it really ends. */
const ONBOARDING_TAIL_MIN = 20;

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
        // A long section has many tasks to list; a short budget cuts the JSON off.
        maxTokens: Math.min(1500, 400 + journey.nodeIds.length * 15),
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
      log(`structure: the check of "${journey.name}" came back unreadable — left as it is`);
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

    let parts = taskParts(parsed?.tasks, ids.length);
    // A flow this long is almost never one task ("Customizing a page" of 47
    // steps was home, chats, meetings, inbox, accounts and plans). Asked once
    // more, with that said.
    if (parts.length < 2 && ids.length >= OVERSIZED) {
      try {
        const again = await complete({
          system: REVIEW_SYSTEM,
          blocks: [{ type: 'text', text: `${isSection ? `Section "${journey.name}"` : `Flow "${journey.name}"`}, ${ids.length} steps — far more than one task ever takes, so it holds several; list each one where the page changes to a different feature:\n${steps}` }],
          maxTokens: Math.min(1500, 400 + ids.length * 15),
          json: true,
          temperature: 0,
          ...(model ? { model } : {}),
        });
        parts = taskParts(extractJson(again)?.tasks, ids.length);
      } catch {
        // The first answer stands.
      }
    }
    if (parts.length < 2) {
      if (isSection && ids.length >= 20) log(`structure: "${journey.name}" (${ids.length} steps) read as one task — ${JSON.stringify(parsed?.tasks ?? null).slice(0, 200)}`);
      continue;
    }

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

const ONBOARDING_END_SYSTEM = `You read the steps of an app's "Onboarding" section, in the order they were walked, for a design-reference library like Mobbin. Onboarding is everything before the person starts using the app: splash, sign-in or sign-up, verification, welcome and tour pages, setup questions, plan offers shown before the app opens. Once they reach the app's own home page or start using a feature (searching, chatting, creating something), onboarding is over and the rest belongs elsewhere in the app.

Return JSON only, no prose, no markdown fence:
{ "end": <index of the first step that is no longer onboarding, or null when every step is onboarding>, "section": "<the app area those later steps are in, 1-2 words as the app's tab bar would say it, like Home or Search>" }`;

/**
 * Screens stored before onboarding was cut off where it ends: an
 * "Onboarding" section that runs on into the app itself (home, search, a
 * chat) is asked where it really ends, and everything after becomes a
 * section of its own, with the flows that sit wholly inside that part. The
 * new section is then checked like any other (reviewStructure splits it into
 * its tasks).
 * @returns {Promise<number>} sections created
 */
export async function splitOnboardingTail(journeys, graph, options) {
  const { complete, extractJson, model = null, actions = new Map(), log = () => {} } = options;
  let created = 0;
  for (const journey of [...journeys]) {
    if (journey.parent || !(journey.category === 'onboarding' || /^onboarding$/i.test(journey.name))) continue;
    if (journey.nodeIds.length < ONBOARDING_TAIL_MIN) continue;
    const ids = journey.nodeIds;
    const shared = sharedLines(ids.map((id) => graph.get(id)));
    const steps = ids.map((id, at) => stepLine(graph.get(id), at, shared)).join('\n');
    let parsed = null;
    try {
      const reply = await complete({
        system: ONBOARDING_END_SYSTEM,
        blocks: [{ type: 'text', text: `Section "${journey.name}", ${ids.length} steps:\n${steps}` }],
        maxTokens: 200,
        json: true,
        temperature: 0,
        ...(model ? { model } : {}),
      });
      parsed = extractJson(reply);
    } catch (error) {
      log(`structure: could not find where "${journey.name}" ends — ${String(error.message).split('\n')[0]}`);
      continue;
    }
    const end = Number(parsed?.end);
    // Onboarding keeps at least a few steps, and the part after it is worth a section.
    if (!Number.isInteger(end) || end < PART_MIN || ids.length - end < SECTION_REVIEW_MIN) continue;
    const tail = new Set(ids.slice(end));
    const name = String(parsed?.section ?? '').trim().replace(/^./, (c) => c.toUpperCase()) || 'Home';
    const wanted = name.split(/\s+/).length <= 3 ? name : 'Home';
    // The later steps join the section of that name when the tree has one;
    // a second "Home" beside the first says the same place twice.
    const existing = journeys.find((other) => !other.parent && other !== journey && other.name.toLowerCase() === wanted.toLowerCase());
    const section = existing ?? {
      key: `${journey.key}-app`,
      name: wanted,
      category: 'discovery',
      parent: null,
      section: true,
      nodeIds: [],
    };
    for (const id of ids.slice(end)) if (!section.nodeIds.includes(id)) section.nodeIds.push(id);
    section.steps = stepsOf(section.nodeIds, actions);
    journey.nodeIds = ids.slice(0, end);
    journey.steps = stepsOf(journey.nodeIds, actions);
    // A flow under Onboarding made of the later steps moves with them; one
    // that runs across the cut is cut too, its later part a flow of the new
    // section ("Entering personal information" ran on into the app's home).
    const crossing = [];
    for (const child of journeys) {
      if (child.parent !== journey.key || !child.nodeIds.length) continue;
      const after = child.nodeIds.filter((id) => tail.has(id));
      if (!after.length) continue;
      if (after.length === child.nodeIds.length || child.nodeIds.length - after.length < PART_MIN) {
        child.parent = section.key;
        continue;
      }
      if (after.length < PART_MIN) continue;
      child.nodeIds = child.nodeIds.filter((id) => !tail.has(id));
      child.steps = stepsOf(child.nodeIds, actions);
      const rest = { key: `${child.key}-app`, name: child.name, category: 'discovery', parent: section.key, section: false, nodeIds: after };
      rest.steps = stepsOf(after, actions);
      crossing.push(rest);
    }
    journeys.splice(journeys.indexOf(journey) + 1, 0, ...(existing ? [] : [section]), ...crossing);
    created += 1;
    log(`structure: "${journey.name}" ended at step ${end} — the ${section.nodeIds.length} steps after it are now "${section.name}"`);
  }
  return created;
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
  // "Copying a block link" and "Copying block link" are one task.
  bare = bare.replace(/\b(a|an|the|your)\s+/g, '');
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

const GROUP_SYSTEM = `You arrange one area of an app's flow tree for a design-reference library like Mobbin. Mobbin nests flows: an area ("Home") holds a few features, and each feature holds the smaller tasks done inside it, which can hold their own steps in turn. For a fitness app: "Home" › "Chatting with the coach" › "Uploading a PDF file", "Sending a voice message", "Giving feedback".

You get the flows directly inside one area, in walk order, each with an index, its name and its first screens. Find every feature that several of these flows are part of — talking to an assistant, taking meeting notes, searching and filtering, editing a page, managing members — and group its flows under it. Flows of one feature share what they are about (a chat, a meeting, a search, a page), even when their verbs differ. A flow that is a feature on its own stays out of every group. Never put one flow in two groups; a group has at least two flows. Name a feature in the app's own words, using the app's name only when the feature is named for it.

Return JSON only, no prose, no markdown fence:
{ "groups": [ { "name": "<feature in 2-5 words, a verb ending in -ing>", "flows": [<indexes>] } ] }
Return { "groups": [] } when nothing groups.`;

/** An area with at least this many flows directly inside it is asked to group them into features. */
const GROUP_MIN = 6;

/**
 * Mobbin's depth: an area's many small flows grouped under the features
 * they belong to ("Home" › "Chatting with Notion AI" › "Giving feedback").
 * Each group is a flow of its own, made of its flows' screens in walk order,
 * and those flows move inside it.
 * @returns {Promise<number>} groups made
 */
export async function groupIntoFeatures(journeys, graph, options) {
  const { complete, extractJson, model = null, actions = new Map(), log = () => {} } = options;
  let made = 0;
  for (const area of journeys.filter((journey) => !journey.parent)) {
    const inside = journeys.filter((journey) => journey.parent === area.key);
    if (inside.length < GROUP_MIN) continue;
    const lines = inside.map((flow, at) => {
      const firsts = flow.nodeIds
        .slice(0, 3)
        .map((id) => graph.get(id)?.analysis?.name)
        .filter(Boolean)
        .join(', ');
      return `${at}: "${flow.name}" — ${flow.nodeIds.length} screens: ${firsts}`;
    });
    let parsed = null;
    try {
      const reply = await complete({
        system: GROUP_SYSTEM,
        blocks: [{ type: 'text', text: `${options.appName ? `App: ${options.appName}\n` : ''}Area "${area.name}", ${inside.length} flows:\n${lines.join('\n')}` }],
        maxTokens: Math.min(1500, 300 + inside.length * 30),
        json: true,
        temperature: 0,
        ...(model ? { model } : {}),
      });
      parsed = extractJson(reply);
    } catch (error) {
      log(`structure: could not group the flows in "${area.name}" — ${String(error.message).split('\n')[0]}`);
      continue;
    }
    const used = new Set();
    const features = [];
    for (const [n, group] of (Array.isArray(parsed?.groups) ? parsed.groups : []).entries()) {
      const members = [...new Set((Array.isArray(group?.flows) ? group.flows : []).map(Number))]
        .filter((at) => Number.isInteger(at) && at >= 0 && at < inside.length && !used.has(at))
        .map((at) => inside[at]);
      const name = fixReadErrors(String(group?.name ?? '').trim().replace(/^./, (c) => c.toUpperCase()), options.appName ?? '');
      // Grouping every flow under one feature says nothing the area does not.
      if (members.length < 2 || members.length === inside.length || !name || name.split(/\s+/).length > 7) continue;
      // The prompt's own example, copied, is not this app's feature.
      if (/\bthe coach\b/i.test(name) && !lines.join(' ').toLowerCase().includes('coach')) continue;
      // A group named like one of its flows is that flow, with the rest inside it.
      const host = members.find((member) => member.name.toLowerCase() === name.toLowerCase());
      // Named like a flow elsewhere in the app, it would read as that flow twice.
      if (!host && journeys.some((journey) => journey.name.toLowerCase() === name.toLowerCase())) continue;
      for (const member of members) used.add(inside.indexOf(member));
      const feature = host ?? {
        key: `${area.key}-feature-${n + 1}`,
        name,
        category: members[0].category,
        parent: area.key,
        section: false,
        nodeIds: [],
      };
      for (const member of members) {
        if (member === host) continue;
        member.parent = feature.key;
        for (const id of member.nodeIds) if (!feature.nodeIds.includes(id)) feature.nodeIds.push(id);
      }
      feature.steps = stepsOf(feature.nodeIds, actions);
      if (!host) journeys.splice(journeys.indexOf(members[0]), 0, feature);
      made += 1;
      features.push(feature);
      log(`structure: ${members.length} flows in "${area.name}" are parts of "${feature.name}" — now inside it`);
    }

    // Two features about one thing are one feature before anything else is placed.
    if (mergeSameSubjectFeatures(journeys, actions)) {
      for (let k = features.length - 1; k >= 0; k--) if (!journeys.includes(features[k])) features.splice(k, 1);
      log(`structure: features about the same thing in "${area.name}" merged`);
    }
    // What was left out is offered to the features once more: "Sorting
    // search results" belongs with searching even when the first answer
    // missed it.
    const left = inside.filter((flow, at) => !used.has(at) && !features.includes(flow));
    if (!features.length || !left.length) continue;
    try {
      const reply = await complete({
        system: ASSIGN_SYSTEM,
        blocks: [
          {
            type: 'text',
            text: `Features:\n${features.map((feature, at) => `F${at}: "${feature.name}" — holds ${journeys.filter((flow) => flow.parent === feature.key).map((flow) => `"${flow.name}"`).join(', ')}`).join('\n')}\n\nFlows:\n${left.map((flow, at) => `${at}: "${flow.name}"`).join('\n')}`,
          },
        ],
        maxTokens: Math.min(1000, 200 + left.length * 25),
        json: true,
        temperature: 0,
        ...(model ? { model } : {}),
      });
      const answer = extractJson(reply);
      for (const entry of Array.isArray(answer?.assign) ? answer.assign : []) {
        const flow = left[Number(entry?.flow)];
        const feature = features[Number(String(entry?.feature ?? '').replace(/^F/i, ''))];
        if (!flow || !feature || flow === feature || flow.parent !== area.key) continue;
        flow.parent = feature.key;
        for (const id of flow.nodeIds) if (!feature.nodeIds.includes(id)) feature.nodeIds.push(id);
        feature.steps = stepsOf(feature.nodeIds, actions);
        log(`structure: "${flow.name}" is part of "${feature.name}" too — moved inside it`);
      }
    } catch (error) {
      log(`structure: could not place the rest of "${area.name}" — ${String(error.message).split('\n')[0]}`);
    }
    // Still left: a flow about the same thing as exactly one feature —
    // "Sorting search results" beside the flows of searching — goes inside it.
    for (let changed = true; changed; ) {
      changed = false;
      for (const flow of journeys.filter((entry) => entry.parent === area.key && !features.includes(entry))) {
        // The app's own name ("Notion") is in half the flows and says nothing
        // about which feature one belongs to; the word shared must name the
        // feature itself, not only something inside it.
        const appWords = subjectWords(options.appName ?? '');
        const own = new Set([...subjectWords(flow.name)].filter((word) => !appWords.has(word)));
        const matches = features
          .map((feature) => {
            const named = subjectWords(feature.name);
            const words = new Set([feature.name, ...journeys.filter((entry) => entry.parent === feature.key).map((entry) => entry.name)].flatMap((name) => [...subjectWords(name)]));
            const shared = [...own].filter((word) => words.has(word));
            return { feature, shared: shared.some((word) => named.has(word)) ? shared.length : 0 };
          })
          .filter((match) => match.shared > 0)
          .sort((a, b) => b.shared - a.shared);
        if (!matches.length || (matches[1] && matches[1].shared === matches[0].shared)) continue;
        const { feature } = matches[0];
        flow.parent = feature.key;
        for (const id of flow.nodeIds) if (!feature.nodeIds.includes(id)) feature.nodeIds.push(id);
        feature.steps = stepsOf(feature.nodeIds, actions);
        changed = true;
        log(`structure: "${flow.name}" is about the same thing as "${feature.name}" — moved inside it`);
      }
    }
  }
  return made;
}

/**
 * A small flow that is the same screens as a sibling's — "Chatting with
 * Claude" holding "Chat with voice input" and the microphone prompt beside
 * "Using voice input" — is that sibling walked on a step: it folds into it.
 * Permission prompts and loading states are the step on; they never make a
 * flow of their own.
 * @returns {number} flows folded
 */
export function foldSmallRepeats(journeys, graph, actions = new Map()) {
  const nameOf = (id) => String(graph?.get(id)?.analysis?.name ?? '').trim().toLowerCase();
  const typeOf = (id) => graph?.get(id)?.analysis?.modelType ?? graph?.get(id)?.analysis?.screenType;
  const along = new Set(['permission', 'loading']);
  let folded = 0;
  for (const small of [...journeys]) {
    if (!small.parent || small.nodeIds.length > 3 || journeys.some((child) => child.parent === small.key)) continue;
    const own = small.nodeIds.filter((id) => !along.has(typeOf(id))).map(nameOf).filter(Boolean);
    if (!journeys.includes(small)) continue;
    // Only a prompt or a loading state: the step on from the flow before it.
    if (!own.length) {
      const siblings = journeys.filter((other) => other.parent === small.parent);
      const before = siblings[siblings.indexOf(small) - 1];
      if (before && !journeys.some((child) => child.parent === before.key)) {
        fold(journeys, before, small, actions);
        folded += 1;
      }
      continue;
    }
    // The one walked on a step folds into the other: it holds the prompt, or
    // fewer of the screens they share.
    const stepped = small.nodeIds.some((id) => along.has(typeOf(id)));
    const host = journeys.find((other) => {
      if (other === small || other.parent !== small.parent || journeys.some((child) => child.parent === other.key)) return false;
      const theirs = other.nodeIds.filter((id) => !along.has(typeOf(id))).map(nameOf);
      if (!own.every((name) => theirs.includes(name))) return false;
      return stepped ? theirs.length >= own.length : theirs.length > own.length;
    });
    if (!host) continue;
    fold(journeys, host, small, actions);
    folded += 1;
  }
  return folded;
}

/**
 * Two features of one area about the same thing ("Creating meeting notes"
 * and "Managing meeting actions") are one feature: the second folds into the
 * first, its flows with it. A feature is a flow other flows sit inside.
 * @returns {number} features folded away
 */
export function mergeSameSubjectFeatures(journeys, actions = new Map()) {
  let merged = 0;
  for (const area of journeys.filter((journey) => !journey.parent)) {
    const features = journeys.filter((journey) => journey.parent === area.key && journeys.some((child) => child.parent === journey.key));
    for (let i = 0; i < features.length; i++) {
      for (let j = i + 1; j < features.length; j++) {
        const [keep, other] = [features[i], features[j]];
        if (!journeys.includes(keep) || !journeys.includes(other)) continue;
        const words = (feature) => new Set([feature.name, ...journeys.filter((child) => child.parent === feature.key).map((child) => child.name)].flatMap((name) => [...subjectWords(name)]));
        const a = subjectWords(keep.name);
        const b = subjectWords(other.name);
        // Named for the same thing, or each holding flows about it.
        const shared = [...a].filter((word) => b.has(word));
        const sharedInside = [...words(keep)].filter((word) => words(other).has(word));
        if (!shared.length && sharedInside.length < 2) continue;
        fold(journeys, keep, other, actions);
        merged += 1;
      }
    }
  }
  return merged;
}

/** Areas an app has as tabs of their own; a flow that is one of them is a section, wherever the walk reached it from. */
const AREA_WORDS = new Map([
  ['inbox', 'Inbox'],
  ['notification', 'Notifications'],
  ['librar', 'Library'],
  ['explore', 'Explore'],
  ['discover', 'Discover'],
  ['profile', 'Profile'],
  ['account', 'Account'],
]);

/**
 * "Viewing inbox" under Settings is the app's Inbox, and Inbox is a section,
 * like Home and Settings: such a flow becomes a top-level section, and the
 * flows beside it about the same area ("Filtering the inbox") move into it.
 * @returns {number} sections made
 */
export function promoteAreas(journeys) {
  let made = 0;
  const topNames = () => new Set(journeys.filter((journey) => !journey.parent).map((journey) => journey.name.toLowerCase()));
  for (const journey of [...journeys]) {
    if (!journey.parent || journey.section) continue;
    const bare = journey.name.toLowerCase().replace(/^(viewing|opening|browsing|checking|using|going to|navigating to)\s+(the\s+|your\s+)?/, '');
    const area = [...AREA_WORDS].find(([stem]) => bare.startsWith(stem) && bare.split(/\s+/).length <= 2)?.[1];
    if (!area || topNames().has(area.toLowerCase())) continue;
    const stem = [...AREA_WORDS].find(([, label]) => label === area)[0];
    const section = { key: `${journey.key}-area`, name: area, category: 'discovery', parent: null, section: true, nodeIds: journey.nodeIds.slice(0, 1) };
    section.steps = stepsOf(section.nodeIds, new Map());
    const oldParent = journey.parent;
    journey.parent = section.key;
    for (const sibling of journeys) {
      if (sibling !== journey && sibling.parent === oldParent && sibling.name.toLowerCase().includes(stem)) sibling.parent = section.key;
    }
    journeys.push(section);
    made += 1;
  }
  return made;
}

/**
 * A flow filed under Onboarding whose screens are mostly not the onboarding's
 * own ("Using Notion AI", 37 screens of the app in use) is a task of the app:
 * it moves to the area the app opens on — Home, made when there is none —
 * with everything inside it.
 * @returns {number} flows moved
 */
export function liftAppTasksOutOfOnboarding(journeys, actions = new Map()) {
  const onboarding = journeys.find((journey) => !journey.parent && (journey.category === 'onboarding' || /^onboarding$/i.test(journey.name)));
  if (!onboarding) return 0;
  const own = new Set(onboarding.nodeIds);
  const leaking = journeys.filter((journey) => journey.parent === onboarding.key && journey.nodeIds.length >= PART_MIN && journey.nodeIds.filter((id) => !own.has(id)).length / journey.nodeIds.length > 0.5);
  if (!leaking.length) return 0;
  let home = journeys.find((journey) => !journey.parent && /^home$/i.test(journey.name));
  if (!home) {
    home = { key: `${onboarding.key}-app`, name: 'Home', category: 'discovery', parent: null, section: true, nodeIds: [leaking[0].nodeIds[0]] };
    home.steps = stepsOf(home.nodeIds, actions);
    journeys.splice(journeys.indexOf(onboarding) + 1, 0, home);
  }
  for (const journey of leaking) {
    journey.parent = home.key;
    if (journey.category === 'onboarding') journey.category = 'discovery';
  }
  return leaking.length;
}

/**
 * A section still named by a misread tab label ("Ch") after the model has
 * named the tree is named from its first page instead — "Welcome to
 * Notion!" is the getting-started page — or, failing a title, "Home".
 * @returns {number} sections named
 */
export function nameBrokenSections(journeys, graph, appName = '') {
  let named = 0;
  const taken = new Set(journeys.filter((journey) => !journey.parent).map((journey) => journey.name.toLowerCase()));
  for (const section of journeys.filter((journey) => !journey.parent && brokenSectionName(journey.name))) {
    const first = graph?.get(section.nodeIds[0])?.analysis ?? {};
    const title = String(first.signals?.title || first.signals?.headline || first.name || '').replace(/[!?.]+$/, '').trim();
    let name = /^welcome\b/i.test(title) || /^(onboarding|getting started)\b/i.test(title) ? 'Getting started' : title.split(/\s+/).length <= 4 && /[a-z]{3}/i.test(title) ? title : 'Home';
    name = fixReadErrors(name, appName);
    if (taken.has(name.toLowerCase())) name = name === 'Home' ? 'Browse' : `${name} area`;
    taken.add(name.toLowerCase());
    section.name = name;
    named += 1;
  }
  return named;
}

/**
 * The names as a last pass, every one of them — those the model gave and
 * those it never saw: read errors fixed ("Notion Al" is "Notion AI"), and
 * top-level sections of one name made one (two "Home"s are one Home).
 * @returns {number} names or sections changed
 */
export function tidyNames(journeys, actions = new Map(), appName = '') {
  let changed = 0;
  for (const journey of journeys) {
    const fixed = fixReadErrors(journey.name, appName);
    if (fixed !== journey.name) {
      journey.name = fixed;
      changed += 1;
    }
  }
  const seen = new Map();
  for (const section of journeys.filter((journey) => !journey.parent)) {
    const key = section.name.toLowerCase();
    const first = seen.get(key);
    if (!first) {
      seen.set(key, section);
      continue;
    }
    fold(journeys, first, section, actions);
    changed += 1;
  }
  return changed;
}

/**
 * The last look before the tree is kept: what would still need a correction
 * by hand. Nothing is changed here; the caller logs it and shows it to the
 * admin with the finished tree.
 */
export function checkTree(journeys, graph) {
  const issues = [];
  const byParent = new Map();
  for (const journey of journeys) {
    const key = `${journey.parent ?? ''}\u0000${journey.name.toLowerCase()}`;
    byParent.set(key, (byParent.get(key) ?? 0) + 1);
  }
  for (const [key, count] of byParent) if (count > 1) issues.push(`"${key.split('\u0000')[1]}" appears ${count} times in one place`);
  for (const journey of journeys) {
    const isFeature = journeys.some((child) => child.parent === journey.key);
    if (!isFeature && journey.nodeIds.length >= OVERSIZED * 1.5) issues.push(`"${journey.name}" has ${journey.nodeIds.length} screens — likely several tasks`);
  }
  const ids = new Set(journeys.flatMap((journey) => journey.nodeIds));
  const unnamed = [...ids].filter((id) => /^(other|screen)$/i.test(String(graph.get(id)?.analysis?.name ?? '').trim()));
  if (unnamed.length) issues.push(`${unnamed.length} screen(s) still have no real name`);
  for (const area of journeys.filter((journey) => !journey.parent)) {
    const loose = journeys.filter((journey) => journey.parent === area.key && !journeys.some((child) => child.parent === journey.key));
    if (loose.length > 12) issues.push(`"${area.name}" has ${loose.length} flows not in any feature`);
  }
  return issues;
}

/** Words that would match any flow: verbs of looking and doing, places, filler. */
const GENERIC_WORDS = new Set(['view', 'open', 'use', 'manag', 'select', 'add', 'creat', 'set', 'start', 'provid', 'chang', 'edit', 'new', 'item', 'option', 'screen', 'page', 'home', 'detail', 'with', 'from', 'into', 'your', 'the', 'and', 'for', 'ai', 'app', 'setting', 'input']);

/** A flow name's subject words, stemmed: "Sorting search results" → search, result, sort. */
function subjectWords(name) {
  return new Set(
    String(name)
      .toLowerCase()
      .split(/[^a-z]+/)
      .map((word) => word.replace(/(ing|es|s)$/, ''))
      .filter((word) => word.length >= 3 && !GENERIC_WORDS.has(word)),
  );
}

const ASSIGN_SYSTEM = `You finish arranging an app's flow tree for a design-reference library like Mobbin. You get the features of one area, each with the flows already inside it, and flows not yet placed. Put a flow inside a feature only when it is clearly part of it — about the same thing (a search, a meeting, a chat, a member list) — and leave it out otherwise.

Return JSON only, no prose, no markdown fence:
{ "assign": [ { "flow": <flow index>, "feature": "F<feature index>" } ] }
Return { "assign": [] } when none fit.`;

/** What a flow's named task is, read off its name: the verb and what it is done to. */
const CATEGORY_BY_NAME = [
  { category: 'authentication', test: /^(signing (in|up|out)|logging (in|out)|verifying|creating an account|authenticating|resetting (a |your )?password)\b|\bwith (google|apple|email)\b/i },
  { category: 'checkout', test: /^(subscribing|upgrading|paying|checking out|buying|ordering|purchasing|selecting a (plan|subscription))\b|\b(plan|subscription|checkout|payment)s?\b/i },
  { category: 'search', test: /^search(ing)?\b/i },
  { category: 'settings', test: /\b(settings?|preferences|appearance|profile|notifications|permissions?|privacy|access|account)\b/i },
  { category: 'creation', test: /^(creating|adding|editing|writing|sending|uploading|composing|drafting|making|building|renaming|sharing|copying|moving|customizing|choosing|naming|taking|starting|setting up a)\b/i },
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
