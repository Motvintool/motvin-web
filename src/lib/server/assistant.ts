import type { AiStatus, IngestJob } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { INGEST_STAGES, platformIn, stageIndex } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { describeOp, isDestructive, labelFor, type AdminOp, type AssistantAction, type Expect } from '@/lib/inspirations/admin-chatbot/assistantActions';
import { askModel, cachedAiStatus } from '@/lib/server/ai';
import { backendBase } from '@/lib/server/adminAuth';
import { listJobs } from '@/lib/server/ingestJobs';
import { splitScreenFile } from '@/lib/inspirations/screenPaths';
import { dayLabel, localDateString, parseDateInput, parseDatesIn } from '@/lib/inspirations/dates';
import { runAgent } from '@/lib/server/agent';

/**
 * The admin assistant — a conversation, not a menu.
 *
 * With a tool-capable model installed, each turn is handled by the agent in
 * agent.ts: the model looks things up with read tools and proposes a change
 * with a write tool, and only the validation here (validateOp) and the
 * Confirm button stand between it and the library. What follows in this
 * file is that validation, the facts and helpers both paths share, and the
 * older single-pass pipeline that stands in when no such model is there.
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

export type AssistantAnswer = {
  text: string;
  source: 'rules' | 'ai';
  actions: AssistantAction[];
  model?: string;
  streamed?: boolean;
  /** What to take the admin's next message as; null clears an earlier one. */
  expect?: Expect | null;
};

export type HistoryLine = { role: 'user' | 'assistant'; text: string };
/**
 * Where a reply's words go as they are written. A control instead of words:
 * 'fold' moves what has streamed so far into the reply's thinking thread (it
 * was the model working, not its answer); a 'step' adds one line to that
 * thread — a lookup made, a change checked.
 */
export type TokenControl = { kind: 'fold' } | { kind: 'step'; text: string; detail?: string };
export type TokenSink = (piece: string, control?: TokenControl) => void;

type Counts = { screens?: number; apps?: number; flows?: number; patterns?: number };
type StateAppVersion = { id: string; label: string; capturedAt: string; isLatest: boolean };
type StateApp = {
  id: string;
  name: string;
  tagline?: string;
  industry?: string;
  website?: string;
  logo?: string;
  versions?: StateAppVersion[];
  currentVersion?: string | null;
};
type StateFlow = { id: string; appId: string; name: string; platform?: string; parentId?: string | null; screenIds?: string[] };
type StateFile = { id?: string; appId: string; platform: string; file: string; version?: string; published?: boolean; sidecar?: { name?: string; tags?: string[] } | null };
export type LibraryState = {
  counts?: Counts;
  apps?: StateApp[];
  flows?: StateFlow[];
  files?: StateFile[];
  sources?: Record<string, { status?: string }>;
  vocabulary?: { industries?: string[]; screenTypes?: string[]; flowCategories?: string[]; reviewStatuses?: string[]; styles?: string[] };
};

/** Pages the assistant can send the admin to. */
const PAGES: Record<string, string> = {
  explore: '/inspirations',
  home: '/inspirations',
  gallery: '/inspirations',
  apps: '/inspirations/apps',
  screens: '/inspirations/screens',
  'ui elements': '/inspirations/ui-elements',
  elements: '/inspirations/ui-elements',
  flows: '/inspirations/flows',
  patterns: '/inspirations/patterns',
  collections: '/inspirations/collections',
  saved: '/inspirations/collections',
  admin: '/inspirations/admin',
};

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

/**
 * Every screen of an app going by a name, best tier of match first — exact,
 * then starts-with, then contains. The same screen name recurs across an
 * app's versions (every capture has a splash screen), so callers that were
 * not told a version need the whole set to know whether to ask which one.
 */
