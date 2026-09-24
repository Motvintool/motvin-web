/**
 * Screen understanding, by Claude.
 *
 * One call per newly-discovered screen answers both questions the crawler has:
 * what is this screen (metadata for the library) and what can be tapped next
 * (the frontier). Doing it in one call keeps cost proportional to unique
 * screens rather than to steps taken.
 *
 * Two backends, picked automatically:
 *   api — ANTHROPIC_API_KEY is set. Direct Messages API call. Preferred: it is
 *         fast, and the JSON comes back clean.
 *   cli — falls back to the local `claude` binary, already signed in. Slower,
 *         but needs no key.
 *
 * When idb gave us an accessibility tree, the elements are passed in and Claude
 * annotates them instead of inventing coordinates — far more reliable than
 * reading tap targets off pixels.
 */

import { readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { run } from './exec.js';
import { log } from './log.js';
import { luminance } from './hash.js';
import { buildOcr, readText } from './ocr.js';
import { classifyScreen, groupFlowsLocally, guessBrand } from './heuristics.js';
import { ELEMENTS, INDUSTRIES, PUBLISHED_FLOW_CATEGORIES, SCREEN_TYPE_NAMES, STYLES } from './taxonomy.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2023-06-01';
const DEFAULT_MODEL = process.env.MOTVIN_CRAWLER_MODEL || 'claude-sonnet-5';

/** Longest edge sent to the model. Full 1179×2554 frames are mostly wasted tokens. */
const ANALYSIS_MAX_EDGE = 900;

/**
 * Which analyzer to use.
 *
 *   api    — the Messages API. Best results: real descriptions, real flow names.
 *   local  — Vision OCR plus the rules in heuristics.js. No key, no network.
 *   cli    — the signed-in `claude` binary. Slow; only when asked for by name.
 *
 * `local` is the default fallback rather than `cli` because it always works,
 * where the CLI is frequently present but not signed in.
 */
export function pickBackend(preferred) {
  if (preferred && preferred !== 'auto') return preferred;
  return process.env.ANTHROPIC_API_KEY ? 'api' : 'local';
}

/**
 * Asks the chosen backend one trivial question before any real work starts.
 *
 * Worth a round trip: without an analyzer every screen files as "other" and
 * every flow collapses into one bucket, which looks like a broken feature
 * rather than a missing key. Failing here, before a video is processed, is the
 * difference between a clear message and twenty useless screens in the library.
 *
 * @returns {Promise<{usable: boolean, backend: string, reason: string|null}>}
 */
export async function probeAnalyzer(preferred) {
  const backend = pickBackend(preferred);

  if (backend === 'none') {
    return { usable: false, backend, reason: 'classification is switched off' };
  }

  if (backend === 'local') {
    // Compiling the reader is the only thing that can fail, and it fails the
    // same way every time, so building it here is the whole check.
    try {
      await buildOcr();
      return { usable: true, backend, reason: null };
    } catch (error) {
      return { usable: false, backend, reason: error.message.split('\n')[0] };
    }
  }

  if (backend === 'api') {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { usable: false, backend, reason: 'ANTHROPIC_API_KEY is not set' };
    }
    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': API_VERSION,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
          max_tokens: 1,
          messages: [{ role: 'user', content: 'ok' }],
        }),
      });
      if (!response.ok) {
        const body = await response.text();
        return { usable: false, backend, reason: `Anthropic API ${response.status}: ${body.slice(0, 200)}` };
      }
      return { usable: true, backend, reason: null };
    } catch (error) {
      return { usable: false, backend, reason: `could not reach the Anthropic API: ${error.message}` };
    }
  }

  const probe = await run('claude', ['-p', 'Reply with exactly: OK', '--output-format', 'json'], { timeout: 60_000 });
  let envelope = null;
  try {
    envelope = JSON.parse(probe.stdout);
  } catch {
    // Treated as unusable below.
  }
  if (probe.failed || !envelope || envelope.is_error) {
    const reason = envelope?.result || probe.stderr.trim() || `exit ${probe.code}`;
    return { usable: false, backend, reason: `claude CLI: ${reason}` };
  }
  return { usable: true, backend, reason: null };
}

