import type { AiStatus, IngestJob } from '@/lib/inspirations/ingestJobs';
import { INGEST_STAGES, stageIndex } from '@/lib/inspirations/ingestJobs';
import { describeOp, isDestructive, labelFor, type AdminOp, type AssistantAction } from '@/lib/inspirations/assistantActions';
import { askModel, cachedAiStatus } from '@/lib/server/ai';
import { backendBase } from '@/lib/server/adminAuth';
import { listJobs } from '@/lib/server/ingestJobs';

/**
 * The admin assistant — a conversation, not a menu.
 *
 * Every message goes to the model as one turn of a chat: who it is, what it
 * can do, the facts right now (the library, the runs, the AI), and the last
 * dozen lines of the conversation. It answers in its own words, streamed as
 * it writes, and when the admin has asked for a change it attaches one
 * operation from a fixed catalogue (assistantActions.ts). This code then
 * checks the operation against the library — the app, screen or flow has to
 * exist — and hands it back with a Confirm button. Nothing runs until that
 * is pressed; the model can only ever propose.
 *
 * The one thing answered without the model is "upload", which just opens
 * the file picker. When no model is connected, a short factual fallback
 * about the runs stands in.
 */

export type AssistantAnswer = { text: string; source: 'rules' | 'ai'; actions: AssistantAction[]; model?: string; streamed?: boolean };

export type HistoryLine = { role: 'user' | 'assistant'; text: string };

type Counts = { screens?: number; apps?: number; flows?: number; patterns?: number };
type StateApp = { id: string; name: string; tagline?: string; industry?: string; website?: string; logo?: string };
type StateFlow = { id: string; appId: string; name: string; platform?: string };
type StateFile = { appId: string; platform: string; file: string; published?: boolean; sidecar?: { name?: string } | null };
type LibraryState = { counts?: Counts; apps?: StateApp[]; flows?: StateFlow[]; files?: StateFile[]; vocabulary?: { industries?: string[] } };

/** Seconds a batch of six screens takes the local model, from measured runs. */
const SECONDS_PER_SCREEN = 2.5;

// ─── Facts about runs ────────────────────────────────────────────────────────

function clock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

function appOf(job: IngestJob) {
  return job.result?.app ?? job.interim?.app ?? null;
}

function appHref(id: string): string {
  return `/inspirations/app/${encodeURIComponent(id)}`;
}

function remaining(job: IngestJob): string | null {
  if (job.status === 'uploading') return null;
  if (job.stage === 'research' && job.total) {
    const left = Math.max(0, job.total - (job.done ?? 0));
    return left ? `about ${clock(left * SECONDS_PER_SCREEN)} more` : 'a few seconds more';
  }
  const at = stageIndex(job.stage);
  if (at >= 0 && at < stageIndex('published')) return 'a minute or two until the screens are live, then a few minutes of AI writing';
  return 'a few minutes more';
}

function describeJob(job: IngestJob, now = Date.now()): string {
  const app = appOf(job);
  const elapsed = clock(((job.finishedAt ? Date.parse(job.finishedAt) : now) - Date.parse(job.startedAt)) / 1000);
  if (job.status === 'uploading') return `“${job.title}” is still uploading — ${Math.round((job.uploaded ?? 0) * 100)}%.`;
  if (job.status === 'running') {
    const stage = INGEST_STAGES[stageIndex(job.stage)]?.label ?? job.stage;
    const live = job.interim?.screens?.length ? ` ${job.interim.screens.length} screens are already live${app ? ` under ${app.name}` : ''}.` : '';
    const left = remaining(job);
    return `“${job.title}” is running: at “${stage}” (${job.message}), ${elapsed} elapsed${left ? `, ${left}` : ''}.${live}`;
  }
  if (job.status === 'done' && job.result) {
    const r = job.result;
    const ai = r.researched && (r.researched.flows || r.researched.screens) ? ` The AI named ${r.researched.flows} flows and ${r.researched.screens} screens.` : '';
    return `“${job.title}” finished in ${elapsed}: ${r.app.name}, ${r.ingested} screens in ${r.flows.length} flows${r.excluded.length ? `, ${r.excluded.length} left out` : ''}.${ai}`;
  }
  return `“${job.title}” failed after ${elapsed}: ${job.error ?? 'no reason recorded'}.`;
}

