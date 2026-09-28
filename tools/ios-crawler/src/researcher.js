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

const OUTPUT_RULES = `
You are given the journeys already grouped from a real recording of one app, in the order they were walked, with the screens in each. That grouping is fixed: keep every journey and every screen id exactly as given, and do not add, merge, split or reorder them.

Write the words. Return JSON only — no prose, no markdown fence — in exactly this shape:
{
  "journeys": { "<journey key exactly as given, e.g. J2 Food>": { "name": "...", "summary": "..." } },
  "screens":  { "<screen id exactly as given, e.g. s004>": { "name": "...", "purpose": "...", "primaryAction": "...", "description": "..." } }
}
Use the journey keys and screen ids exactly as written in the input; a summary must describe that journey's own steps and nothing else.

Journey names read like Mobbin's: the task in the person's own terms, two to six words, present participle when it is an action — "Searching dishes & restaurants", "Adding a dish to cart", "Turning on veg mode filter", "Booking a table", "Subscribing to Swiggy One", "Editing profile". A journey that opens a feature is named for the feature as the app names it — "Offer Zone", "Eatlist", "Restaurant detail". A top-level section keeps its tab name — "Food", "Instamart", "Profile" — and "Onboarding" stays "Onboarding". A summary is one sentence saying what the person does across the journey's steps.

Screen names are short plain nouns a designer would file the screen under — "Phone number entry", "Restaurant detail", "Filter sheet", "Location picker (logged out)", "Order placed" — never the marketing line or a fragment of visible text. A purpose is one short sentence (under 15 words) on what the screen is for. The primary action is the one thing the person mostly does there, as a short imperative — "Enter mobile number", "Add to cart", "Apply filters" — or "" when there is none (a splash, a loading state). The description is one natural sentence (under 30 words) a person would write about the screen for a design library: what is shown, how it is laid out, what stands out. Be brief; every field is one line.

The names given in the input are machine guesses read off the screens' text and are often wrong — a dish, a brand, a banner, a fragment. Never repeat such a name. Always write your own name from what the screen is for and what the person does there. A product, dish, restaurant or brand name is never a journey name; a journey about one is "Restaurant detail", "Product detail" or the task done there.

Only say what the screenshots and their text support. Where you cannot tell what a screen is for, keep the description short rather than guess, and name it by its role (for example "Category listing", "Item detail").`;

/**
 * Serialises the tree for the model, with an [image N] marker per screen when
 * images are being sent, so the reply can be tied back to ids.
 *
 * @param {object[]} journeys  from buildJourneys, with keys
 * @param {import('./graph.js').ScreenGraph} graph
 * @param {{maxLines?: number, withImages?: boolean}} options
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
      const text = !inFocus ? '' : (analysis.lines ?? [])
        .filter((line) => line.y > 0.045)
        .slice(0, maxLines)
        .map((line) => String(line.text || '').trim())
        .filter((t) => t.length > 1)
        .join(' | ');
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

/** The key a journey is referred to by in the exchange: index plus name, hard to mix up. */
export function journeyKey(journey, index) {
  return `J${index} ${journey.name}`;
}

/**
 * Runs the researcher over a tree and applies what comes back.
 *
 * `complete` is the model adapter: `({system, blocks}) => Promise<string>`,
 * where blocks are text and image parts. `encodeImage(path)` returns base64
 * PNG for a screenshot. Screens are sent in batches so a long recording does
 * not exceed a context window; each batch carries the whole tree as text and
 * the images of its own screens.
 *
 * @returns {Promise<{journeysRenamed: number, screensUpdated: number, batches: number}>}
 */
export async function researchTree(journeys, graph, options) {
  const { complete, encodeImage, app, vision = true, batchSize = 6, extractJson, log, analyzer = 'ai', onBatch } = options;
  if (!journeys.length) return { journeysRenamed: 0, screensUpdated: 0, batches: 0 };

  const nodes = [];
  for (const journey of journeys) {
    for (const nodeId of journey.nodeIds) {
      const node = graph.get(nodeId);
      if (node && !nodes.includes(node)) nodes.push(node);
    }
  }

  const proposals = { journeys: {}, screens: {} };
  const batches = [];
  for (let i = 0; i < nodes.length; i += batchSize) batches.push(nodes.slice(i, i + batchSize));

  for (const [batchIndex, batch] of batches.entries()) {
    const focus = batch.map((node) => node.id);
    const tree = describeTree(journeys, graph, { withImages: vision, focus });
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
    const header = `App: ${app?.name ?? 'unknown'}${app?.industry ? ` (${app.industry})` : ''}.\n\n`;
    const scope =
      batches.length > 1
        ? `This is batch ${batchIndex + 1} of ${batches.length}. ${vision ? `The images attached are, in order, the screens with ids: ${focus.join(', ')}.` : ''} Write "screens" entries for these ids: ${focus.join(', ')}. Write "journeys" entries for every journey.\n\n`
        : vision
          ? `The images attached are, in order, the screens marked [image N] below.\n\n`
          : '';
    blocks.push({ type: 'text', text: `${header}${scope}${tree.text}` });

    log?.(`researcher: batch ${batchIndex + 1}/${batches.length} — ${batch.length} screen(s)${vision ? ' with images' : ' from text'}`);
    onBatch?.(batchIndex, batches.length);
    let raw = null;
    try {
      // Six screens of names, purposes, actions and descriptions plus every
      // journey's line run to a few thousand tokens; a tight budget cuts the
      // JSON mid-object and loses the whole batch.
      const reply = await complete({ system: `${BRIEF}\n${OUTPUT_RULES}`, blocks, maxTokens: 6000 });
      if (process.env.MOTVIN_RESEARCH_DEBUG) process.stderr.write(`\n[researcher reply]\n${reply}\n`);
      raw = extractJson(reply);
    } catch (error) {
      // One bad batch — a truncated reply, a timeout — costs that batch's
      // words, not the run.
      log?.(`researcher: batch ${batchIndex + 1} failed — ${String(error.message).split('\n')[0]}`);
      continue;
    }
    if (raw && typeof raw.journeys === 'object') Object.assign(proposals.journeys, raw.journeys);
    if (raw && typeof raw.screens === 'object') {
      for (const id of focus) if (raw.screens[id]) proposals.screens[id] = raw.screens[id];
    }
  }

  const applied = applyProposals(journeys, graph, proposals);
  for (const id of Object.keys(proposals.screens)) {
    const node = graph.get(id);
    if (node && node.analysis.viaHeuristics === false) node.analysis.analyzer = analyzer;
  }
  return { ...applied, batches: batches.length };
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
    const proposal = entries[journeyKey(journey, index)] ?? entries[String(index)] ?? entries[`J${index}`] ?? findByLooseKey(entries, index, journey.name);
    if (!proposal || typeof proposal !== 'object') return;

    const parentName = journey.parent ? nameOfKey.get(journey.parent) ?? null : null;
    let name = clean(proposal.name, 60);
    // "Onboarding - Phone number entry" is the parent's name glued on; the
    // journey is the part after it.
    if (name && parentName) name = name.replace(new RegExp(`^${escapeRegExp(parentName)}\\s*[-–—:›>]\\s*`, 'i'), '').trim();
    name = sentenceCase(name, properNouns);
    // A section keeps its tab name and onboarding its own; the model names
    // the journeys inside them.
    const isSectionName = journey.section && journey.category === 'discovery';
    if (name && name.split(' ').length <= 7 && !isSectionName && !/^onboarding$/i.test(journey.name)) {
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