function screensCalled(state: LibraryState | null, appId: string, wanted: string | undefined | null): StateFile[] {
  const files = (state?.files ?? []).filter((file) => file.appId === appId);
  // A screen's own link, pasted in, names it exactly:
  // …/api/inspirations/screens/<platform>/<app>/<stored path>?v=…
  const link = (wanted ?? '').match(/\/api\/inspirations\/screens\/([a-z]+)\/([^/\s]+)\/([^\s?#]+)/i);
  if (link) {
    const [, platform, , path] = link;
    const exact = files.filter((file) => file.file === decodeURIComponent(path) && file.platform.toLowerCase() === platform.toLowerCase());
    if (exact.length) return exact;
  }
  const needle = norm(wanted ?? '');
  if (!needle) return [];
  const tiers = [
    files.filter((file) => norm(screenName(file)) === needle || norm(file.file) === needle),
    files.filter((file) => norm(screenName(file)).startsWith(needle)),
    files.filter((file) => norm(screenName(file)).includes(needle) || norm(file.file).includes(needle)),
  ];
  return tiers.find((tier) => tier.length) ?? [];
}

function findScreen(state: LibraryState | null, appId: string, wanted: string | undefined | null, versionId?: string | null): StateFile | null {
  const pool = screensCalled(state, appId, wanted);
  return (versionId ? pool.find((file) => file.version === versionId) : pool[0]) ?? null;
}

function findFlow(state: LibraryState | null, appId: string | null, wanted: string | undefined | null): StateFlow | null {
  const needle = norm(wanted ?? '');
  if (!needle) return null;
  const flows = (state?.flows ?? []).filter((flow) => !appId || flow.appId === appId);
  return flows.find((flow) => norm(flow.name) === needle || flow.id === needle) ?? flows.find((flow) => norm(flow.name).startsWith(needle)) ?? flows.find((flow) => norm(flow.name).includes(needle)) ?? null;
}

/** "Latest"/"newest"/"current", an exact id, a written date ("Sep 29", "29/09/2026"), or a label ("29 Sep 2026"), matched loosely. */
function matchVersion(versions: StateAppVersion[], wanted: string): StateAppVersion | null {
  const needle = norm(wanted).replace(/^(the |its |update )+/, '').replace(/ (version|capture)$/, '');
  const asDate = parseDateInput(wanted);
  return (
    (/^(latest|newest|current|most recent)$/.test(needle) ? versions.find((v) => v.isLatest) : null) ??
    versions.find((v) => v.id === needle) ??
    (asDate ? versions.find((v) => v.id === asDate) : null) ??
    versions.find((v) => norm(v.label) === needle) ??
    versions.find((v) => norm(v.label).includes(needle) || needle.includes(norm(v.label))) ??
    null
  );
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
  {"kind": "create-app", "to": "<the new app's name>", "industry": "<industry from the allowed list, or null>"}
  {"kind": "set-logo", "app": "<app name>"}
  {"kind": "remove-app", "app": "<app name>"}
  {"kind": "rebuild"}
  {"kind": "rename-screen", "app": "<app name>", "screen": "<current screen name>", "to": "<new name>", "version": "<the version the screen is in — an id, a date like 'Sep 29', 'latest' — or null if none was named>"}
  {"kind": "delete-screen", "app": "<app name>", "screen": "<screen name>", "version": "<version the screen is in, or null>"}
  {"kind": "rename-flow", "app": "<app name or null>", "flow": "<current flow name>", "to": "<new name>"}
  {"kind": "delete-flow", "app": "<app name or null>", "flow": "<flow name>"}
  {"kind": "set-screen-type", "app": "<app name>", "screen": "<screen name>", "to": "<screen type from the allowed list>", "version": "<version the screen is in, or null>"}
  {"kind": "set-flow-category", "app": "<app name or null>", "flow": "<flow name>", "to": "<flow category from the allowed list>"}
  {"kind": "set-screen-tags", "app": "<app name>", "screen": "<screen name>", "tags": ["..."], "mode": "add" | "replace", "version": "<version the screen is in, or null>"}
  {"kind": "set-screen-description", "app": "<app name>", "screen": "<screen name>", "to": "<description>", "version": "<version the screen is in, or null>"}
  {"kind": "set-screen-details", "app": "<app name>", "screen": "<screen name>", "version": "<version the screen is in, or null>", "capturedAt": "<the capture date the admin wrote, or null>", "elements": ["<component names>", ...] or null, "style": ["<style from the allowed list>", ...] or null}
  {"kind": "add-to-flow", "app": "<app name>", "flow": "<flow name>", "screens": ["<screen name>", ...]}
  {"kind": "remove-from-flow", "app": "<app name>", "flow": "<flow name>", "screens": ["<screen name>", ...]}
  {"kind": "create-flow", "app": "<app name>", "to": "<new flow name>", "category": "<flow category or null>", "screens": ["<screen name>", ...]}
  {"kind": "reorder-flow", "app": "<app name or null>", "flow": "<flow name>", "screen": "<the one step to move, or null>", "position": <1-based number, "first", "last", or null>, "before": "<step it goes before, or null>", "after": "<step it goes after, or null>", "screens": ["<every step in the new order>", ...] or null}
  {"kind": "set-flow-parent", "app": "<app name or null>", "flow": "<flow name>", "parent": "<parent flow name, or null for top level>"}
  {"kind": "set-source-status", "app": "<app name>", "to": "pending" | "review" | "approved" | "rejected"}
  {"kind": "delete-app-version", "app": "<app name>", "to": "<a version id, a date like 'Sep 29 2026', or 'latest'>"}
  {"kind": "rename-app-version", "app": "<app name>", "version": "<the version to change: id, date, or 'latest'>", "to": "<the new date the admin wrote, e.g. '2026-09-30' or '30 Sep 2026', or null>"}
  {"kind": "stop-run"}
  {"kind": "research-app", "app": "<app name>"}
  {"kind": "set-ai", "model": "<model name or null>", "enabled": true | false | null}
  {"kind": "add-screen", "app": "<app name>", "version": "<version to add it to, or null for the newest>"}
  {"kind": "upload"}
  {"kind": "open", "app": "<app name or null>", "page": "<explore|apps|screens|ui elements|flows|patterns|collections|admin, or null>"}`;

export type ParsedOp = {
  kind?: string;
  app?: string | null;
  fields?: Record<string, unknown>;
  screen?: string;
  flow?: string;
  to?: string;
  /** For screen ops, the version the screen is in; for rename-app-version, the version to change. */
  version?: string | null;
  tags?: unknown;
  mode?: string;
  screens?: unknown;
  category?: string | null;
  parent?: string | null;
  page?: string | null;
  model?: string | null;
  position?: number | string | null;
  before?: string | null;
  after?: string | null;
  capturedAt?: string | null;
  elements?: unknown;
  style?: unknown;
  industry?: string | null;
  enabled?: boolean | null;
};

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
  grounding: { saidByAdmin: string; askedToInvent: boolean; fallbackApp?: string | null; jobs?: IngestJob[]; ai?: AiStatus | null; question?: string } = { saidByAdmin: '', askedToInvent: true },
): { action?: AssistantAction; note?: string; settled?: boolean; missingApp?: boolean } {
  const apps = state?.apps ?? [];
  const names = (value: unknown): string[] => (Array.isArray(value) ? value.map((entry) => String(entry).trim()).filter(Boolean) : typeof value === 'string' && value.trim() ? value.split(/,|\band\b/).map((entry) => entry.trim()).filter(Boolean) : []);
  const screensNamed = (appId: string, wanted: string[]) => {
    const found: StateFile[] = [];
    const missing: string[] = [];
    for (const name of wanted) {
      const screen = findScreen(state, appId, name);
      if (screen && screen.id) found.push(screen);
      else missing.push(name);
    }
    return { found, missing };
  };
  const versionLabel = (v: StateAppVersion | undefined): string => (v ? (v.isLatest ? `Latest (${v.label})` : v.label) : '');
  const versionList = (versions: StateAppVersion[]) => versions.map(versionLabel).join(', ') || 'none';
  const namedVersion = typeof op.version === 'string' && op.version.trim() && !/^(null|none|any|all)$/i.test(op.version.trim()) ? op.version.trim() : '';
  // The screen an op names, inside the version it names. With no version
  // named and the same screen name in several versions, that is a question
  // back to the admin, not a silent guess at the newest one.
  const pickScreen = (owner: StateApp, wanted: string | undefined): { screen?: StateFile; note?: string } => {
    const versions = owner.versions ?? [];
    const inVersion = namedVersion ? matchVersion(versions, namedVersion) : null;
    if (namedVersion && !inVersion) return { note: `${owner.name} has no “${namedVersion}” version — its versions are ${versionList(versions)}.` };
    const pool = screensCalled(state, owner.id, wanted).filter((file) => !inVersion || file.version === inVersion.id);
    if (!pool.length) {
      const names = [...new Set((state?.files ?? []).filter((file) => file.appId === owner.id && (!inVersion || file.version === inVersion.id)).map(screenName))];
      return { note: `I can’t find a screen called “${wanted ?? ''}” in ${owner.name}${inVersion ? `’s ${versionLabel(inVersion)} version` : ''}. Its screens are ${names.slice(0, 25).join(', ')}${names.length > 25 ? ', …' : ''}.` };
    }
    const spread = [...new Set(pool.map((file) => file.version ?? ''))];
    if (!inVersion && spread.length > 1) {
      const where = spread.map((id) => versionLabel(versions.find((v) => v.id === id)) || id);
      return { note: `${owner.name} has a “${screenName(pool[0])}” in ${spread.length} versions — ${where.join(', ')}. Which version do you mean?` };
    }
    return { screen: pool[0] };
  };
  const confirm = (real: AdminOp, extra?: { screens?: number; flows?: number }) => ({
    action: { type: 'confirm' as const, op: real, label: labelFor(real), destructive: isDestructive(real) },
    note: describeOp(real, extra),
  });
  // An app the reader named must exist; only when it named none does the
  // conversation's app stand in. Silently retargeting another app is the
  // one thing this must never do.
  const named = typeof op.app === 'string' && op.app.trim() && !/^(this|that|it|the app|app|null)$/i.test(op.app.trim()) ? op.app.trim() : null;
  const app = named ? findApp(state, named) : findApp(state, mentioned[0]?.name) ?? (grounding.fallbackApp ? findApp(state, grounding.fallbackApp) : null);
  const noApp = {
    note: named && !app
      ? `There’s no app called “${named}” in the library${apps.length ? ` — it has ${apps.map((entry) => entry.name).join(', ')}` : ''}.`
      : apps.length
        ? `Which app do you mean? The library has ${apps.map((entry) => entry.name).join(', ')}.`
        : 'The library has no apps yet.',
    missingApp: Boolean(named && !app),
  };

  switch (op.kind) {
    case 'rebuild':
      return confirm({ kind: 'rebuild' });
    case 'upload':
      return { action: { type: 'upload' } };
    case 'open': {
      const page = op.page ? PAGES[norm(op.page)] : null;
      if (page) return { action: { type: 'open', href: page, label: `Open ${norm(op.page!)}` } };
      return app ? { action: { type: 'open', href: appHref(app.id), label: `Open ${app.name}` } } : noApp;
    }
    case 'add-screen': {
      if (!app) return noApp;
      // The platform named in this message, else the one the app already has
      // most screens on; the version named, else the newest.
      const files = (state?.files ?? []).filter((file) => file.appId === app.id);
      const tally = new Map<string, number>();
      for (const file of files) tally.set(file.platform, (tally.get(file.platform) ?? 0) + 1);
      const platform = platformIn(grounding.question ?? '') ?? [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'ios';
      const versions = app.versions ?? [];
      const target = namedVersion ? matchVersion(versions, namedVersion) : versions.find((v) => v.isLatest) ?? null;
      if (namedVersion && !target) return { note: `${app.name} has no “${namedVersion}” version — its versions are ${versionList(versions)}.` };
      return confirm({ kind: 'add-screen', appId: app.id, name: app.name, platform, versionId: target?.id, versionLabel: target ? versionLabel(target) : undefined });
    }
    case 'research-app':
      return app ? confirm({ kind: 'research-app', appId: app.id, name: app.name }) : noApp;
    case 'stop-run': {
      const running = (grounding.jobs ?? []).find((job) => job.status === 'running' || job.status === 'uploading');
      if (!running) return { note: 'Nothing is running right now, so there is nothing to stop.', settled: true };
      return confirm({ kind: 'stop-run', jobId: running.id, title: running.title });
    }
    case 'set-ai': {
      if (op.enabled === false) return confirm({ kind: 'set-ai', enabled: false });
      const model = typeof op.model === 'string' ? op.model.trim() : '';
      if (!model) return op.enabled === true ? confirm({ kind: 'set-ai', enabled: true }) : { note: `Which model? The server lists ${(grounding.ai?.models ?? []).join(', ') || 'no models'}.` };
      const listed = grounding.ai?.models ?? [];
      const match = listed.find((entry) => entry.toLowerCase() === model.toLowerCase()) ?? listed.find((entry) => entry.toLowerCase().startsWith(model.toLowerCase()));
      if (!match) return { note: `“${model}” is not a model the server lists — it has ${listed.join(', ') || 'none'}.` };
      return confirm({ kind: 'set-ai', chatModel: match, enabled: true });
    }
    case 'set-source-status': {
      if (!app) return noApp;
      const statuses = state?.vocabulary?.reviewStatuses ?? ['pending', 'review', 'approved', 'rejected'];
      const wanted = norm(String(op.to ?? '')).replace(/^(in )?review$/, 'review').replace(/^approve[d]?$/, 'approved').replace(/^reject(ed)?$/, 'rejected');
      const match = statuses.find((entry) => entry === wanted) as 'pending' | 'review' | 'approved' | 'rejected' | undefined;
      if (!match) return { note: `A source status is one of ${statuses.join(', ')}.` };
      const current = state?.sources?.[app.id]?.status;
      if (current === match) return { note: `${app.name} is already marked ${match}.`, settled: true };
      return confirm({ kind: 'set-source-status', appId: app.id, name: app.name, status: match });
    }
    case 'delete-app-version': {
      if (!app) return noApp;
      const versions = app.versions ?? [];
      const wantedVersion = [op.to, op.version].map((value) => (typeof value === 'string' ? value.trim() : '')).find((value) => value && !/^(null|none)$/i.test(value)) ?? '';
      const saidVersion = /\b(version|capture|date|snapshot|release)\b/i.test(grounding.question ?? '');
      // No version named, and none spoken of: they mean the app. Asking
      // "which version?" here is how "delete Swiggy" turned into a quiz.
      if (!wantedVersion && !saidVersion) return confirm({ kind: 'remove-app', appId: app.id, name: app.name }, countsFor(state, app.id));
      // Its only version is the app: say so, and offer that plainly.
      if (versions.length <= 1) {
        const whole = confirm({ kind: 'remove-app', appId: app.id, name: app.name }, countsFor(state, app.id));
        return { ...whole, note: `${app.name} has only one version${versions[0] ? ` (${versions[0].label})` : ''}, so removing it is the same as removing ${app.name} itself. ${whole.note}` };
      }
      const match = wantedVersion ? matchVersion(versions, wantedVersion) : null;
      if (!match) return { note: `Which of ${app.name}’s versions? They are ${versionList(versions)}.` };
      const screens = (state?.files ?? []).filter((f) => f.appId === app.id && f.version === match.id).length;
      return confirm({
        kind: 'delete-app-version',
        appId: app.id,
        name: app.name,
        versionId: match.id,
        versionLabel: match.isLatest ? 'Latest' : match.label,
        screens,
      });
    }
    case 'rename-app-version': {
      if (!app) return noApp;
      const versions = app.versions ?? [];
      if (!versions.length) return { note: `${app.name} has no versions yet.`, settled: true };
      const said = grounding.question ?? '';
      const saidDates = parseDatesIn(said);
      // "Change X's <A> version to <B>": the version named (or the first date
      // written) is the one to move; the date written after "to" is where it
      // goes. Both come from the admin's own words, never the reader's guess.
      const from =
        (namedVersion ? matchVersion(versions, namedVersion) : null) ??
        (saidDates.length ? matchVersion(versions, saidDates[0]) : null) ??
        (versions.length === 1 ? versions[0] : null);
      if (!from) return { note: `Which of ${app.name}’s versions? They are ${versionList(versions)}.` };
      const afterTo = said.match(/\b(?:to|into|as|becomes?)\s+([^.!?]+)$/i)?.[1] ?? '';
      const to = parseDateInput(afterTo) ?? (saidDates.length >= 2 ? saidDates[saidDates.length - 1] : null);
      if (!to) return {};
      if (to === from.id) return { note: `${app.name}’s ${versionLabel(from)} version is already dated ${dayLabel(to)}.`, settled: true };
      if (versions.some((v) => v.id === to)) return { note: `${app.name} already has a version dated ${dayLabel(to)} — pick a different date.` };
      return confirm({ kind: 'rename-app-version', appId: app.id, name: app.name, versionId: from.id, versionLabel: versionLabel(from), newVersionId: to, newVersionLabel: dayLabel(to) });
    }
    case 'set-screen-tags':
    case 'set-screen-description': {
      if (!app) return noApp;
      const picked = pickScreen(app, op.screen);
      if (!picked.screen) return { note: picked.note };
      const screen = picked.screen;
      if (op.kind === 'set-screen-description') {
        const description = unquote(String(op.to ?? '')).slice(0, 600);
        if (!description || !grounded(description, grounding.saidByAdmin, grounding.askedToInvent)) return {};
        const descFile = splitScreenFile(screen.file, screen.version ?? '');
        return confirm({ kind: 'set-screen-description', platform: screen.platform, appId: app.id, file: descFile.name, version: descFile.version, flow: descFile.flow, name: screenName(screen), description });
      }
      const tags = [...new Set(names(op.tags).map((tag) => tag.toLowerCase().replace(/[^a-z0-9 &-]/g, '').trim()).filter(Boolean))].slice(0, 12);
      if (!tags.length) return {};
      const tagsFile = splitScreenFile(screen.file, screen.version ?? '');
      return confirm({ kind: 'set-screen-tags', platform: screen.platform, appId: app.id, file: tagsFile.name, version: tagsFile.version, flow: tagsFile.flow, name: screenName(screen), tags, mode: op.mode === 'replace' ? 'replace' : 'add' });
    }
    case 'add-to-flow':
    case 'remove-from-flow': {
      const owner = app;
      const flow = findFlow(state, owner?.id ?? null, op.flow);
      if (!flow) return { note: `I can’t find a flow called “${op.flow ?? ''}”${owner ? ` in ${owner.name}` : ''}.` };
      const wantedScreens = names(op.screens).length ? names(op.screens) : op.screen ? [String(op.screen)] : [];
      const { found, missing } = screensNamed(flow.appId, wantedScreens);
      if (!found.length) return { note: missing.length ? `I can’t find ${missing.map((name) => `“${name}”`).join(', ')} among ${flow.appId}’s screens.` : 'Which screens?' };
      const ids = found.map((screen) => screen.id!);
      const nameList = found.map(screenName);
      const already = (flow.screenIds ?? []).filter((id) => ids.includes(id));
      if (op.kind === 'add-to-flow' && already.length === ids.length) return { note: `${nameList.map((name) => `“${name}”`).join(', ')} ${ids.length === 1 ? 'is' : 'are'} already in “${flow.name}”.`, settled: true };
      if (op.kind === 'remove-from-flow' && !already.length) return { note: `${nameList.map((name) => `“${name}”`).join(', ')} ${ids.length === 1 ? 'is' : 'are'} not in “${flow.name}”.`, settled: true };
      const real: AdminOp = op.kind === 'add-to-flow' ? { kind: 'add-to-flow', flowId: flow.id, flowName: flow.name, screenIds: ids, screenNames: nameList } : { kind: 'remove-from-flow', flowId: flow.id, flowName: flow.name, screenIds: ids, screenNames: nameList };
      const result = confirm(real);
      return missing.length ? { ...result, note: `${result.note} (I couldn’t find ${missing.map((name) => `“${name}”`).join(', ')}.)` } : result;
    }
    case 'create-flow': {
      if (!app) return noApp;
      const name = unquote(String(op.to ?? '')).slice(0, 80);
      if (!name || !grounded(name, grounding.saidByAdmin, grounding.askedToInvent)) return {};
      if (findFlow(state, app.id, name)?.name.toLowerCase() === name.toLowerCase()) return { note: `${app.name} already has a flow called “${name}”.`, settled: true };
      const categories = state?.vocabulary?.flowCategories ?? [];
      const category = categories.find((entry) => norm(entry) === norm(String(op.category ?? ''))) ?? (categories.includes('other') ? 'other' : categories[0] ?? 'other');
      const { found } = screensNamed(app.id, names(op.screens).length ? names(op.screens) : op.screen ? [String(op.screen)] : []);
      // A flow is one app on one platform: the platform of the screens it
      // starts with, else the one named, else the app's own.
      const platform = found[0]?.platform ?? platformIn(grounding.question ?? '') ?? (state?.files ?? []).find((file) => file.appId === app.id)?.platform ?? 'ios';
      return confirm({ kind: 'create-flow', appId: app.id, appName: app.name, name, category, platform, screenIds: found.map((screen) => screen.id!), screenNames: found.map(screenName) });
    }
    case 'reorder-flow': {
      const owner = op.app ? findApp(state, op.app) : mentioned[0] ?? null;
      const flow = findFlow(state, owner?.id ?? null, op.flow);
      if (!flow) return { note: `I can’t find a flow called “${op.flow ?? ''}”${owner ? ` in ${owner.name}` : ''}.` };
      const current = flow.screenIds ?? [];
      const steps = current.map((id) => (state?.files ?? []).find((file) => file.id === id)).filter((file): file is StateFile => Boolean(file));
      const nameOf = (id: string) => screenName(steps.find((file) => file.id === id) ?? { appId: flow.appId, platform: 'ios', file: id });
      // Steps are matched among the flow's own screens only — the same name
      // exists in the app's other versions, and those are not steps here.
      const stepNamed = (wanted: string) => {
        const needle = norm(wanted);
        return steps.find((file) => norm(screenName(file)) === needle) ?? steps.find((file) => norm(screenName(file)).startsWith(needle)) ?? steps.find((file) => norm(screenName(file)).includes(needle)) ?? null;
      };
      let next: string[] | null = null;
      const fullOrder = names(op.screens);
      if (fullOrder.length >= 2) {
        const ids: string[] = [];
        const missing: string[] = [];
        for (const wanted of fullOrder) {
          const step = stepNamed(wanted);
          if (step?.id && !ids.includes(step.id)) ids.push(step.id);
          else if (!step) missing.push(wanted);
        }
        if (missing.length) return { note: `${missing.map((entry) => `“${entry}”`).join(', ')} ${missing.length === 1 ? 'is not a step' : 'are not steps'} of “${flow.name}”. Its steps are ${current.map(nameOf).join(', ')}.` };
        next = [...ids, ...current.filter((id) => !ids.includes(id))];
      } else if (op.screen) {
        const moving = stepNamed(String(op.screen));
        if (!moving?.id) return { note: `“${op.screen}” is not a step of “${flow.name}”. Its steps are ${current.map(nameOf).join(', ')}.` };
        const rest = current.filter((id) => id !== moving.id);
        const anchorName = op.before ?? op.after;
        if (anchorName) {
          const anchor = stepNamed(String(anchorName));
          const at = anchor?.id ? rest.indexOf(anchor.id) : -1;
          if (at === -1) return { note: `“${anchorName}” is not a step of “${flow.name}”.` };
          rest.splice(op.before ? at : at + 1, 0, moving.id);
        } else {
          const word = String(op.position ?? '').trim().toLowerCase();
          const position = typeof op.position === 'number' ? op.position : /^(first|start|top|beginning)$/.test(word) ? 1 : /^(last|end|bottom)$/.test(word) ? current.length : Number.parseInt(word, 10);
          if (!Number.isFinite(position) || position < 1) return {};
          rest.splice(Math.min(position, current.length) - 1, 0, moving.id);
        }
        next = rest;
      }
      if (!next) return {};
      if (next.join('|') === current.join('|')) return { note: `“${flow.name}” is already in that order.`, settled: true };
      return confirm({ kind: 'reorder-flow', flowId: flow.id, name: flow.name, screenIds: next, screenNames: next.map(nameOf) });
    }
    case 'create-app': {
      const name = unquote(String(op.to ?? '')).slice(0, 80);
      if (!name || !grounded(name, grounding.saidByAdmin, false)) return {};
      const existing = findApp(state, name);
      if (existing && norm(existing.name) === norm(name)) return { note: `${existing.name} is already in the library.`, settled: true };
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
      if (!id) return {};
      const clash = apps.find((entry) => entry.id === id);
      if (clash) return { note: `An app with the id “${id}” already exists (${clash.name}).`, settled: true };
      const industries = state?.vocabulary?.industries ?? [];
      const wanted = typeof op.industry === 'string' ? norm(op.industry) : '';
      // No guessing a default: a category the admin did not give (and the agent could not
      // infer from the name) is left as `unsorted`, which the admin shows as "Needs category".
      const industry = industries.find((entry) => norm(entry) === wanted) ?? 'unsorted';
      return confirm({ kind: 'create-app', id, name, industry });
    }
    case 'set-screen-details': {
      if (!app) return noApp;
      const picked = pickScreen(app, op.screen);
      if (!picked.screen) return { note: picked.note };
      const screen = picked.screen;
      const capturedAt = typeof op.capturedAt === 'string' && op.capturedAt.trim() ? (parseDateInput(op.capturedAt) ?? parseDateInput(grounding.question ?? '')) : null;
      const styles = state?.vocabulary?.styles ?? [];
      const styleWanted = names(op.style).map(norm);
      const style = styleWanted.length ? styles.filter((entry) => styleWanted.includes(norm(entry))) : [];
      if (styleWanted.length && !style.length) return { note: `A style is one or more of ${styles.join(', ')}.` };
      const elements = [...new Set(names(op.elements).map((entry) => entry.toLowerCase().replace(/[^a-z0-9 &-]/g, '').trim()).filter(Boolean))].slice(0, 20);
      if (!capturedAt && !style.length && !elements.length) return {};
      const detailFile = splitScreenFile(screen.file, screen.version ?? '');
      return confirm({
        kind: 'set-screen-details',
        platform: screen.platform,
        appId: app.id,
        file: detailFile.name,
        version: detailFile.version,
        flow: detailFile.flow,
        name: screenName(screen),
        capturedAt: capturedAt ?? undefined,
        elements: elements.length ? elements : undefined,
        style: style.length ? style : undefined,
      });
    }
    case 'set-flow-parent': {
      const owner = op.app ? findApp(state, op.app) : mentioned[0] ?? null;
      const flow = findFlow(state, owner?.id ?? null, op.flow);
      if (!flow) return { note: `I can’t find a flow called “${op.flow ?? ''}”.` };
      if (!op.parent || /^(none|null|top|top level|top-level|root)$/i.test(String(op.parent))) {
        if (!flow.parentId) return { note: `“${flow.name}” is already top-level.`, settled: true };
        return confirm({ kind: 'set-flow-parent', flowId: flow.id, name: flow.name, parentId: null, parentName: null });
      }
      const parent = findFlow(state, flow.appId, op.parent);
      if (!parent || parent.id === flow.id) return { note: `I can’t find a flow called “${op.parent}” to nest under.` };
      if (flow.parentId === parent.id) return { note: `“${flow.name}” is already under “${parent.name}”.`, settled: true };
      return confirm({ kind: 'set-flow-parent', flowId: flow.id, name: flow.name, parentId: parent.id, parentName: parent.name });
    }
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
      if (fields.website) {
        // A link has to look like one; "https://App Store link" is the model filling a blank.
        if (!/^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(fields.website.trim())) delete fields.website;
        else if (!/^https?:\/\//i.test(fields.website)) fields.website = `https://${fields.website}`;
      }
      const current: Record<string, string | undefined> = { name: app.name, tagline: app.tagline, industry: app.industry, website: app.website };
      const unchanged: string[] = [];
      for (const key of Object.keys(fields)) {
        if ((current[key] ?? '').trim().toLowerCase() === fields[key].toLowerCase()) {
          unchanged.push(key);
          delete fields[key];
        }
      }
      if (unchanged.length && !Object.keys(fields).length) {
        return { note: `${app.name}’s ${unchanged.join(' and ')} already ${unchanged.length === 1 ? 'is' : 'are'} ${unchanged.map((key) => `“${current[key]}”`).join(' and ')} — nothing to change there.`, settled: true };
      }
      // Industry is picked from a list; everything else must come from the admin.
      for (const key of Object.keys(fields)) {
        if (key === 'industry') continue;
        if (!grounded(fields[key], grounding.saidByAdmin, key !== 'website' && grounding.askedToInvent)) delete fields[key];
      }
      if (!Object.keys(fields).length) return {};
      return confirm({ kind: 'update-app', appId: app.id, name: app.name, fields });
    }
    case 'set-screen-type': {
      if (!app) return noApp;
      const picked = pickScreen(app, op.screen);
      if (!picked.screen) return { note: picked.note };
      const screen = picked.screen;
      const types = state?.vocabulary?.screenTypes ?? [];
      const wanted = norm(String(op.to ?? '')).replace(/\s+/g, '_');
      const match = types.find((entry) => entry === wanted || entry.replace(/_/g, ' ') === norm(String(op.to ?? '')));
      if (!match) return { note: `“${op.to ?? ''}” is not a screen type the library knows — it has ${types.map((entry) => entry.replace(/_/g, ' ')).join(', ')}.` };
      const typeFile = splitScreenFile(screen.file, screen.version ?? '');
      return confirm({ kind: 'set-screen-type', platform: screen.platform, appId: app.id, file: typeFile.name, version: typeFile.version, flow: typeFile.flow, name: screenName(screen), screenType: match });
    }
    case 'set-flow-category': {
      const owner = op.app ? findApp(state, op.app) : mentioned[0] ?? null;
      const flow = findFlow(state, owner?.id ?? null, op.flow);
      if (!flow) return { note: `I can’t find a flow called “${op.flow ?? ''}”${owner ? ` in ${owner.name}` : ''}.` };
      const categories = state?.vocabulary?.flowCategories ?? [];
      const match = categories.find((entry) => norm(entry) === norm(String(op.to ?? '')));
      if (!match) return { note: `“${op.to ?? ''}” is not a flow category the library knows — it has ${categories.join(', ')}.` };
      return confirm({ kind: 'set-flow-category', flowId: flow.id, name: flow.name, category: match });
    }
    case 'rename-screen':
    case 'delete-screen': {
      if (!app) return noApp;
      const picked = pickScreen(app, op.screen);
      if (!picked.screen) return { note: picked.note };
      const screen = picked.screen;
      const opFile = splitScreenFile(screen.file, screen.version ?? '');
      if (op.kind === 'delete-screen') return confirm({ kind: 'delete-screen', platform: screen.platform, appId: app.id, file: opFile.name, version: opFile.version, flow: opFile.flow, name: screenName(screen) });
      const to = unquote(String(op.to ?? '')).slice(0, 80);
      if (!to || !grounded(to, grounding.saidByAdmin, grounding.askedToInvent)) return {};
      return confirm({ kind: 'rename-screen', platform: screen.platform, appId: app.id, file: opFile.name, version: opFile.version, flow: opFile.flow, from: screenName(screen), to });
    }
    case 'delete-screens': {
      if (!app) return noApp;
      const wanted = names(op.screens);
      if (!wanted.length) return { note: `Which screens of ${app.name} should go? Name them, or pick them from the thumbnails.` };
      const picked: StateFile[] = [];
      for (const name of wanted) {
        const one = pickScreen(app, name);
        if (!one.screen) return { note: one.note };
        if (!picked.some((entry) => entry.file === one.screen!.file && entry.platform === one.screen!.platform)) picked.push(one.screen);
      }
      if (picked.length === 1) {
        const only = splitScreenFile(picked[0].file, picked[0].version ?? '');
        return confirm({ kind: 'delete-screen', platform: picked[0].platform, appId: app.id, file: only.name, version: only.version, flow: only.flow, name: screenName(picked[0]) });
      }
      const platforms = [...new Set(picked.map((entry) => entry.platform))];
      if (platforms.length > 1) return { note: `Those screens are on different platforms (${platforms.join(', ')}); delete one platform's at a time.` };
      return confirm({
        kind: 'delete-screens',
        platform: platforms[0],
        appId: app.id,
        name: app.name,
        screens: picked.map((entry) => {
          const part = splitScreenFile(entry.file, entry.version ?? '');
          return { file: part.name, version: part.version, flow: part.flow, name: screenName(entry) };
        }),
      });
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

const INVENTOR = `You write one value for an app's field in a design-reference library, as JSON only: {"value": "..."}. A tagline is one short line in the app's own voice, under 60 characters, no trailing period, not a slogan already in use by the app. A name is the app's proper name. Write something fresh: the list "Already suggested" must not be repeated or lightly reworded.`;

/** Values the assistant has already put forward, read off its earlier lines. */
function alreadySuggested(history: HistoryLine[], lastOp: AdminOp | null): string[] {
  const out = new Set<string>();
  for (const line of history) if (line.role === 'assistant') for (const match of line.text.matchAll(/[“"]([^”"]{3,80})[”"]/g)) out.add(match[1].trim());
  if (lastOp?.kind === 'update-app') for (const value of Object.values(lastOp.fields)) if (value) out.add(String(value));
  return [...out];
}

/** A short "another one" that continues the last request rather than starting a new one. */
const FOLLOW_UP = /^(?:(?:ok|okay|hmm|no|nah|yes|sure|please|and|so|then)[,\s]+)*(?:give me |show me |try |suggest |i want |can you (?:give|try|suggest) )?(?:another|again|one more|a different one|different one|different|something else|other options?|more options?|next|more|new one|a new one)(?: (?:one|please|text|tagline|name|option|options|suggestion|suggestions))?\s*[.!?]*$/i;

/** A message that asks for something to be done, as opposed to asked. */
const CHANGE_VERB = /\b(change|update|set|rename|call|delete|remove|drop|erase|add|make|mark|type|file|move|put|use|upload|open|show|rebuild|regenerate|rewrite|research|redo|keep|replace|edit|fix|switch|turn|assign|apply|save|publish|hide|give|approve|reject|review|stop|abort|kill|tag|label|describe|create|nest|group|take|go to|name it|this (is|as)|it (is|as))\b/i;
const QUESTION = /^(how|what|which|where|when|why|who|is|are|do|does|did|can|could|should|will|would|tell me|explain|list|count)\b|\?\s*$/i;

/** "I'll type my own", "let me write it", "I'll give you the text". */
const OWN_VALUE = /^(?:(?:ok|okay|no)[,\s]+)?(?:i(?:'|’)?ll|i will|let me|i want to|i'd like to|i’d like to|can i)\s+(?:type|write|give|enter|send|share|provide)\b|\bmy own\b|\bi(?:'|’)ll (?:do|write) it\b/i;

/**
 * The value in a message that was written as an answer: quotes come off,
 * and the words people wrap a value in — "use this", "set it to", "update
 * this text" — are peeled away. What is left is the value, commas and all.
 */
function valueFromAnswer(question: string, field: Expect['field']): string {
  let text = question.trim();
  const quoted = [...text.matchAll(/[“"']([^”"']{1,160})[”"']/g)].map((match) => match[1].trim()).filter(Boolean);
  if (quoted.length) text = quoted[quoted.length - 1];
  text = text
    .replace(/^(?:ok(?:ay)?[,.]?\s+)?(?:please\s+)?(?:use|set|make|put|update|change|try|go with|take)\s+(?:it\s+|this\s+|the\s+)?(?:to\s+|as\s+|text\s+|tagline\s+|name\s+)?(?:to\s+)?/i, '')
    .replace(new RegExp(`^(?:the\\s+)?(?:new\\s+)?${field}\\s*(?:is|:|=|should be|to)\\s*`, 'i'), '')
    .replace(/^(?:it(?:'|’)?s|its|it is|this is|here(?:'|’)?s|here is)\s+/i, '')
    .replace(/\s*[,.]?\s*(?:update|set|use|apply|save|change)\s+(?:this|that|it)(?:\s+text|\s+as\s+(?:the\s+)?\w+|\s+now|\s+please)?\s*[.!]*$/i, '')
    .replace(/\s*[,.]?\s*(?:please|thanks|thank you)\s*[.!]*$/i, '')
    .replace(/\s*[,.]?\s*(?:as|for)\s+(?:the\s+)?(?:tagline|name|title|website|link)\s*[.!]*$/i, '')
    .trim();
  if (field === 'website') {
    const url = text.match(/https?:\/\/\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)+(?:\/\S*)?/i);
    return url ? url[0] : '';
  }
  return text.replace(/^[“"']+|[”"']+$/g, '').trim().slice(0, field === 'tagline' ? 160 : 120);
}

/** Words that back out of an offer. */
const BACK_OUT = /^(?:(?:ok|okay|no|nah)[,\s]+)*(?:cancel(?: that| it)?|never ?mind|forget (?:it|that)|stop|don'?t(?: do (?:it|that))?|leave it|skip(?: it)?)\s*[.!?]*$/i;

/**
 * Whether the reader's operation is about what the admin actually wrote.
 * A small model handed a long conversation will sometimes pick an
 * operation out of thin air — renaming a screen nobody mentioned — and
 * that must never reach the Confirm button.
 */
function relevant(op: ParsedOp, question: string, continuing: boolean): boolean {
  const q = norm(question);
  const has = (...words: string[]) => words.some((word) => q.includes(word));
  switch (op.kind) {
    case 'rename-screen':
    case 'delete-screen':
    case 'set-screen-type':
      return has('screen', 'screenshot', 'image', 'page') || (Boolean(op.screen) && q.includes(norm(op.screen!)));
    case 'rename-flow':
    case 'delete-flow':
    case 'set-flow-category':
    case 'set-flow-parent':
    case 'add-to-flow':
    case 'remove-from-flow':
    case 'create-flow':
      return has('flow', 'journey', 'section', 'group') || (Boolean(op.flow) && q.includes(norm(op.flow!)));
    case 'set-screen-tags':
    case 'set-screen-description':
      return has('tag', 'label', 'describ', 'description', 'screen');
    case 'set-source-status':
      return has('approve', 'reject', 'review', 'pending', 'status', 'publish', 'source', 'rights');
    case 'stop-run':
      return has('stop', 'cancel', 'abort', 'kill', 'end') && has('run', 'upload', 'ingest', 'job', 'process', 'it');
    case 'research-app':
      return has('rewrite', 'rename', 'regenerate', 'research', 'ai', 'names', 'redo', 'again', 'better');
    case 'set-ai':
      return has('model', 'ai', 'ollama', 'gemma', 'qwen', 'llama', 'turn');
    case 'add-screen':
      return has('screen', 'screenshot', 'image', 'this', 'picture');
    case 'remove-app':
      return has('remove', 'delete', 'drop', 'get rid', 'erase');
    case 'set-logo':
      return has('logo', 'icon', 'image', 'picture', 'this');
    case 'rebuild':
      return has('rebuild', 'index', 'manifest', 'regenerate', 'refresh');
    case 'open':
      return has('open', 'show', 'go to', 'take me', 'link', 'page');
    case 'update-app':
      return continuing || has('tagline', 'name', 'title', 'website', 'link', 'url', 'store', 'industry', 'category', 'description', 'change', 'update', 'set', 'rename', 'call', 'keep', 'make', 'edit');
    case 'delete-app-version':
    case 'rename-app-version':
      return has('version', 'capture', 'date', 'snapshot', 'release');
    case 'create-app':
      return has('app', 'create', 'add', 'register', 'new');
    case 'set-screen-details':
      return has('captur', 'date', 'component', 'element', 'style', 'screen');
    case 'reorder-flow':
      return has('order', 'reorder', 'move', 'before', 'after', 'first', 'last', 'position', 'step', 'flow', 'swap');
    default:
      return true;
  }
}

/** What a done-claim from the speaker becomes: an offer, since nothing has happened yet. */
const BASE_VERB: Record<string, string> = {
  updated: 'update', set: 'set', changed: 'change', renamed: 'rename', removed: 'remove', deleted: 'delete', added: 'add', saved: 'save', uploaded: 'upload',
  marked: 'mark', created: 'create', tagged: 'tag', approved: 'approve', rejected: 'reject', nested: 'nest', filed: 'file', stopped: 'stop', started: 'start', moved: 'move', turned: 'turn', switched: 'switch', described: 'describe', retyped: 'retype', initiated: 'start', launched: 'start', queued: 'queue', triggered: 'start', kicked: 'start',
  updating: 'update', setting: 'set', changing: 'change', renaming: 'rename', removing: 'remove', deleting: 'delete', adding: 'add', saving: 'save', uploading: 'upload',
  marking: 'mark', creating: 'create', tagging: 'tag', approving: 'approve', rejecting: 'reject', nesting: 'nest', filing: 'file', stopping: 'stop', starting: 'start', moving: 'move', turning: 'turn', switching: 'switch', describing: 'describe', opening: 'open', running: 'run', rewriting: 'rewrite',
};
const PAST = 'updated|set|changed|renamed|removed|deleted|added|saved|uploaded|marked|created|tagged|approved|rejected|nested|filed|stopped|started|moved|turned|switched|described|retyped|initiated|launched|queued|triggered|kicked';
const ING = 'updating|setting|changing|renaming|removing|deleting|adding|saving|uploading|marking|creating|tagging|approving|rejecting|nesting|filing|stopping|starting|moving|turning|switching|describing|opening|running|rewriting';
function unclaim(text: string): string {
  const base = (verb: string) => BASE_VERB[verb.toLowerCase()] ?? verb;
  return text
    .replace(new RegExp(`\\b(I[’']ve|I have|I) (just |now )?(${PAST})\\b`, 'gi'), (_, _i, _adv, verb: string) => `I can ${base(verb)}`)
    .replace(new RegExp(`\\bI[’']m (now )?(${ING})\\b`, 'gi'), (_, _adv, verb: string) => `I can ${base(verb)}`)
    .replace(new RegExp(`(^|[.!?]\\s+)(just |now |okay,? |ok,? )(${ING})\\b`, 'gi'), (_, lead: string, _adv, verb: string) => `${lead}I can ${base(verb)}`)
    .replace(new RegExp(`\\b(has|have) been (${PAST})\\b`, 'gi'), (_, _aux, verb: string) => `will be ${verb} once you confirm`)
    .replace(/\bis now (set|updated|changed) to\b/gi, 'will be set to')
    .replace(/\b(is|are) (now )?(updated|set|changed|renamed|removed|deleted)\b(?! once)/gi, (_, aux: string, _adv, verb: string) => `will be ${verb} once you confirm`);
}

/** Stage one: what, if anything, is the admin asking to change? JSON, short, unstreamed. */
const READER = `You read one message from the admin of a design-reference library and decide whether it asks for a change to the library. Return JSON only: {"op": …} where ${OP_SCHEMA}
Rules: op is null for questions, chat, thanks, or a bare "yes"/"confirm"/"ok". Only return an op for what THIS message asks — never pick a screen, flow or app the admin did not mention in it. Adding a new app to the library is done by uploading a screen recording of it, so "add an app", "new app", "add another app" is {"kind": "upload"} — never ask which existing app. "Keep the name Swiggy", "the name should stay Swiggy", "set the name to X", "call it X" are update-app with fields.name. "Stop the run/upload" is stop-run. "Rewrite/regenerate the names for X with AI" is research-app. "Use model M for chat", "turn the AI off/on" is set-ai. "Approve X", "mark X as reviewed/rejected" is set-source-status. "Delete X", "remove X", "delete the whole app", "get rid of X completely" is remove-app — the entire app. It is delete-app-version only when a version, capture or date is actually named: "Delete X's Jan 2025 version", "remove the Sep 2026 capture of X". "Change the date of X's Sep 21 version to Sep 25", "move X's latest version to 2026-09-30", "rename X's version" is rename-app-version (version = the one to change, to = the new date, or null if none was given). When a screen is named together with a version — "delete the splash screen from X's Sep 29 version", "rename the login screen in X's latest version" — put that version in "version"; leave it null when no version was named. "Add this screenshot to X", "add this image to X's Sep 29 version" is add-screen (version null when none was named). "Create an app called X" or "add an empty app X" (a name, no recording) is create-app with to = the name. "Move step A before B in flow F", "put A first/last", "make A step 3", or a full new order "reorder F: A, B, C" is reorder-flow. "The splash screen was captured on 12 Sep", "set the components of A to navigation, button", "mark A's style as minimal, dark" is set-screen-details. "Add screens A and B to flow F", "move A into F" is add-to-flow; "take A out of F" is remove-from-flow; "create a flow F with A, B" is create-flow; "put flow F under G" is set-flow-parent. "Tag the splash screen as onboarding, brand" is set-screen-tags. "Open the flows page" is open with page. Use app, screen and flow names exactly as in the facts. Put values (a tagline, a name, a link) in the op only when the admin actually wrote them, or asked you to make one up ("suggest", "your wish", "another") — then write a good one (a tagline: one line in the app's voice, under 60 characters). Never invent a link. If a value is missing, still return the op with "fields": {} (or no "to"), so the assistant knows what to ask for. Use the recent conversation: "make it X" after a request about a tagline means that tagline.`;

/** Stage two: the assistant's own words, streamed as plain text. */
const PERSONA = `You are the Motvin assistant: the helper inside Motvin Inspirations, a design-reference library like Mobbin. You talk with the library's admin the way a sharp, friendly colleague would — warm, brief, specific, plain English, no markdown, never stiff or repetitive; if the same thing comes up twice, say it differently and add something useful. Use the facts you are given; never invent apps, screens, flows, runs, links or numbers.

Do not greet or say "Hi there" unless it is the very first message of the conversation; just answer. If the admin only says hello, say hello back in one line and ask what they'd like to do — do not recite the facts unless asked. The facts are for answering questions, not for announcing. You cannot change anything yourself. Each turn you are told what the assistant is offering the admin (a change with a Confirm button), or what it still needs, or that nothing is being changed. Speak to exactly that: if there is an offer, describe it in your words as something that will happen when they confirm — never as done — and end by inviting them to confirm; if something is missing, ask for that one thing; if nothing is being changed, just answer or chat. When asked for ideas — a tagline, a name — give two or three good options as a short bulleted list. You may use **bold** for the thing being changed, and "- " bullets only when listing suggested taglines or names — never to restate an offer; no headings, no tables, no code, and never write a URL or a path (the admin gets a button for links). Two or three sentences at most, plus a list when it helps.`;

export async function answerQuestion(
  input: { question: string; authorization: string | null; history?: HistoryLine[]; pending?: string | null; heldImage?: string | null; lastOp?: AdminOp | null; expecting?: Expect | null; signal?: AbortSignal },
  onToken?: TokenSink,
): Promise<AssistantAnswer> {
  const question = input.question.trim();
  const history = (input.history ?? []).slice(-12);
  const lastOp = input.lastOp ?? null;
  let expecting = input.expecting ?? null;
  // Quoted text, or "use this / go with …", right after an offer is the
  // admin's own value for that offer's field.
  if (!expecting && lastOp?.kind === 'update-app') {
    const field = Object.keys(lastOp.fields).find((key) => key === 'tagline' || key === 'name' || key === 'website') as Expect['field'] | undefined;
    const quoted = /[“"'][^”"']{2,}[”"']/.test(question);
    const useThis = /^(?:(?:ok|okay|no)[,\s]+)?(?:use|go with|take|set it to|make it|put)\b/i.test(question) && !/\b(another|different|suggest|your)\b/i.test(question);
    if (field && (quoted || useThis)) expecting = { kind: 'update-app', appId: lastOp.appId, app: lastOp.name, field };
  }

  // "I'll type my own" with nothing to type it for.
  if (OWN_VALUE.test(question) && !(lastOp?.kind === 'update-app' || expecting)) {
    const text = 'Sure. Which app and which field — for example “Swiggy tagline” — and then type the text.';
    onToken?.(text);
    return { source: 'rules', text, actions: [], streamed: false };
  }
  // "I'll type my own": say go ahead, and take the next message as the value.
  if (OWN_VALUE.test(question) && (lastOp?.kind === 'update-app' || expecting)) {
    const field = expecting?.field ?? ((Object.keys((lastOp as Extract<AdminOp, { kind: 'update-app' }>).fields)[0] as Expect['field'] | undefined) ?? 'tagline');
    const app = expecting ? { id: expecting.appId, name: expecting.app } : { id: (lastOp as Extract<AdminOp, { kind: 'update-app' }>).appId, name: (lastOp as Extract<AdminOp, { kind: 'update-app' }>).name };
    const text = `Sure — type the ${field} you want for ${app.name} and I’ll set it up for you to confirm. Whatever you write next is taken as the ${field}, word for word.`;
    onToken?.(text);
    return { source: 'rules', text, actions: [{ type: 'cancel' }], expect: { kind: 'update-app', appId: app.id, app: app.name, field }, streamed: false };
  }

  // A bare yes needs no model either. When an offer is waiting the dock
  // settles it before asking here, so reaching this means the Confirm button
  // is the way; with nothing waiting there is nothing to agree to.
  if (/^(yes|y|yeah|yep|ok|okay|sure|confirm|do it|go ahead|proceed|update|done)\s*[.!]?$/i.test(question)) {
    const text = input.pending ? `To go ahead with “${input.pending}”, press Confirm on it above — I only act on that button, or a typed yes while it is showing.` : 'Nothing is waiting for a yes right now. Tell me what you’d like to change, or ask me anything about the library.';
    onToken?.(text);
    return { source: 'rules', text, actions: input.pending ? [] : [{ type: 'reply', text: 'What can you do?' }], streamed: false };
  }

  // Backing out needs no model: the offer is dropped, and that is all.
  if (BACK_OUT.test(question)) {
    const text = input.pending ? `Okay — “${input.pending}” is off the table. Nothing changed.` : 'Okay, nothing to cancel — nothing was waiting. What would you like to do?';
    onToken?.(text);
    return { source: 'rules', text, actions: [{ type: 'cancel' }], streamed: false };
  }
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

  // The agent: a tool-calling model that looks things up and proposes one
  // change, understood from the whole conversation (agent.ts). It takes the
  // turn whenever a tool-capable model is installed; the keyword-gated
  // reader below is the fallback for models that cannot call tools.
  try {
    const agentAnswer = await runAgent(
      { question, history, pending: input.pending ?? null, heldImage: input.heldImage ?? null, lastOp, expecting },
      {
        state,
        ai,
        jobs,
        askedToInvent: INVENT.test(question),
        validate: (op) => validateOp(op, state, mentioned, { saidByAdmin: adminWords, askedToInvent: INVENT.test(question), fallbackApp: mentioned[0]?.name ?? (lastOp && 'appId' in lastOp ? lastOp.appId : null), jobs, ai, question }),
        describeJob,
        describeAi,
        unclaim,
        onToken,
        signal: input.signal,
      },
    );
    if (agentAnswer) {
      if (!agentAnswer.streamed) onToken?.(agentAnswer.text);
      return { ...agentAnswer, expect: null };
    }
  } catch (error) {
    if (input.signal?.aborted) throw new Error('Stopped.');
    console.warn('[assistant] agent turn failed, falling back to the reader:', error instanceof Error ? error.message : error);
  }
  const detail = mentioned
    .slice(0, 2)
    .map((app) => {
      const screens = [...new Set((state?.files ?? []).filter((file) => file.appId === app.id).map(screenName))];
      const flows = [...new Set((state?.flows ?? []).filter((flow) => flow.appId === app.id).map((flow) => flow.name))];
      const totals = countsFor(state, app.id);
      const flowLines = (state?.flows ?? [])
        .filter((flow) => flow.appId === app.id)
        .slice(0, 40)
        .map((flow) => `${flow.name}${flow.parentId ? ` (under ${(state?.flows ?? []).find((entry) => entry.id === flow.parentId)?.name ?? '?'})` : ''}: ${(flow.screenIds ?? []).map((id) => screenName((state?.files ?? []).find((file) => file.id === id) ?? { appId: app.id, platform: 'ios', file: id })).join(', ') || 'no screens'}`);
      return `${app.name}: tagline “${app.tagline ?? ''}”, industry ${app.industry ?? '?'}, website/App Store link ${app.website ?? 'none'}, logo ${app.logo ? 'set' : 'none'}, source status ${state?.sources?.[app.id]?.status ?? 'unknown'}, ${totals.screens} screens, ${totals.flows} flows.\n  Versions, newest first: ${(app.versions ?? []).map((v) => (v.isLatest ? `Latest (${v.label})` : v.label)).join(', ') || 'none'}\n  Screen names: ${screens.slice(0, 80).join(' | ') || 'none'}\n  Flows (with their screens): ${flowLines.join(' | ') || 'none'}${flows.length > 40 ? ' | …' : ''}`;
    })
    .join('\n');
  const counts = state?.counts ?? null;
  const libraryFacts = [
    `Apps: ${apps.map((app) => app.name).join(', ') || 'none yet'}.`,
    `Editable app fields: name, tagline, industry (${(state?.vocabulary?.industries ?? []).join(', ')}), website. Screen types: ${(state?.vocabulary?.screenTypes ?? []).map((entry) => entry.replace(/_/g, ' ')).join(', ')}. Flow categories: ${(state?.vocabulary?.flowCategories ?? []).join(', ')}. Source statuses: pending, review, approved, rejected. Pages: ${Object.keys(PAGES).join(', ')}. AI models on the server: ${(ai?.models ?? []).join(', ') || 'none'}.`,
    active ? `A run is in progress: “${active.title}”.` : 'No run is in progress.',
    detail,
    input.heldImage ? `The admin has dropped an image named “${input.heldImage}”; “this” means it.` : null,
  ]
    .filter(Boolean)
    .join('\n');
  const facts = [
    `Today: ${localDateString(new Date(now))}.`,
    counts ? `Library: ${counts.screens ?? 0} screens, ${counts.apps ?? 0} apps, ${counts.flows ?? 0} flows, ${counts.patterns ?? 0} patterns.` : null,
    `Apps: ${apps.map((app) => `${app.name} — ${countsFor(state, app.id).screens} screens, ${countsFor(state, app.id).flows} flows${app.tagline ? `, tagline “${app.tagline}”` : ''}${(app.versions ?? []).length ? `, versions: ${(app.versions ?? []).map((v) => (v.isLatest ? `Latest (${v.label})` : v.label)).join(', ')}` : ''}`).join('; ') || 'none yet'}.`,
    `Editable app fields: name, tagline, industry (one of ${(state?.vocabulary?.industries ?? []).join(', ')}), website — the app's link, which is also what the “View in App Store” button opens. Screens can be renamed, deleted or retyped (types: ${(state?.vocabulary?.screenTypes ?? []).map((entry) => entry.replace(/_/g, ' ')).join(', ')}); flows can be renamed, deleted or filed under a category (${(state?.vocabulary?.flowCategories ?? []).join(', ')}). Each app's screens are grouped into dated versions (captures); a version can be deleted, or have its date changed — the newest date is the one shown as “Latest”. A screen also has a captured date, a list of components, and style tags (${(state?.vocabulary?.styles ?? []).join(', ')}); all three can be set. The steps of a flow can be reordered. An app can be created empty (“create an app called X”) and given screens later. New screens arrive by dropping a screen recording, or several screenshots, here or on the admin page.`,
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
  // "Create an app called X" — a record with no recording yet — is its own
  // thing. Adding an app any other way is always a screen recording of it.
  const creatingAppName =
    question.match(/\b(?:create|add|make|register|set up)\b[^.?!]*\bapp\b[^.?!]*\b(?:called|named|titled)\s+[“"']?([^”"'.!?]{2,60})/i)?.[1]?.trim() ??
    question.match(/\b(?:create|add|make|register)\b\s+(?:an?\s+)?(?:new\s+|empty\s+|blank\s+)?app\s+[“"']([^”"']{2,60})[”"']/i)?.[1]?.trim() ??
    null;
  const creatingApp = Boolean(creatingAppName) || /\b(empty|blank)\s+app\b|\bapp\b[^.?!]*\bwithout (a )?(video|recording)\b/i.test(question);
  const addingApp = !creatingApp && /\b(add|create|new|another|upload|import|ingest)\b[^.?!]*\b(app|application|recording|video)\b|\bnew app\b/i.test(question) && !/\b(tagline|logo|website|link|screen|flow|name|industry)\b/i.test(question);
  // "Delete Swiggy", "remove the whole app", "delete complete app" is the
  // app itself. Only a message that names a version, capture or date — or
  // a screen, flow, or field — is about a part of it. The reader kept
  // reading a bare "delete X" as a version delete and then asking which
  // version, so this is decided here, from the words, not by the model.
  const deletionVerb = /\b(delete|remove|drop|erase|wipe|trash|get rid of|take (?:it |[a-z ]+ )?down)\b/i.test(question);
  const aboutPart = /\b(version|capture|date|snapshot|screen|screenshot|image|flow|journey|step|tagline|logo|website|link|tag|description|industry|name)\b/i.test(question);
  const wholeApp = /\b(whole|entire|complete(?:ly)?|all of it|everything|fully|the app|this app|that app|app itself|permanently)\b/i.test(question);
  const appNamedNow = apps.find((app) => norm(question).includes(norm(app.name))) ?? null;
  const deletingApp = deletionVerb && !aboutPart && (Boolean(appNamedNow) || (wholeApp && mentioned.length > 0));
  // A short correction right after an offer — "sorry, version", "i mean the
  // Sep 29 version", "no, just the screen" — continues that offer's subject
  // rather than starting over. Nothing in such a message is a change verb,
  // so without this it was read as a remark, and answered with facts.
  const lastAppRef = lastOp && 'appId' in lastOp ? lastOp.appId : lastOp && 'name' in lastOp ? lastOp.name : null;
  const lastWasDelete = Boolean(lastOp && ['remove-app', 'delete-app-version', 'delete-screen', 'delete-flow'].includes(lastOp.kind));
  const shortMessage = question.split(/\s+/).length <= 8 && !QUESTION.test(question);
  const correcting =
    Boolean(lastOp) &&
    shortMessage &&
    (/^(?:sorry|oops|no|nah|wait|actually|hmm|i mean|i meant|not (?:the )?(?:app|that)|only|just|instead|rather)\b/i.test(question) ||
      (/\bversions?\b/i.test(question) && question.split(/\s+/).length <= 4));
  const versionCorrection = correcting && lastWasDelete && Boolean(lastAppRef) && /\b(version|versions|capture|release|snapshot)\b/i.test(question);
  // The reader sees the correction with its subject restored, since the
  // message itself rarely repeats the app or the offer it is about.
  const readerQuestion = correcting && lastOp && lastAppRef && !appNamedNow ? `${question} (a correction to the offer “${labelFor(lastOp)}”, about ${lastAppRef})` : question;
  // "Another" after a suggested tagline means another tagline, not a new
  // request — the last offer is repeated with a fresh value.
  const followUp = FOLLOW_UP.test(question) && lastOp?.kind === 'update-app' && Object.keys(lastOp.fields).some((key) => key === 'tagline' || key === 'name');
  // A bare value — a URL, a name in quotes — answers whatever the assistant just asked for.
  const lastAssistantLine = [...history].reverse().find((line) => line.role === 'assistant');
  const shortValue = !QUESTION.test(question) && question.split(/\s+/).length <= 8;
  const answering = (Boolean(lastAssistantLine && /\?\s*$/.test(lastAssistantLine.text.trim())) && shortValue) || /^https?:\/\/\S+$/i.test(question) || /^[“"'][^”"']+[”"']$/.test(question);
  // Only a message that asks for something to be done goes to the reader.
  // A question or a remark is answered straight away, which also saves the
  // reader's few seconds.
  const wantsChange = CHANGE_VERB.test(question) && !(QUESTION.test(question) && !/\b(can you|could you|please|would you)\b/i.test(question));
  // Re-running the AI names is a common ask with a clear shape; it does not
  // need the reader.
  const rewriteMatch = /\b(rewrite|regenerate|redo|re-?run|refresh|improve|fix)\b[^.?!]*\b(names?|titles?|labels?|content|flows?|journeys?|naming)\b/i.test(question) || /\b(research|ai names?)\b/i.test(question);
  const rewriteApp = rewriteMatch ? (mentioned[0] ?? null) : null;
  let parsedOp: ParsedOp | null = versionCorrection
    ? { kind: 'delete-app-version', app: lastAppRef, to: parseDateInput(question) ?? '' }
    : deletingApp
    ? { kind: 'remove-app', app: appNamedNow?.name ?? mentioned[0]?.name ?? null }
    : creatingApp
      ? { kind: 'create-app', to: creatingAppName ?? '' }
      : addingApp
        ? { kind: 'upload' }
        : rewriteMatch
          ? { kind: 'research-app', app: rewriteApp?.name ?? null }
          : null;
  // The assistant asked for a value, and here it is: no reading, no guessing.
  const answeringExpected = Boolean(expecting) && !bareYes && !addingApp && !FOLLOW_UP.test(question) && !(QUESTION.test(question) && !/[“"']/.test(question));
  if (answeringExpected && expecting) {
    const value = valueFromAnswer(question, expecting.field);
    parsedOp = value ? { kind: 'update-app', app: expecting.app, fields: { [expecting.field]: value } } : null;
    if (!value) {
      const text = `I didn’t catch a ${expecting.field} in that. Type just the text you want — for example: Fresh food, fast.`;
      onToken?.(text);
      return { source: 'rules', text, actions: [], expect: expecting, streamed: false };
    }
  } else if (followUp && lastOp?.kind === 'update-app') {
    parsedOp = { kind: 'update-app', app: lastOp.name, fields: Object.fromEntries(Object.keys(lastOp.fields).filter((key) => key === 'tagline' || key === 'name').map((key) => [key, ''])) };
  } else if (!bareYes && !addingApp && !creatingApp && !deletingApp && !versionCorrection && !rewriteMatch && !answeringExpected && (wantsChange || answering || correcting)) {
    try {
      const read = await askModel(READER, `Facts:\n${libraryFacts}\n\nConversation so far:\n${conversation.split('\n').slice(-6).join('\n')}\n\nAdmin: ${readerQuestion}`, 220, undefined, { raw: true });
      parsedOp = read.text ? readOp(read.text) : null;
    } catch {
      parsedOp = null;
    }
    if (parsedOp && !relevant(parsedOp, question, answering)) parsedOp = null;
  }
  // Only this message decides whether the assistant may make a value up.
  const askedToInvent = followUp || INVENT.test(question);
  const banned = alreadySuggested(history, lastOp);
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
      // The reader is not trusted just for having included a field: asked to
      // change a name, a small model will sometimes hand back a tagline too,
      // out of nowhere. A field is only in play when this message names it,
      // or the value given for it is actually grounded in what the admin
      // wrote — a bare "key in fields" from the reader proves nothing. The
      // two paths that build `fields` themselves — continuing a suggestion
      // ("another"), or answering a value the assistant just asked for — put
      // the key there on purpose and are trusted as-is.
      const wanted =
        followUp || answeringExpected
          ? key in fields
          : new RegExp(`\\b${key}\\b`, 'i').test(question) || (value !== '' && grounded(value, question, false));
      if (!wanted) {
        delete fields[key];
        continue;
      }
      // Text in quotes is the value, exactly — the reader tends to stop at a comma.
      const quotedNow = [...question.matchAll(/[“"']([^”"']{1,160})[”"']/g)].map((match) => match[1].trim()).filter(Boolean);
      if (quotedNow.length === 1 && !/^https?:/i.test(quotedNow[0])) {
        fields[key] = quotedNow[0];
        continue;
      }
      let usable = value && !isEcho(value) && norm(value) !== norm(current[key] ?? '') && grounded(value, question, false);
      if (!usable) {
        // The reader left the field blank although the admin wrote the value
        // — in quotes, or after "name/tagline (to|is|should be) …".
        const quoted = [...question.matchAll(/[“"']([^”"']{1,80})[”"']/g)].map((match) => match[1].trim()).filter(Boolean);
        const after = question.match(new RegExp(`\\b${key}\\b\\s*(?:text|to|is|as|should be|=|:)?\\s*(?:to\\s+)?(.{2,80}?)\\s*[.!]?$`, 'i'))?.[1]?.trim();
        const said = quoted.length === 1 ? quoted[0] : after && !/^(text|name|tagline|to|is)$/i.test(after) ? unquote(after) : '';
        if (said && !isEcho(said) && !/^(another|again|something|different|new)\b/i.test(said)) {
          fields[key] = said;
          usable = true;
        }
      }
      if (usable) continue;
      // A name is never made up unless the admin asks for ideas about the
      // name itself; a tagline gets a suggestion whenever one is missing.
      if (key === 'name' && !(askedToInvent && /\bname\b/i.test(question))) {
        delete fields[key];
        continue;
      }
      let value2 = '';
      for (let attempt = 0; attempt < 2 && !value2; attempt++) {
        try {
          const made = await askModel(
            INVENTOR,
            `App: ${app?.name ?? parsedOp.app ?? ''}. Field: ${key}. Current ${key}: “${current[key] ?? ''}”.\nAlready suggested (do not reuse): ${banned.length ? banned.map((entry) => `“${entry}”`).join(', ') : 'none'}.\nFacts:\n${facts}\n\nAdmin: ${question}${attempt ? '\n\nThe previous attempt repeated an earlier suggestion. Write something clearly different in wording and angle.' : ''}`,
            80,
            undefined,
            { raw: true },
          );
          const candidate = made.text ? (readOpValue(made.text) ?? '') : '';
          const fresh = candidate && norm(candidate) !== norm(current[key] ?? '') && !banned.some((entry) => norm(entry) === norm(candidate));
          if (fresh) value2 = candidate;
        } catch {
          break;
        }
      }
      if (value2) {
        fields[key] = value2;
        invented = key;
      } else delete fields[key];
    }
    parsedOp.fields = fields;
  }
  let action: AssistantAction | undefined;
  let situation: string;
  let settled = false;
  let missingApp = false;
  if (bareYes) {
    situation = 'Nothing is waiting for confirmation, so there is nothing to confirm. Say so in a friendly way and ask what they would like to do.';
  } else if (parsedOp) {
    const checked = validateOp(parsedOp, state, mentioned, { saidByAdmin: adminWords, askedToInvent: askedToInvent || invented !== null, fallbackApp: lastOp && 'name' in lastOp ? lastOp.name : null, jobs, ai, question });
    if (checked.action) {
      action = checked.action;
      const ownWords = checked.action.type === 'confirm' && checked.action.op.kind === 'update-app' && !invented;
      situation =
        checked.action.type === 'confirm'
          ? `You are offering this change, which the admin sees with a Confirm button: ${checked.note ?? checked.action.label}${
              invented
                ? ` The ${invented} is your own suggestion, since they did not give one — present it as a suggestion (it is the one that will be set if they confirm), add one or two different alternatives as a short bulleted list, and say they can type their own instead. Do not repeat any earlier suggestion.`
                : ownWords
                  ? ' The value is the admin’s own words: repeat it exactly as given, offer no alternatives and no edits, and simply invite them to confirm.'
                  : ''
            }`
          : checked.action.type === 'open'
            ? `You are giving the admin a button that opens ${checked.action.label.replace(/^Open /, '')}. Say so in one short line — "Here’s …" — with nothing to confirm and no URL.`
            : `Adding an app to the library means uploading a screen recording of it; the app, its screens and its flows are all worked out from the video, and a free AI names them. You are showing the admin an "Upload a video" button now. In one or two sentences, tell them to record themselves walking through the app on the phone with screen recording on, pausing a moment on each screen, then drop the MOV or MP4 here. Do not ask which existing app they mean.`;
    } else if (checked.missingApp) {
      settled = true;
      missingApp = true;
      situation = `${checked.note} Say that plainly in one sentence, and mention that dropping a screen recording of it here would add it. Do not ask for details about the app.`;
    } else if (checked.settled) {
      settled = true;
      situation = `Nothing needs changing: ${checked.note} Say so briefly${input.pending && parsedOp.kind === 'update-app' ? `, and mention that the earlier offer (“${input.pending}”) is dropped` : ''}.`;
    } else {
      situation = `The admin asked for a change but it cannot be offered yet, because something is missing. ${checked.note ?? missingValueQuestion(parsedOp, state, mentioned)} Ask for exactly that, in your own words. Do not ask whether they want to keep anything as it is.`;
    }
  } else {
    situation = correcting && lastOp
      ? `The admin is correcting or continuing your last offer (“${labelFor(lastOp)}”), but it is not clear what they want instead. Ask one short, specific question about what exactly should change — do not recite facts, models or totals, and do not repeat the old offer.`
      : /^(how are you|how(?:'|’)s it going|how do you do|what(?:'|’)s up|how are things|you ok|are you ok)\b/i.test(question)
      ? 'Small talk. Reply in one warm, human line and ask what they would like to do. Do not mention the library, numbers or models.'
      : QUESTION.test(question)
      ? 'This is a question. Answer it directly from the facts above, in one or two sentences, with the actual numbers or names. No change is involved, and there is no need to say so.'
      : /^(thanks|thank you|thx|cheers|great|nice|cool|perfect|awesome)\b/i.test(question)
        ? 'The admin is thanking you or approving. Reply in one short, warm line and offer to help with anything else. Do not greet.'
        : 'This is a remark or a chat message, not a request for a change. Reply naturally and briefly. Never volunteer the AI models, providers or library totals — those are for when the admin asks about them; if you are unsure what they want, ask one short question instead.';
    // The facts already say whether an offer is waiting; a remark like this
    // is exactly where a small model tends to glance at the conversation
    // history and repeat an earlier offer back as if it had already gone
    // through. It has not — only the values in the facts above are real.
    if (input.pending) situation += ` An offer (“${input.pending}”) is still waiting on the admin's Confirm and has not happened yet. If it comes up, say it is still pending — never that the app already has those values.`;
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
  // A link the admin did not type and the facts do not hold is made up; the
  // Open button carries the real one.
  // Placeholders like "[link to job monitoring]" are the model reaching for a button it does not have.
  text = text.replace(/\s*(?:—|-|:|at|here)?\s*\[[^\]]{2,60}\]\s*[.,]?/g, '').replace(/\s{2,}/g, ' ').trim();
  const known = `${adminWords}\n${facts}`.toLowerCase();
  text = text.replace(/\s*(?:—|-|:|at)?\s*https?:\/\/[^\s)”"]+/gi, (url) => (known.includes(url.trim().replace(/^[—\-:\s]+|^at\s+/i, '').toLowerCase()) ? url : '')).replace(/\s{2,}/g, ' ').trim();
  // A greeting every turn reads like a form letter, and the stage directions
  // are for the model, not the admin.
  if (history.length) text = text.replace(/^(hi|hello|hey)( there| again)?[!,.]\s*/i, '');
  text = text
    .replace(/^(okay|ok)[,.!]?\s+i[’']m ready[.!]?\s*/i, '')
    .replace(/(^|\n)\s*(nothing is being changed( this turn)?|no change is (being made|involved)( this turn)?)[.!]?\s*/gi, '$1')
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
  if (action && action.type === 'confirm' && !/confirm/i.test(text)) text = `${text} Confirm and it’s set.`;
  // Asked for a change, offered nothing, yet the words say it happened: that
  // is the model inventing an outcome. Replace it with the truth.
  if (!action && !settled && wantsChange && !text.includes('?') && /\b(has|have|is|are|’s|'s)\s+(now\s+)?(finished|complete|completed|done|been (updated|renamed|changed|set))\b|\bare now:|\bis now:|\bI can (update|set|change|rename|remove|delete|run|rewrite|mark|create)\b/i.test(text)) {
    text = `I couldn’t turn that into a change I can make. Tell me the app and what to change — for example “rewrite Airbnb’s names with AI”, “approve Airbnb” or “change Airbnb’s tagline to …”.`;
    onToken?.(`\n${text}`);
  } else if (!action && !settled && !text.includes('?') && PROMISES.test(text)) {
    // A promise with nothing behind it: ask for what is missing instead.
    const ask = missingValueQuestion(parsedOp, state, mentioned);
    text = `${text.replace(PROMISES, '').replace(/\s{2,}/g, ' ').trim()} ${ask}`.trim();
    onToken?.(` ${ask}`);
  }
  const actions: AssistantAction[] = action ? [action] : [];
  if (settled && input.pending && parsedOp?.kind === 'update-app') actions.push({ type: 'cancel' });
  if (missingApp) actions.push({ type: 'upload' });
  // Asked for a value? Then the next message is that value.
  let expect: Expect | null = null;
  if (!action && !settled && parsedOp?.kind === 'update-app') {
    const app = findApp(state, parsedOp.app ?? mentioned[0]?.name);
    const field = (Object.keys(parsedOp.fields ?? {})[0] as Expect['field'] | undefined) ?? (/\bwebsite|link|url|store\b/i.test(question) ? 'website' : /\bname\b/i.test(question) ? 'name' : 'tagline');
    if (app && ['tagline', 'name', 'website'].includes(field)) expect = { kind: 'update-app', appId: app.id, app: app.name, field };
  }
  if (!settled) for (const reply of quickReplies(action, parsedOp, invented, bareYes)) actions.push({ type: 'reply', text: reply });
  return { source: 'ai', text, actions, model: raw.model, streamed: raw.streamed === true, expect };
}

/** Likely next messages, offered as chips under the reply. */
function quickReplies(action: AssistantAction | undefined, op: ParsedOp | null, invented: string | null, bareYes: boolean): string[] {
  if (bareYes) return ['What can you do?', 'How is the last run?'];
  if (action?.type === 'confirm') {
    if (invented) return ['Suggest another', 'I’ll type my own'];
    return action.destructive ? [] : ['Cancel that'];
  }
  if (action?.type === 'upload') return ['What should I record?'];
  if (op?.kind === 'update-app' && op.fields && ('tagline' in op.fields || 'name' in op.fields) && !('website' in op.fields)) return ['Suggest one for me'];
  return [];
}

/** Sentences that sound like an offer the admin could confirm, or a claim that it happened. */
const SENTENCE = String.raw`(?:[^.!?]|\.(?=\S))*[.!?]?`;
const PROMISES = new RegExp(String.raw`\b(confirm(ing)? (and|if|it)${SENTENCE}|here[’']s (one|the update)${SENTENCE}|it[’']s set[.!?]?|I can (update|set|change|rename|remove|delete)${SENTENCE}|will be (set|updated|changed)${SENTENCE})`, 'gi');

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
    case 'rename-app-version':
      return `What date should ${who}’s version have instead? Say it like 2026-09-30, or “30 Sep 2026”.`;
    case 'create-app':
      return 'What should the new app be called?';
    case 'reorder-flow':
      return 'Which step should move, and where — before or after which other step, or to which position?';
    case 'set-screen-details':
      return `What should change on that screen in ${who} — its captured date, its components, or its style?`;
    default:
      return app ? `What exactly should I change on ${who}, and to what?` : 'Which app is this about, and what should I change?';
  }
}