function describeAi(ai: AiStatus | null): string {
  if (!ai) return 'the AI status could not be read just now';
  if (!ai.enabled) return 'the AI is switched off; names come from the on-device rules';
  if (ai.usable && ai.connected) {
    const journeys = ai.journeyModel && ai.journeyModel !== ai.model ? `, and ${ai.journeyModel} names the journeys and answers this chat` : '';
    return `${ai.model} is connected on ${ai.provider}${ai.vision ? ' and reads the screenshots' : ''}${journeys}`;
  }
  if (ai.usable) return `${ai.model} is chosen but the server did not list its models`;
  return `the AI is not connected: ${ai.reason ?? 'no model answers'}`;
}

// ─── The library ─────────────────────────────────────────────────────────────

async function libraryState(authorization: string | null): Promise<LibraryState | null> {
  if (!authorization) return null;
  try {
    const res = await fetch(`${backendBase()}/api/inspirations/admin/state`, { headers: { Authorization: authorization }, cache: 'no-store' });
    if (!res.ok) return null;
    const payload = (await res.json()) as { data?: LibraryState };
    return payload.data ?? null;
  } catch {
    return null;
  }
}

const norm = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

function findApp(state: LibraryState | null, wanted: string | undefined | null): StateApp | null {
  const needle = norm(wanted ?? '');
  if (!needle) return null;
  const apps = state?.apps ?? [];
  return (
    apps.find((app) => norm(app.name) === needle || app.id === needle.replace(/\s+/g, '-')) ??
    apps.find((app) => norm(app.name).startsWith(needle) || needle.startsWith(norm(app.name))) ??
    apps.find((app) => needle.includes(norm(app.name))) ??
    null
  );
}

function screenName(file: StateFile): string {
  return file.sidecar?.name || file.file.replace(/\.[^.]+$/, '').replace(/[-_/]+/g, ' ');
}

function findScreen(state: LibraryState | null, appId: string, wanted: string | undefined | null): StateFile | null {
  const needle = norm(wanted ?? '');
  if (!needle) return null;
  const files = (state?.files ?? []).filter((file) => file.appId === appId);
  return (
    files.find((file) => norm(screenName(file)) === needle || norm(file.file) === needle) ??
    files.find((file) => norm(screenName(file)).startsWith(needle)) ??
    files.find((file) => norm(screenName(file)).includes(needle) || norm(file.file).includes(needle)) ??
    null
  );
}

function findFlow(state: LibraryState | null, appId: string | null, wanted: string | undefined | null): StateFlow | null {
  const needle = norm(wanted ?? '');
  if (!needle) return null;
  const flows = (state?.flows ?? []).filter((flow) => !appId || flow.appId === appId);
  return flows.find((flow) => norm(flow.name) === needle || flow.id === needle) ?? flows.find((flow) => norm(flow.name).startsWith(needle)) ?? flows.find((flow) => norm(flow.name).includes(needle)) ?? null;
}

function countsFor(state: LibraryState | null, appId: string) {
  return {
    screens: (state?.files ?? []).filter((file) => file.appId === appId).length,
    flows: (state?.flows ?? []).filter((flow) => flow.appId === appId).length,
  };
}

// ─── The operation the model may attach ──────────────────────────────────────