// ─── Prompt ──────────────────────────────────────────────────────────────────

function systemPrompt() {
  return `You are the screen analyst for a design-inspiration library. You look at one iOS screenshot and return JSON only.

Return exactly this shape, no prose, no markdown fence:
{
  "screen_type": one of ${SCREEN_TYPE_NAMES.join('|')},
  "category": one of ${INDUSTRIES.join('|')},
  "flow": short lowercase flow name, e.g. "shopping", "onboarding", "account",
  "name": short human title, max 6 words,
  "description": one sentence describing layout and purpose,
  "tags": 4-8 lowercase keywords,
  "elements": subset of ${ELEMENTS.join('|')},
  "style": subset of ${STYLES.join('|')},
  "blocked": true when this screen is an access control the crawler must not work around,
  "blocked_reason": string or null,
  "actions": [ { "ref": <element index from the provided list, or null>, "label": string, "kind": "button"|"tab"|"cell"|"link"|"input"|"other", "x": 0-1, "y": 0-1, "navigational": boolean, "risk": "safe"|"destructive"|"purchase"|"auth"|"external" } ]
}

Rules for "blocked": set it true for sign-in, sign-up, one-time-code, CAPTCHA, biometric, paywall, subscription, payment, and system permission prompts. The crawler captures those screens and stops exploring that branch. Never suggest an action that would sign in, pay, subscribe, grant a permission, or dismiss a security prompt.

Rules for "screen_type": prefer the most specific state when one applies — "loading" for spinners and skeletons, "empty_state" for a screen whose content area says there is nothing yet, "error" for failures, "confirmation" for success messages, "dialog"/"bottom_sheet"/"toast" for something drawn over a dimmed or unchanged screen, "coach_mark" for a first-use tip, "splash" for a launch screen, "otp" for a verification-code entry, and "external_auth" for a Google, Apple or Facebook sign-in page (the provider's own UI, not the app's button).

Rules for "actions": list only controls that plausibly navigate to a different screen — tab bar items, list rows, cards, nav buttons, "see all" links. Skip decorative images, labels, and anything that only changes state in place. Mark "risk" honestly: anything that spends money, deletes, posts, shares, messages, or authenticates is not "safe". Cap the list at 12, most promising first.

When an element list is provided, set "ref" to that element's index and leave x/y null. Only use normalised x/y when no element list was given.`;
}

function userPrompt(elements) {
  if (!elements.length) {
    return 'Analyse this iOS screen. No accessibility data is available, so give normalised x/y for each action.';
  }
  const lines = elements.map((element, index) => {
    const frame = element.frame;
    const position = `@${Math.round(frame.x)},${Math.round(frame.y)} ${Math.round(frame.width)}×${Math.round(frame.height)}`;
    const text = element.label || element.value || '(no label)';
    return `${index}: [${element.kind}/${element.role}] "${text}" ${position}`;
  });
  return `Analyse this iOS screen.\n\nAccessibility elements on screen (index: [kind/role] "label" @x,y w×h):\n${lines.join('\n')}\n\nReference these by index in "actions".`;
}

// ─── Image preparation ───────────────────────────────────────────────────────

let tempCounter = 0;

/** Downscales for the model and returns base64 PNG. */
async function encodeForModel(imagePath) {
  const out = join(tmpdir(), `motvin-analyze-${process.pid}-${tempCounter++}.png`);
  const resized = await run('sips', ['-Z', String(ANALYSIS_MAX_EDGE), '-s', 'format', 'png', imagePath, '--out', out], {
    timeout: 20_000,
  });
  const source = resized.failed ? imagePath : out;
  try {
    return readFileSync(source).toString('base64');
  } finally {
    if (!resized.failed) {
      try {
        unlinkSync(out);
      } catch {
        // Temp file; nothing depends on its removal.
      }
    }
  }
}