const OP_SCHEMA = `"op": null, or exactly one of:
  {"kind": "update-app", "app": "<app name>", "fields": {"tagline"?: "...", "name"?: "...", "industry"?: "...", "website"?: "..."}}
  {"kind": "set-logo", "app": "<app name>"}
  {"kind": "remove-app", "app": "<app name>"}
  {"kind": "rebuild"}
  {"kind": "rename-screen", "app": "<app name>", "screen": "<current screen name>", "to": "<new name>"}
  {"kind": "delete-screen", "app": "<app name>", "screen": "<screen name>"}
  {"kind": "rename-flow", "app": "<app name or null>", "flow": "<current flow name>", "to": "<new name>"}
  {"kind": "delete-flow", "app": "<app name or null>", "flow": "<flow name>"}
  {"kind": "upload"}
  {"kind": "open", "app": "<app name>"}`;

type ParsedOp = { kind?: string; app?: string | null; fields?: Record<string, unknown>; screen?: string; flow?: string; to?: string };

/** A value the model wrapped in quotes of its own is the value without them. */
function unquote(value: string): string {
  return value.trim().replace(/^[\s"“”'‘’]+|[\s"“”'‘’]+$/g, '').trim();
}

/**
 * Checks a proposed operation against the library and turns it into the
 * Confirm button, or into a sentence saying what did not line up.
 */
/**
 * Whether a value the model put in an operation was actually said by the
 * admin. A small model asked for a link it was never given will make one
 * up; a URL has to appear in the admin's own words, and any other value
 * has to be either their words or something they asked the assistant to
 * come up with ("suggest one", "your wish", "another").
 */
function grounded(value: string, saidByAdmin: string, askedToInvent: boolean): boolean {
  const said = norm(saidByAdmin);
  const wanted = norm(value);
  if (/^https?:\/\//i.test(value) || /\.[a-z]{2,}(\/|$)/i.test(value)) {
    const bare = wanted.replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    return bare.length > 3 && said.includes(bare);
  }
  if (said.includes(wanted)) return true;
  const words = wanted.split(/[^a-z0-9]+/).filter((word) => word.length >= 3);
  const hit = words.filter((word) => said.includes(word)).length;
  if (words.length && hit / words.length >= 0.7) return true;
  return askedToInvent;
}

const INVENT = /\b(suggest|your wish|you decide|you choose|pick one|another|options?|ideas?|best one|something (good|better|catchy)|come up with|propose|recommend|whatever you think)\b/i;

function validateOp(
  op: ParsedOp,
  state: LibraryState | null,
  mentioned: StateApp[],
  grounding: { saidByAdmin: string; askedToInvent: boolean } = { saidByAdmin: '', askedToInvent: true },
): { action?: AssistantAction; note?: string } {
  const apps = state?.apps ?? [];
  const confirm = (real: AdminOp, extra?: { screens?: number; flows?: number }) => ({
    action: { type: 'confirm' as const, op: real, label: labelFor(real), destructive: isDestructive(real) },
    note: describeOp(real, extra),
  });
  const app = findApp(state, op.app ?? mentioned[0]?.name);
  const noApp = { note: apps.length ? `Which app do you mean? The library has ${apps.map((entry) => entry.name).join(', ')}.` : 'The library has no apps yet.' };

  switch (op.kind) {
    case 'rebuild':
      return confirm({ kind: 'rebuild' });
    case 'upload':
      return { action: { type: 'upload' } };
    case 'open':
      return app ? { action: { type: 'open', href: appHref(app.id), label: `Open ${app.name}` } } : noApp;
    case 'remove-app':
      return app ? confirm({ kind: 'remove-app', appId: app.id, name: app.name }, countsFor(state, app.id)) : noApp;
    case 'set-logo':
      return app ? confirm({ kind: 'set-logo', appId: app.id, name: app.name }) : noApp;
    case 'update-app': {
      if (!app) return noApp;
      const fields: Record<string, string> = {};
      for (const key of ['name', 'tagline', 'industry', 'website'] as const) {
        const value = op.fields?.[key];
        if (typeof value === 'string' && unquote(value)) fields[key] = unquote(value).slice(0, key === 'tagline' ? 160 : 120);
      }
      if (fields.industry) {
        const industries = state?.vocabulary?.industries ?? [];
        const match = industries.find((entry) => entry.toLowerCase() === fields.industry.toLowerCase());
        if (!match) return { note: `“${fields.industry}” is not an industry the library knows — it has ${industries.join(', ')}.` };
        fields.industry = match;
      }
      if (fields.website && !/^https?:\/\//i.test(fields.website)) fields.website = `https://${fields.website}`;
      const current: Record<string, string | undefined> = { name: app.name, tagline: app.tagline, industry: app.industry, website: app.website };
      for (const key of Object.keys(fields)) if ((current[key] ?? '').trim().toLowerCase() === fields[key].toLowerCase()) delete fields[key];
      // Industry is picked from a list; everything else must come from the admin.
      for (const key of Object.keys(fields)) {
        if (key === 'industry') continue;
        if (!grounded(fields[key], grounding.saidByAdmin, key !== 'website' && grounding.askedToInvent)) delete fields[key];
      }
      if (!Object.keys(fields).length) return {};
      return confirm({ kind: 'update-app', appId: app.id, name: app.name, fields });
    }
    case 'rename-screen':
    case 'delete-screen': {
      if (!app) return noApp;
      const screen = findScreen(state, app.id, op.screen);
      if (!screen) {
        const names = [...new Set((state?.files ?? []).filter((file) => file.appId === app.id).map(screenName))];
        return { note: `I can’t find a screen called “${op.screen ?? ''}” in ${app.name}. Its screens are ${names.slice(0, 25).join(', ')}${names.length > 25 ? ', …' : ''}.` };
      }
      if (op.kind === 'delete-screen') return confirm({ kind: 'delete-screen', platform: screen.platform, appId: app.id, file: screen.file, name: screenName(screen) });
      const to = unquote(String(op.to ?? '')).slice(0, 80);
      if (!to || !grounded(to, grounding.saidByAdmin, grounding.askedToInvent)) return {};
      return confirm({ kind: 'rename-screen', platform: screen.platform, appId: app.id, file: screen.file, from: screenName(screen), to });
    }
    case 'rename-flow':
    case 'delete-flow': {
      const owner = op.app ? findApp(state, op.app) : mentioned[0] ?? null;
      const flow = findFlow(state, owner?.id ?? null, op.flow);
      if (!flow) {
        const names = [...new Set((state?.flows ?? []).filter((entry) => !owner || entry.appId === owner.id).map((entry) => entry.name))];
        return { note: `I can’t find a flow called “${op.flow ?? ''}”${owner ? ` in ${owner.name}` : ''}. The flows are ${names.slice(0, 25).join(', ')}${names.length > 25 ? ', …' : ''}.` };
      }
      if (op.kind === 'delete-flow') return confirm({ kind: 'delete-flow', flowId: flow.id, name: flow.name });
      const to = unquote(String(op.to ?? '')).slice(0, 80);
      if (!to || !grounded(to, grounding.saidByAdmin, grounding.askedToInvent)) return {};
      return confirm({ kind: 'rename-flow', flowId: flow.id, from: flow.name, to });
    }
    default:
      return {};
  }
}

// ─── The turn: read the request, then talk ───────────────────────────────────

/** The operation in the reader's reply, however it wrapped it. */
function readOp(text: string): ParsedOp | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  // {"op": {...}}, {"op": null}, {"kind": ...} at the top, or {"op": "kind", ...}.
  const inner = 'op' in parsed ? parsed.op : parsed;
  if (inner === null || inner === undefined) return null;
  if (typeof inner === 'string') return { ...(parsed as ParsedOp), kind: inner };
  if (typeof inner === 'object' && typeof (inner as ParsedOp).kind === 'string') return inner as ParsedOp;
  return null;
}

/** A small model asked to make a tagline up sometimes writes the request back ("Your wish"); that is not a value. */
function isEcho(value: string): boolean {
  const words = norm(value).split(/[^a-z0-9]+/).filter(Boolean);
  return words.length <= 3 && INVENT.test(value);
}

const INVENTOR = `You write one value for an app's field in a design-reference library, as JSON only: {"value": "..."}. A tagline is one short line in the app's own voice, under 60 characters, no trailing period, not a slogan already in use by the app. A name is the app's proper name. Write something fresh each time; never repeat an option the assistant already gave in the conversation.`;

/** What a done-claim from the speaker becomes: an offer, since nothing has happened yet. */
const BASE_VERB: Record<string, string> = {
  updated: 'update', set: 'set', changed: 'change', renamed: 'rename', removed: 'remove', deleted: 'delete', added: 'add', saved: 'save', uploaded: 'upload',
  updating: 'update', setting: 'set', changing: 'change', renaming: 'rename', removing: 'remove', deleting: 'delete', adding: 'add', saving: 'save', uploading: 'upload',
};
function unclaim(text: string): string {
  const base = (verb: string) => BASE_VERB[verb.toLowerCase()] ?? verb;
  return text
    .replace(/\b(I[’']ve|I have|I) (just |now )?(updated|set|changed|renamed|removed|deleted|added|saved|uploaded)\b/gi, (_, _i, _adv, verb: string) => `I can ${base(verb)}`)
    .replace(/\bI[’']m (now )?(updating|setting|changing|renaming|removing|deleting|adding|saving|uploading)\b/gi, (_, _adv, verb: string) => `I can ${base(verb)}`)
    .replace(/(^|[.!?]\s+)(just |now |okay, |ok, )?(updating|setting|changing|renaming|removing|deleting)\b/gi, (_, lead: string, _adv, verb: string) => `${lead}I can ${base(verb)}`)
    .replace(/\b(has|have) been (updated|set|changed|renamed|removed|deleted|saved|uploaded)\b/gi, (_, _aux, verb: string) => `will be ${verb} once you confirm`)
    .replace(/\bis now (set|updated|changed) to\b/gi, 'will be set to')
    .replace(/\b(is|are) (now )?(updated|set|changed|renamed|removed|deleted)\b(?! once)/gi, (_, aux: string, _adv, verb: string) => `will be ${verb} once you confirm`);
}

/** Stage one: what, if anything, is the admin asking to change? JSON, short, unstreamed. */
const READER = `You read one message from the admin of a design-reference library and decide whether it asks for a change to the library. Return JSON only: {"op": …} where ${OP_SCHEMA}
Rules: op is null for questions, chat, thanks, or a bare "yes"/"confirm"/"ok". Adding a new app to the library is done by uploading a screen recording of it, so "add an app", "new app", "add another app" is {"kind": "upload"} — never ask which existing app. Use app, screen and flow names exactly as in the facts. Put values (a tagline, a name, a link) in the op only when the admin actually wrote them, or asked you to make one up ("suggest", "your wish", "another") — then write a good one (a tagline: one line in the app's voice, under 60 characters). Never invent a link. If a value is missing, still return the op with "fields": {} (or no "to"), so the assistant knows what to ask for. Use the recent conversation: "make it X" after a request about a tagline means that tagline.`;

/** Stage two: the assistant's own words, streamed as plain text. */
const PERSONA = `You are the Motvin assistant: the helper inside Motvin Inspirations, a design-reference library like Mobbin. You talk with the library's admin the way a sharp, friendly colleague would — warm, brief, specific, plain English, no markdown, never stiff or repetitive; if the same thing comes up twice, say it differently and add something useful. Use the facts you are given; never invent apps, screens, flows, runs, links or numbers.

You cannot change anything yourself. Each turn you are told what the assistant is offering the admin (a change with a Confirm button), or what it still needs, or that nothing is being changed. Speak to exactly that: if there is an offer, describe it in your words as something that will happen when they confirm — never as done — and end by inviting them to confirm; if something is missing, ask for that one thing; if nothing is being changed, just answer or chat. When asked for ideas — a tagline, a name — give two or three good options in one breath. Two or three sentences at most.`;

export async function answerQuestion(
  input: { question: string; authorization: string | null; history?: HistoryLine[]; pending?: string | null; heldImage?: string | null },
  onToken?: (piece: string) => void,
): Promise<AssistantAnswer> {
  const question = input.question.trim();
  const history = (input.history ?? []).slice(-12);
  const now = Date.now();
  const jobs = listJobs();
  const active = jobs.find((job) => job.status === 'running' || job.status === 'uploading') ?? null;

  // The one shortcut: the word "upload" just opens the picker.
  if (/^(upload|upload (a |another )?(video|recording))\s*[.!]?$/i.test(question)) {
    return { source: 'rules', text: active ? `A run is already going — ${describeJob(active, now)} One at a time keeps the Mac usable.` : 'Sure — pick a screen recording (MOV or MP4) and I’ll get going on it.', actions: active ? [] : [{ type: 'upload' }] };
  }

  const [ai, state] = await Promise.all([cachedAiStatus(), libraryState(input.authorization)]);

  if (!ai?.usable) {
    const lines = [active ? describeJob(active, now) : jobs[0] ? `Nothing is running. Last run: ${describeJob(jobs[0], now)}` : 'Nothing is running.', `For anything more I need the model, and ${describeAi(ai)}.`];
    return { source: 'rules', text: lines.join(' '), actions: [] };
  }

  const apps = state?.apps ?? [];
  const adminWords = [...history.filter((line) => line.role === 'user').map((line) => line.text), question].join('\n');
  const everything = norm(`${question} ${history.map((line) => line.text).join(' ')}`);
  const mentioned = apps.filter((app) => everything.includes(norm(app.name)));
  const detail = mentioned
    .slice(0, 2)
    .map((app) => {
      const screens = [...new Set((state?.files ?? []).filter((file) => file.appId === app.id).map(screenName))];
      const flows = [...new Set((state?.flows ?? []).filter((flow) => flow.appId === app.id).map((flow) => flow.name))];
      return `${app.name}: tagline “${app.tagline ?? ''}”, industry ${app.industry ?? '?'}, website/App Store link ${app.website ?? 'none'}, logo ${app.logo ? 'set' : 'none'}, ${screens.length} screens, ${flows.length} flows.\n  Screen names: ${screens.slice(0, 80).join(' | ') || 'none'}\n  Flow names: ${flows.slice(0, 60).join(' | ') || 'none'}`;
    })
    .join('\n');
  const counts = state?.counts ?? null;
  const facts = [
    `Today: ${new Date(now).toISOString().slice(0, 10)}.`,
    counts ? `Library: ${counts.screens ?? 0} screens, ${counts.apps ?? 0} apps, ${counts.flows ?? 0} flows, ${counts.patterns ?? 0} patterns.` : null,
    `Apps: ${apps.map((app) => `${app.name}${app.tagline ? ` (“${app.tagline}”)` : ''}`).join('; ') || 'none yet'}.`,
    `Editable app fields: name, tagline, industry (one of ${(state?.vocabulary?.industries ?? []).join(', ')}), website — the app's link, which is also what the “View in App Store” button opens.`,
    detail,
    `AI: ${describeAi(ai)}.`,
    jobs.length ? `Runs, newest first:\n${jobs.slice(0, 4).map((job) => `- ${describeJob(job, now)}`).join('\n')}` : 'Runs: none since the server started.',
    input.pending ? `An offer is waiting for the admin's Confirm: “${input.pending}”.` : 'Nothing is waiting for confirmation right now.',
    input.heldImage ? `The admin has dropped an image named “${input.heldImage}” on the assistant; “this” or “this image” means it.` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const conversation = history.length ? history.map((line) => `${line.role === 'user' ? 'Admin' : 'Assistant'}: ${line.text}`).join('\n') : '(start of conversation)';

  // Stage one: is a change being asked for, and does it hold up? A bare
  // "yes" or "confirm" is never a new request — the dock settles those when
  // something is waiting, so reaching here means nothing was.
  const bareYes = /^(yes|y|yeah|yep|ok|okay|sure|confirm|do it|go ahead|proceed|update|done)\s*[.!]?$/i.test(question);
  // Adding an app is always the same thing: a screen recording of it.
  const addingApp = /\b(add|create|new|another|upload|import|ingest)\b[^.?!]*\b(app|application|recording|video)\b|\bnew app\b/i.test(question) && !/\b(tagline|logo|website|link|screen|flow|name|industry)\b/i.test(question);
  let parsedOp: ParsedOp | null = addingApp ? { kind: 'upload' } : null;
  if (!bareYes && !addingApp) {
    try {
      const read = await askModel(READER, `Facts:\n${facts}\n\nConversation so far:\n${conversation}\n\nAdmin: ${question}`, 220, undefined, { raw: true });
      parsedOp = read.text ? readOp(read.text) : null;
    } catch {
      parsedOp = null;
    }
  }
  const askedToInvent = INVENT.test(adminWords);
  // A tagline asked for without a value gets a suggestion — that is what a
  // helpful colleague would do — and the admin can type their own instead.
  // A name is only invented when they ask for ideas. The reader often fills
  // a blank with the app's current value or with the request itself
  // ("Your wish"); neither is a value.
  let invented: string | null = null;
  if (parsedOp?.kind === 'update-app') {
    const fields = (parsedOp.fields ?? {}) as Record<string, unknown>;
    const app = findApp(state, parsedOp.app ?? mentioned[0]?.name);
    const current: Record<string, string | undefined> = { tagline: app?.tagline, name: app?.name };
    for (const key of ['tagline', 'name'] as const) {
      const value = typeof fields[key] === 'string' ? unquote(fields[key] as string) : '';
      const wanted = key in fields || new RegExp(`\\b${key}`, 'i').test(question);
      if (!wanted) continue;
      const usable = value && !isEcho(value) && norm(value) !== norm(current[key] ?? '') && grounded(value, adminWords, askedToInvent);
      if (usable) continue;
      if (key === 'name' && !askedToInvent) {
        delete fields[key];
        continue;
      }
      try {
        const made = await askModel(INVENTOR, `App: ${app?.name ?? parsedOp.app ?? ''}. Field: ${key}. Current ${key}: “${current[key] ?? ''}”. Facts:\n${facts}\n\nConversation so far:\n${conversation}\n\nAdmin: ${question}`, 80, undefined, { raw: true });
        const value2 = made.text ? (readOpValue(made.text) ?? '') : '';
        if (value2 && norm(value2) !== norm(current[key] ?? '')) {
          fields[key] = value2;
          invented = key;
        } else delete fields[key];
      } catch {
        delete fields[key];
      }
    }
    parsedOp.fields = fields;
  }
  let action: AssistantAction | undefined;
  let situation: string;
  if (bareYes) {
    situation = 'Nothing is waiting for confirmation, so there is nothing to confirm. Say so in a friendly way and ask what they would like to do.';
  } else if (parsedOp) {
    const checked = validateOp(parsedOp, state, mentioned, { saidByAdmin: adminWords, askedToInvent: askedToInvent || invented !== null });
    if (checked.action) {
      action = checked.action;
      situation =
        checked.action.type === 'confirm'
          ? `You are offering this change, which the admin sees with a Confirm button: ${checked.note ?? checked.action.label}${invented ? ` The ${invented} is your own suggestion, since they did not give one — present it as a suggestion, and say they can type their own instead.` : ''}`
          : checked.action.type === 'open'
            ? `You are handing the admin a link: ${checked.action.label}.`
            : `Adding an app to the library means uploading a screen recording of it; the app, its screens and its flows are all worked out from the video, and a free AI names them. You are showing the admin an "Upload a video" button now. In one or two sentences, tell them to record themselves walking through the app on the phone with screen recording on, pausing a moment on each screen, then drop the MOV or MP4 here. Do not ask which existing app they mean.`;
    } else {
      situation = `The admin asked for a change but it cannot be offered yet, because something is missing. ${checked.note ?? missingValueQuestion(parsedOp, state, mentioned)} Ask for exactly that, in your own words. Do not ask whether they want to keep anything as it is.`;
    }
  } else {
    situation = 'No change is being made this turn. Just answer, help, or chat.';
  }

  // Stage two: say it.
  let raw: { text: string | null; model?: string; streamed?: boolean };
  try {
    raw = await askModel(PERSONA, `Facts:\n${facts}\n\nConversation so far:\n${conversation}\n\nAdmin: ${question}\n\nThis turn: ${situation}`, 260, onToken);
  } catch (error) {
    // The words failed but the offer stands; a plain sentence carries it.
    const text = action ? (situation.replace(/^You are offering[^:]*: /, '') + ' Press Confirm, or say yes.') : `The model did not answer (${(error as Error).message}).`;
    onToken?.(text);
    return { source: 'rules', text, actions: action ? [action] : [] };
  }
  let text = unclaim((raw.text ?? '').trim()) || (action ? `${situation.replace(/^You are offering[^:]*: /, '')} Press Confirm, or say yes.` : 'Sorry — I lost my thread there. Could you say that once more?');
  if (action && action.type === 'confirm' && !/confirm/i.test(text)) text = `${text} Confirm and it’s set.`;
  if (!action && PROMISES.test(text)) {
    // A promise with nothing behind it: ask for what is missing instead.
    const ask = missingValueQuestion(parsedOp, state, mentioned);
    text = `${text.replace(PROMISES, '').replace(/\s{2,}/g, ' ').trim()} ${ask}`.trim();
    onToken?.(` ${ask}`);
  }
  return { source: 'ai', text, actions: action ? [action] : [], model: raw.model, streamed: raw.streamed === true };
}

/** Sentences that sound like an offer the admin could confirm, or a claim that it happened. */
const PROMISES = /\b(confirm(ing)? (and|if|it)[^.!?]*[.!?]?|here[’']s (one|the update)[^.!?]*[.!?]?|it[’']s set[.!?]?|updating [^.!?]*[.!?]?|I can (update|set|change|rename|remove|delete)[^.!?]*[.!?]?|will be (set|updated|changed) [^.!?]*[.!?]?)/gi;

/** The value in the inventor's reply. */
function readOpValue(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as { value?: unknown };
    return typeof parsed.value === 'string' && parsed.value.trim() ? unquote(parsed.value).slice(0, 160) : null;
  } catch {
    return null;
  }
}

/** The one question to ask when an operation arrived without its value. */
function missingValueQuestion(op: ParsedOp | null, state: LibraryState | null, mentioned: StateApp[]): string {
  const app = op?.app ? findApp(state, op.app) : mentioned[0] ?? null;
  const who = app?.name ?? 'the app';
  switch (op?.kind) {
    case 'update-app': {
      const key = Object.keys(op.fields ?? {})[0];
      if (key === 'website') return `What’s the link for ${who}? Paste the App Store or website URL and I’ll set it.`;
      if (key) return `They want a new ${key} for ${who} but have not said what it should be. Ask what the new ${key} should be.`;
      return `What would you like to change on ${who} — the name, tagline, industry or link — and to what?`;
    }
    case 'rename-screen':
      return `What should that screen in ${who} be called?`;
    case 'rename-flow':
      return 'What should the flow be called?';
    default:
      return app ? `What exactly should I change on ${who}, and to what?` : 'Which app is this about, and what should I change?';
  }
}