// ─── Backends ────────────────────────────────────────────────────────────────

async function callApi(imagePath, elements) {
  const base64 = await encodeForModel(imagePath);
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 2000,
      system: systemPrompt(),
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
            { type: 'text', text: userPrompt(elements) },
          ],
        },
        // Prefilling the opening brace keeps the reply to bare JSON.
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Anthropic API ${response.status}: ${body.slice(0, 400)}`);
  }

  const payload = await response.json();
  const text = payload.content?.map((block) => block.text || '').join('') ?? '';
  return `{${text}`;
}

async function callCli(imagePath, elements) {
  const prompt = `${systemPrompt()}\n\n${userPrompt(elements)}\n\nThe screenshot is the image file at:\n${imagePath}\n\nRead that image, then reply with the JSON object and nothing else.`;
  const result = await run('claude', ['-p', prompt, '--output-format', 'json'], { timeout: 180_000 });

  // The reason for a failure is in the JSON envelope on stdout, not in stderr,
  // and the CLI is inconsistent about its exit code — an auth failure has been
  // seen exiting both 0 and 1. So parse stdout first either way, otherwise the
  // user is told "exit 1" when the CLI actually said "Not logged in".
  let envelope = null;
  try {
    envelope = JSON.parse(result.stdout);
  } catch {
    // Not JSON — fall through to the raw-output paths below.
  }

  if (envelope?.is_error) {
    const reason = envelope.result || `API error ${envelope.api_error_status ?? 'unknown'}`;
    throw new Error(`claude CLI: ${reason}`);
  }
  if (result.failed) {
    throw new Error(`claude CLI failed: ${result.stderr.trim() || `exit ${result.code}`}`);
  }
  return envelope?.result ?? result.stdout;
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/** Pulls the first JSON object out of a reply that may carry stray prose. */
export function extractJson(text) {
  const trimmed = String(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // Fall through to brace matching.
  }
  const start = trimmed.indexOf('{');
  if (start === -1) throw new Error(`no JSON in model reply: ${trimmed.slice(0, 200)}`);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') inString = !inString;
    if (inString) continue;
    if (char === '{') depth++;
    if (char === '}' && --depth === 0) {
      return JSON.parse(trimmed.slice(start, i + 1));
    }
  }
  throw new Error(`unterminated JSON in model reply: ${trimmed.slice(0, 200)}`);
}

const list = (value) => (Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []);

/** Clamps the model's answer to vocabularies the rest of the pipeline accepts. */
export function normaliseAnalysis(raw, elements) {
  const screenType = SCREEN_TYPE_NAMES.includes(raw.screen_type) ? raw.screen_type : 'other';

  const actions = (Array.isArray(raw.actions) ? raw.actions : [])
    .map((action) => {
      const ref = Number.isInteger(action.ref) ? action.ref : null;
      const element = ref !== null ? elements[ref] : null;

      // An action is only usable if we can turn it into a tap point, either
      // from its accessibility frame or from normalised coordinates.
      const point = element
        ? { x: element.frame.x + element.frame.width / 2, y: element.frame.y + element.frame.height / 2, normalised: false }
        : typeof action.x === 'number' && typeof action.y === 'number'
          ? { x: action.x, y: action.y, normalised: true }
          : null;
      if (!point) return null;

      return {
        label: String(action.label || element?.label || '').replace(/\s+/g, ' ').trim(),
        hint: element?.hint || '',
        kind: action.kind || element?.kind || 'other',
        role: element?.role || '',
        frame: element?.frame || null,
        point,
        navigational: action.navigational !== false,
        risk: ['safe', 'destructive', 'purchase', 'auth', 'external'].includes(action.risk) ? action.risk : 'safe',
      };
    })
    .filter(Boolean)
    .slice(0, 12);

  const stateOfType = { dialog: 'modal', bottom_sheet: 'bottom-sheet', toast: 'toast', loading: 'loading', empty_state: 'empty', error: 'error', confirmation: 'success', coach_mark: 'coach-mark', permission: 'permission' };

  return {
    screenType,
    states: stateOfType[screenType] ? [stateOfType[screenType]] : [],
    external: screenType === 'external_auth' ? 'model recognised a third-party sign-in page' : null,
    category: INDUSTRIES.includes(raw.category) ? raw.category : null,
    flow: typeof raw.flow === 'string' ? raw.flow.toLowerCase().trim() : null,
    name: String(raw.name || '').trim() || 'Untitled screen',
    description: String(raw.description || '').trim(),
    tags: list(raw.tags).map((tag) => tag.toLowerCase().trim()).filter(Boolean).slice(0, 10),
    elements: list(raw.elements).filter((element) => ELEMENTS.includes(element)),
    style: list(raw.style).filter((style) => STYLES.includes(style)),
    blocked: raw.blocked === true,
    blockedReason: raw.blocked === true ? String(raw.blocked_reason || 'model flagged an access control') : null,
    actions,
  };
}

// ─── App identification ──────────────────────────────────────────────────────

const IDENTIFY_SYSTEM = `You identify an app from screenshots of it. Return JSON only, no prose, no markdown fence:
{
  "name": the app's name as a user would say it, e.g. "Airbnb". If you cannot tell, use a short description of what it does instead, e.g. "Recipe planner",
  "confident": true only when you actually recognise the app or its name is visible on screen,
  "industry": one of ${INDUSTRIES.join('|')},
  "tagline": one short sentence describing what the app is for,
  "website": the app's website if you are certain of it, otherwise ""
}

Never invent a website. Never guess a brand you do not actually recognise — an honest "confident": false with a descriptive name is far more useful than a wrong brand.`;

async function callApiMulti(imagePaths, system, text) {
  const images = await Promise.all(imagePaths.map((path) => encodeForModel(path)));
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 600,
      system,
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((data) => ({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } })),
            { type: 'text', text },
          ],
        },
        { role: 'assistant', content: '{' },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  return `{${payload.content?.map((block) => block.text || '').join('') ?? ''}`;
}

/**
 * Works out which app a set of screenshots belongs to.
 *
 * Called once per ingest rather than per screen: the whole point is that a
 * video upload should not ask the person to fill in a form first. Several
 * screens are sent together because one screen is often ambiguous while a home
 * screen plus a settings screen usually is not.
 *
 * @param {string[]} imagePaths a handful of representative frames
 * @returns {Promise<{name: string, confident: boolean, industry: string, tagline: string, website: string}>}
 */
export async function identifyApp(imagePaths, options = {}) {
  const backend = pickBackend(options.backend);

  if (backend === 'local') {
    // Rules cannot recognise a logo, but apps print their own name where
    // lawyers make them — "Acme Terms of Use", "© Acme", "Welcome to Acme".
    // When the caller has the recognised text, that is read; otherwise there
    // is nothing honest to say, and saying so lets the caller fall back to the
    // recording's own name instead of publishing a confident wrong guess.
    const brand = options.lineSets ? guessBrand(options.lineSets) : null;
    if (!brand) {
      throw new Error('the local analyzer cannot identify an app — name it yourself, or set ANTHROPIC_API_KEY');
    }
    return {
      name: brand.name,
      confident: false,
      industry: 'productivity',
      tagline: '',
      website: '',
      evidence: brand.evidence,
    };
  }

  const sample = imagePaths.slice(0, 3);
  const instruction = `These are ${sample.length} screen(s) from one iOS app. Identify it.`;

  let reply;
  if (backend === 'api') {
    reply = await callApiMulti(sample, IDENTIFY_SYSTEM, instruction);
  } else {
    // The CLI reads files from disk, so the images travel as paths rather than
    // as attachments.
    const prompt = `${IDENTIFY_SYSTEM}\n\n${instruction}\n\nThe screenshots are the image files at:\n${sample.join('\n')}\n\nRead those images, then reply with the JSON object and nothing else.`;
    const result = await run('claude', ['-p', prompt, '--output-format', 'json'], { timeout: 180_000 });
    let envelope = null;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      // Handled below alongside a non-zero exit.
    }
    if (envelope?.is_error) throw new Error(`claude CLI: ${envelope.result || 'error'}`);
    if (result.failed) throw new Error(`claude CLI failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    reply = envelope?.result ?? result.stdout;
  }

  const raw = extractJson(reply);
  return {
    name: String(raw.name || '').trim() || 'Untitled app',
    confident: raw.confident === true,
    industry: INDUSTRIES.includes(raw.industry) ? raw.industry : 'productivity',
    tagline: String(raw.tagline || '').trim(),
    website: /^https?:\/\//.test(String(raw.website || '')) ? String(raw.website).trim() : '',
  };
}

// ─── Flow grouping ───────────────────────────────────────────────────────────

const GROUP_SYSTEM = `You group screens from one app into user flows, the way a design reference library does. Return JSON only, no prose, no markdown fence:
{
  "flows": [
    { "name": "Onboarding", "category": one of ${PUBLISHED_FLOW_CATEGORIES.join('|')}, "screens": [0, 1, 2] }
  ]
}

A flow is one journey a person completes, named as a task in two or three words: "Onboarding", "Completing a profile", "Purchasing a ticket", "Filtering events", "Sending a message". Never name a flow after a screen type.

Rules:
- The screens arrive in the order they were captured. Keep that order inside each flow.
- Every screen index appears in exactly one flow. Do not drop any, do not repeat any.
- A flow needs at least two screens. Put leftovers in the nearest related flow rather than making a flow of one.
- Prefer a few meaningful flows over many tiny ones. Twenty screens is usually three to six flows.`;

async function callApiText(system, text) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': API_VERSION,
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      max_tokens: 2000,
      system,
      messages: [
        { role: 'user', content: text },
        { role: 'assistant', content: '{' },
      ],
    }),
  });
  if (!response.ok) {
    throw new Error(`Anthropic API ${response.status}: ${(await response.text()).slice(0, 400)}`);
  }
  const payload = await response.json();
  return `{${payload.content?.map((block) => block.text || '').join('') ?? ''}`;
}

/**
 * Groups captured screens into named flows.
 *
 * Runs on the descriptions rather than the images: by this point every screen
 * has been analysed, so the grouping is a reasoning problem over text, which is
 * both cheaper and better at seeing a journey across several screens than
 * looking at them one at a time would be.
 *
 * @param {{screenType: string, name: string, description: string}[]} screens in capture order
 * @returns {Promise<{name: string, category: string, screens: number[]}[]>}
 */
export async function groupIntoFlows(screens, options = {}) {
  if (screens.length < 2) return [];

  if (pickBackend(options.backend) === 'local') {
    // Runs off the screen types the rules already assigned: consecutive screens
    // of the same journey become one flow, named for that journey.
    return groupFlowsLocally(screens);
  }

  const listing = screens
    .map((screen, index) => `${index}: [${screen.screenType}] ${screen.name}${screen.description ? ` — ${screen.description}` : ''}`)
    .join('\n');
  const instruction = `These ${screens.length} screens were captured from one app, in this order:\n\n${listing}\n\nGroup them into flows.`;

  const backend = pickBackend(options.backend);
  let reply;
  if (backend === 'api') {
    reply = await callApiText(GROUP_SYSTEM, instruction);
  } else {
    const result = await run('claude', ['-p', `${GROUP_SYSTEM}\n\n${instruction}`, '--output-format', 'json'], {
      timeout: 180_000,
    });
    let envelope = null;
    try {
      envelope = JSON.parse(result.stdout);
    } catch {
      // Handled below.
    }
    if (envelope?.is_error) throw new Error(`claude CLI: ${envelope.result || 'error'}`);
    if (result.failed) throw new Error(`claude CLI failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    reply = envelope?.result ?? result.stdout;
  }

  return normaliseFlows(extractJson(reply), screens.length);
}

/**
 * Keeps the model's grouping honest: valid categories, in-range indexes, no
 * screen in two flows, and every screen accounted for. Whatever is left over
 * joins a trailing flow rather than being silently lost.
 */
export function normaliseFlows(raw, screenCount) {
  const claimed = new Set();
  const flows = [];

  for (const flow of Array.isArray(raw.flows) ? raw.flows : []) {
    const indexes = (Array.isArray(flow.screens) ? flow.screens : [])
      .map((value) => Number(value))
      .filter((value) => Number.isInteger(value) && value >= 0 && value < screenCount)
      .filter((value) => {
        if (claimed.has(value)) return false;
        claimed.add(value);
        return true;
      });

    if (indexes.length < 2) {
      // Too small to be a flow; release its screens for the leftovers pass.
      for (const index of indexes) claimed.delete(index);
      continue;
    }

    flows.push({
      name: String(flow.name || '').trim().slice(0, 60) || 'Flow',
      category: PUBLISHED_FLOW_CATEGORIES.includes(flow.category) ? flow.category : 'discovery',
      screens: indexes,
    });
  }

  const leftovers = [];
  for (let index = 0; index < screenCount; index++) {
    if (!claimed.has(index)) leftovers.push(index);
  }

  if (leftovers.length) {
    if (flows.length) {
      // Attach each leftover to the flow holding the nearest screen, so it
      // lands somewhere sensible instead of in a bucket at the end.
      for (const index of leftovers) {
        let best = flows[0];
        let bestDistance = Infinity;
        for (const flow of flows) {
          for (const member of flow.screens) {
            const distance = Math.abs(member - index);
            if (distance < bestDistance) {
              bestDistance = distance;
              best = flow;
            }
          }
        }
        best.screens.push(index);
      }
      for (const flow of flows) flow.screens.sort((a, b) => a - b);
    } else if (leftovers.length >= 2) {
      flows.push({ name: 'Walkthrough', category: 'discovery', screens: leftovers });
    }
  }

  return flows;
}

/**
 * Analyses one screenshot.
 *
 * @param {string} imagePath
 * @param {Array} elements accessibility elements, or [] when idb is absent
 * @param {{backend?: string, context?: object, lines?: Array, luminance?: number|null, colors?: object[]}} options
 *   `context` is what the segmenter knows about the frame's place in a
 *   recording; `lines` are OCR lines already read (so the text is read once),
 *   and `luminance`/`colors` come from the frame's thumbnail when there is one.
 */
export async function analyseScreen(imagePath, elements = [], options = {}) {
  const backend = pickBackend(options.backend);
  log.debug(`analysing with ${backend} backend (${elements.length} a11y elements)`);

  if (backend === 'local') {
    // Brightness is read alongside the text so the rules can call a screen dark
    // or light — the one style judgement available without a model.
    const [lines, brightness] = await Promise.all([
      options.lines ?? readText(imagePath),
      options.luminance !== undefined ? options.luminance : luminance(imagePath).catch(() => null),
    ]);
    const analysis = classifyScreen(lines, { luminance: brightness, colors: options.colors, context: options.context });
    analysis.lines = lines;
    return analysis;
  }

  const reply = backend === 'api' ? await callApi(imagePath, elements) : await callCli(imagePath, elements);
  const analysis = normaliseAnalysis(extractJson(reply), elements);
  analysis.analyzer = backend === 'api' ? DEFAULT_MODEL : 'claude CLI';
  // The model does not see the recording, so what the segmenter measured is
  // layered on afterwards: a dialog it called "settings" is still a dialog.
  const context = options.context;
  if (context) {
    const states = new Set(analysis.states ?? []);
    if (context.kind === 'loading') states.add('loading');
    if (context.overlay?.kind === 'dialog') states.add('modal');
    if (context.overlay?.kind === 'bottom_sheet') states.add('bottom-sheet');
    if (context.overlay?.kind === 'toast') states.add('toast');
    if (context.kind === 'scrolled') states.add('scrolled');
    analysis.states = [...states];
  }
  return analysis;
}
