import { readSettings } from '@/lib/server/ai';
import type { AiStatus, IngestJob } from '@/lib/inspirations/ingestJobs';
import type { AdminOp, AssistantAction, Expect } from '@/lib/inspirations/assistantActions';
import { localDateString } from '@/lib/inspirations/dates';
import type { AssistantAnswer, HistoryLine, LibraryState, ParsedOp } from '@/lib/server/assistant';

/**
 * The admin assistant as an agent: a model that can look things up and
 * propose a change, rather than a single guess at a JSON operation gated by
 * keyword checks.
 *
 * Each turn the model gets the conversation plus two kinds of tools. Read
 * tools (list the apps, one app's versions and screens, the flows, the runs,
 * the AI) run here at once and their results go straight back to it, so it
 * can check what exists before deciding — a follow-up like "sorry, version"
 * is understood from the conversation, not from a phrase list. Write tools
 * are never run: the arguments go through the same validation the admin
 * page's actions do (does the app exist, which version, did the admin
 * actually write that value) and, when they hold up, become the one Confirm
 * button the dock shows. Nothing changes until it is pressed.
 *
 * Needs a model that can call tools. The best installed one is picked
 * (largest, tool-capable, general over code); with none, the caller falls
 * back to the older reader pipeline in assistant.ts.
 */

export type AgentInput = {
  question: string;
  history: HistoryLine[];
  pending: string | null;
  heldImage: string | null;
  lastOp: AdminOp | null;
  /** The value the assistant asked the admin to type, if it did. */
  expecting: Expect | null;
};

export type AgentDeps = {
  state: LibraryState | null;
  ai: AiStatus | null;
  jobs: IngestJob[];
  /** Whether this message asked the assistant to make a value up ("suggest a tagline"). */
  askedToInvent: boolean;
  /** assistant.ts's validateOp, bound to the library and this turn's grounding. */
  validate: (op: ParsedOp) => { action?: AssistantAction; note?: string; settled?: boolean; missingApp?: boolean };
  describeJob: (job: IngestJob, now?: number) => string;
  describeAi: (ai: AiStatus | null) => string;
  /** Turns "I've deleted X" into "I can delete X" — the model may only ever offer. */
  unclaim: (text: string) => string;
};

// ─── The model ───────────────────────────────────────────────────────────────

type AgentConfig = { url: string; key: string; provider: 'ollama' | 'openai-compatible'; configuredChat: string; configuredModel: string };

function agentConfig(): AgentConfig {
  const saved = readSettings();
  const url = (process.env.MOTVIN_AI_URL || saved.url || 'http://localhost:11434/v1').replace(/\/+$/, '');
  return {
    url,
    key: process.env.MOTVIN_AI_KEY || saved.key || '',
    provider: /11434/.test(url) ? 'ollama' : 'openai-compatible',
    configuredChat: process.env.MOTVIN_AI_CHAT_MODEL || saved.chatModel || '',
    configuredModel: process.env.MOTVIN_AI_MODEL || saved.model || '',
  };
}

function headers(config: AgentConfig): Record<string, string> {
  const out: Record<string, string> = { 'content-type': 'application/json' };
  if (config.key) out.authorization = `Bearer ${config.key}`;
  return out;
}

type ModelPick = { at: number; url: string; model: string | null };
const pickCache: ModelPick = ((globalThis as unknown as { __motvinAgentModel?: ModelPick }).__motvinAgentModel ??= { at: 0, url: '', model: null });

/** Parameter count in billions, read off Ollama's "14.8B" or the model name's "14b". */
function sizeOf(name: string, parameterSize?: string): number {
  const fromDetails = parameterSize?.match(/([\d.]+)\s*B/i)?.[1];
  const fromName = name.match(/(\d+(?:\.\d+)?)b\b/i)?.[1];
  return Number(fromDetails ?? fromName ?? 0);
}

/**
 * The model that answers the chat. On Ollama, every installed model is
 * asked for its capabilities and the largest that can call tools wins —
 * general models over code models, a tool-tuned build over a plain one.
 * Elsewhere the configured chat (or main) model is trusted to call tools.
 */
async function pickAgentModel(config: AgentConfig): Promise<string | null> {
  if (pickCache.model !== null && pickCache.url === config.url && Date.now() - pickCache.at < 60_000) return pickCache.model || null;
  let chosen: string | null = null;
  if (config.provider !== 'ollama') {
    chosen = config.configuredChat || config.configuredModel || null;
  } else {
    const base = config.url.replace(/\/v1\/?$/, '');
    try {
      const tags = (await (await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) })).json()) as { models?: { name: string; details?: { parameter_size?: string } }[] };
      const installed = tags.models ?? [];
      const capable: { name: string; score: number }[] = [];
      for (const entry of installed) {
        if (/embed|whisper|nomic/i.test(entry.name)) continue;
        try {
          const shown = (await (await fetch(`${base}/api/show`, { method: 'POST', body: JSON.stringify({ model: entry.name }), signal: AbortSignal.timeout(4000) })).json()) as { capabilities?: string[] };
          if (!shown.capabilities?.includes('tools')) continue;
        } catch {
          continue;
        }
        const size = sizeOf(entry.name, entry.details?.parameter_size);
        const coder = /coder|code/i.test(entry.name);
        const tuned = /tools/i.test(entry.name);
        // Size first; a general model beats a code model of the same size,
        // and a tool-tuned build beats a plain one.
        capable.push({ name: entry.name, score: size * 10 + (coder ? 0 : 5) + (tuned ? 2 : 0) });
      }
      const configured = capable.find((entry) => entry.name === config.configuredChat);
      chosen = configured?.name ?? capable.sort((a, b) => b.score - a.score)[0]?.name ?? null;
    } catch {
      chosen = null;
    }
  }
  pickCache.at = Date.now();
  pickCache.url = config.url;
  pickCache.model = chosen ?? '';
  return chosen;
}

/** Forgets the picked model — after the AI settings change. */
export function forgetAgentModel() {
  pickCache.at = 0;
  pickCache.model = null;
}

type ToolDef = { name: string; description: string; parameters: Record<string, unknown> };
type ToolCall = { id: string; name: string; args: Record<string, unknown> };
type Turn =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: string; tool_calls: unknown[] }
  | { role: 'tool'; content: string; tool_call_id?: string; tool_name?: string };

async function chat(config: AgentConfig, model: string, messages: Turn[], tools: ToolDef[]): Promise<{ content: string; toolCalls: ToolCall[]; raw: unknown }> {
  const toolSpecs = tools.map((tool) => ({ type: 'function', function: { name: tool.name, description: tool.description, parameters: tool.parameters } }));
  if (config.provider === 'ollama') {
    const base = config.url.replace(/\/v1\/?$/, '');
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      headers: headers(config),
      body: JSON.stringify({ model, stream: false, messages, tools: toolSpecs, think: false, keep_alive: '30m', options: { temperature: 0.1, num_ctx: 16384, num_predict: 500 } }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`ollama ${response.status}: ${(await response.text()).slice(0, 300)}`);
    const payload = (await response.json()) as { message?: { content?: string; tool_calls?: { function?: { name?: string; arguments?: unknown } }[] } };
    const message = payload.message ?? {};
    const toolCalls = (message.tool_calls ?? []).map((call, index) => ({
      id: `call_${index}`,
      name: String(call.function?.name ?? ''),
      args: parseArgs(call.function?.arguments),
    })).filter((call) => call.name);
    if (toolCalls.length) return { content: String(message.content ?? ''), toolCalls, raw: message };
    const fromText = toolCallsFromText(String(message.content ?? ''), tools);
    return { content: fromText.rest, toolCalls: fromText.calls, raw: fromText.calls.length ? { role: 'assistant', content: '', tool_calls: fromText.calls.map((call) => ({ function: { name: call.name, arguments: call.args } })) } : message };
  }
  const response = await fetch(`${config.url}/chat/completions`, {
    method: 'POST',
    headers: headers(config),
    body: JSON.stringify({ model, messages, tools: toolSpecs, temperature: 0.1, max_tokens: 500 }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`${config.provider} ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = (await response.json()) as { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: unknown } }[] } }[] };
  const message = payload.choices?.[0]?.message ?? {};
  const toolCalls = (message.tool_calls ?? []).map((call, index) => ({
    id: String(call.id ?? `call_${index}`),
    name: String(call.function?.name ?? ''),
    args: parseArgs(call.function?.arguments),
  })).filter((call) => call.name);
  if (toolCalls.length) return { content: String(message.content ?? ''), toolCalls, raw: message };
  const fromText = toolCallsFromText(String(message.content ?? ''), tools);
  return { content: fromText.rest, toolCalls: fromText.calls, raw: fromText.calls.length ? { role: 'assistant', content: '', tool_calls: fromText.calls.map((call) => ({ id: call.id, type: 'function', function: { name: call.name, arguments: JSON.stringify(call.args) } })) } : message };
}

/**
 * Tool calls a model wrote out as text. Some tool-tuned models — the
 * Qwen 2.5 coder builds on Ollama among them — answer with the call as JSON
 * in the message body, bare or inside <tools>/<tool_call> tags or a code
 * fence, rather than in the structured field. Each JSON object naming a
 * known tool is taken as one call; what is left over is the model's words.
 */
function toolCallsFromText(content: string, tools: ToolDef[]): { calls: ToolCall[]; rest: string } {
  const known = new Set(tools.map((tool) => tool.name));
  const calls: ToolCall[] = [];
  let rest = content;
  if (!known.size || !/\{/.test(content)) return { calls, rest };
  // Every balanced {...} in the text, outermost first.
  const spans: [number, number][] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) depth--;
      if (depth === 0 && start >= 0) {
        spans.push([start, i + 1]);
        start = -1;
      }
    }
  }
  const remove: [number, number][] = [];
  for (const [from, to] of spans) {
    try {
      const parsed = JSON.parse(content.slice(from, to)) as { name?: unknown; function?: { name?: unknown; arguments?: unknown }; arguments?: unknown; parameters?: unknown; tool?: unknown };
      const name = String(parsed.function?.name ?? parsed.name ?? parsed.tool ?? '');
      if (!known.has(name)) continue;
      calls.push({ id: `call_${calls.length}`, name, args: parseArgs(parsed.function?.arguments ?? parsed.arguments ?? parsed.parameters) });
      remove.push([from, to]);
    } catch {
      /* not JSON */
    }
  }
  if (!calls.length) return { calls, rest };
  for (const [from, to] of [...remove].reverse()) rest = rest.slice(0, from) + rest.slice(to);
  rest = rest.replace(/<\/?(?:tools?|tool_calls?|function_calls?)>/gi, '').replace(/```(?:json)?/gi, '').replace(/\s{2,}/g, ' ').trim();
  return { calls, rest };
}

const DEBUG = process.env.MOTVIN_AGENT_DEBUG === '1';
function debug(label: string, value: unknown) {
  if (DEBUG) console.error(`[agent] ${label}:`, typeof value === 'string' ? value : JSON.stringify(value));
}

function parseArgs(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return {};
}

// ─── The tools ───────────────────────────────────────────────────────────────

const str = (description: string) => ({ type: 'string', description });
const strList = (description: string) => ({ type: 'array', items: { type: 'string' }, description });
const obj = (properties: Record<string, unknown>, required: string[] = []) => ({ type: 'object', properties, required });

const APP = str('The app, by name, exactly as the library has it.');
const SCREEN = str('The screen, by name.');
const VERSION_OF_SCREEN = str("The version the screen is in — a date like '29 Sep 2026' or 'latest' — when the admin named one; omit otherwise.");
const FLOW = str('The flow, by name.');

/** Read tools: answered here, at once, and fed back to the model. */
const READ_TOOLS: ToolDef[] = [
  { name: 'list_apps', description: 'Every app in the library with its screen and flow counts and its versions (dated captures), newest first.', parameters: obj({}) },
  { name: 'get_app', description: "One app in full: name, tagline, industry, website, logo, source status, versions, flows with their steps, and screen names grouped by version.", parameters: obj({ app: APP }, ['app']) },
  { name: 'list_screens', description: "An app's screens by name, with type and version — all versions, or one.", parameters: obj({ app: APP, version: str("A version — date or 'latest' — to limit to; omit for all.") }, ['app']) },
  { name: 'list_flows', description: "An app's flows, each with its steps in order.", parameters: obj({ app: APP }, ['app']) },
  { name: 'get_runs', description: 'The video ingest runs — what is running now and how far, and recent finished ones.', parameters: obj({}) },
  { name: 'get_ai', description: 'Which AI models are connected and what each does.', parameters: obj({}) },
];

/** Write tools: never run here — validated, then offered to the admin as one Confirm button. */
const WRITE_TOOLS: (ToolDef & { kind: string })[] = [
  { kind: 'remove-app', name: 'remove_app', description: 'Remove an entire app: all its screens, flows and versions. For "delete X" with no version, screen or flow named.', parameters: obj({ app: APP }, ['app']) },
  { kind: 'delete-app-version', name: 'delete_version', description: "Delete one dated version (capture) of an app and its screens. Only when a version is meant — 'the Sep 29 version', 'the latest capture'.", parameters: obj({ app: APP, version: str("Which version — a date like '29 Sep 2026', '2026-09-29', or 'latest'.") }, ['app', 'version']) },
  { kind: 'rename-app-version', name: 'change_version_date', description: "Change the date of one of an app's versions. The newest date is the one shown as 'Latest'.", parameters: obj({ app: APP, version: str("The version to change — a date or 'latest'."), to: str('The new date the admin wrote, e.g. 2026-10-05 or 5 Oct 2026.') }, ['app', 'version', 'to']) },
  { kind: 'delete-screen', name: 'delete_screen', description: 'Delete one screen of an app for good.', parameters: obj({ app: APP, screen: SCREEN, version: VERSION_OF_SCREEN }, ['app', 'screen']) },
  { kind: 'rename-screen', name: 'rename_screen', description: 'Rename a screen.', parameters: obj({ app: APP, screen: SCREEN, to: str('The new name, in the admin’s words.'), version: VERSION_OF_SCREEN }, ['app', 'screen', 'to']) },
  { kind: 'set-screen-type', name: 'set_screen_type', description: 'Set a screen’s type (splash, onboarding, login, home, checkout, …).', parameters: obj({ app: APP, screen: SCREEN, to: str('The screen type.'), version: VERSION_OF_SCREEN }, ['app', 'screen', 'to']) },
  { kind: 'set-screen-tags', name: 'set_screen_tags', description: 'Add tags to a screen, or replace its tags.', parameters: obj({ app: APP, screen: SCREEN, tags: strList('The tags.'), mode: { type: 'string', enum: ['add', 'replace'], description: 'add keeps existing tags; replace drops them.' }, version: VERSION_OF_SCREEN }, ['app', 'screen', 'tags']) },
  { kind: 'set-screen-description', name: 'set_screen_description', description: 'Set the one- or two-sentence description of a screen.', parameters: obj({ app: APP, screen: SCREEN, to: str('The description, in the admin’s words.'), version: VERSION_OF_SCREEN }, ['app', 'screen', 'to']) },
  { kind: 'set-screen-details', name: 'set_screen_details', description: 'Set a screen’s captured date, its list of components (elements), or its style tags.', parameters: obj({ app: APP, screen: SCREEN, capturedAt: str('The capture date the admin wrote, if any.'), elements: strList('Component names, if given.'), style: strList('Style tags from the allowed list, if given.'), version: VERSION_OF_SCREEN }, ['app', 'screen']) },
  { kind: 'update-app', name: 'update_app', description: "Change an app's name, tagline, industry or website (the App Store / site link). Only values the admin wrote, or asked you to suggest.", parameters: obj({ app: APP, fields: obj({ name: str('New name.'), tagline: str('New tagline.'), industry: str('Industry from the allowed list.'), website: str('The link, exactly as the admin gave it.') }) }, ['app', 'fields']) },
  { kind: 'update-app', name: 'rename_app', description: "Rename an app — change the app's own name (not a screen or flow).", parameters: obj({ app: APP, to: str('The new name, in the admin’s words.') }, ['app', 'to']) },
  { kind: 'create-app', name: 'create_app', description: 'Create an app record with no screens yet, by name. Only when the admin gives a name and no recording — otherwise use upload_recording.', parameters: obj({ to: str('The new app’s name.'), industry: str('Industry from the allowed list, if said.') }, ['to']) },
  { kind: 'set-logo', name: 'set_logo', description: "Set an app's logo from the image the admin dropped (or will pick on confirm).", parameters: obj({ app: APP }, ['app']) },
  { kind: 'add-screen', name: 'add_screen', description: 'Add the dropped image to an app as a new screen.', parameters: obj({ app: APP, version: str("The version to add it to — a date or 'latest'; omit for the newest.") }, ['app']) },
  { kind: 'create-flow', name: 'create_flow', description: 'Create a flow (an ordered journey of screens) in an app.', parameters: obj({ app: APP, to: str('The flow’s name.'), category: str('A flow category, if said.'), screens: strList('Screen names in order, if given.') }, ['app', 'to']) },
  { kind: 'rename-flow', name: 'rename_flow', description: 'Rename a flow.', parameters: obj({ app: str('The app, if known.'), flow: FLOW, to: str('The new name.') }, ['flow', 'to']) },
  { kind: 'delete-flow', name: 'delete_flow', description: 'Delete a flow; its screens stay.', parameters: obj({ app: str('The app, if known.'), flow: FLOW }, ['flow']) },
  { kind: 'set-flow-category', name: 'set_flow_category', description: 'File a flow under a category.', parameters: obj({ app: str('The app, if known.'), flow: FLOW, to: str('The category.') }, ['flow', 'to']) },
  { kind: 'set-flow-parent', name: 'set_flow_parent', description: 'Nest a flow under another, or make it top-level.', parameters: obj({ app: str('The app, if known.'), flow: FLOW, parent: str('The parent flow’s name, or "none" for top level.') }, ['flow']) },
  { kind: 'add-to-flow', name: 'add_to_flow', description: 'Add screens to a flow.', parameters: obj({ app: APP, flow: FLOW, screens: strList('Screen names.') }, ['app', 'flow', 'screens']) },
  { kind: 'remove-from-flow', name: 'remove_from_flow', description: 'Take screens out of a flow; they stay in the library.', parameters: obj({ app: APP, flow: FLOW, screens: strList('Screen names.') }, ['app', 'flow', 'screens']) },
  { kind: 'reorder-flow', name: 'reorder_flow', description: 'Reorder the steps of a flow: move one step (to a position, or before/after another step), or give the full new order.', parameters: obj({ app: str('The app, if known.'), flow: FLOW, screen: str('The one step to move, if moving one.'), position: str("1-based position, or 'first'/'last'."), before: str('The step it should go before.'), after: str('The step it should go after.'), screens: strList('Every step in the new order, if giving the whole order.') }, ['flow']) },
  { kind: 'set-source-status', name: 'set_source_status', description: "Mark an app's source record pending, review, approved or rejected. Approved apps are published.", parameters: obj({ app: APP, to: { type: 'string', enum: ['pending', 'review', 'approved', 'rejected'] } }, ['app', 'to']) },
  { kind: 'rebuild', name: 'rebuild_index', description: 'Rebuild the library index from what is stored. Rarely needed — every change already does it.', parameters: obj({}) },
  { kind: 'stop-run', name: 'stop_run', description: 'Stop the video ingest run that is going.', parameters: obj({}) },
  { kind: 'research-app', name: 'rewrite_names', description: "Have the AI rewrite an app's screen and flow names from its stored screens.", parameters: obj({ app: APP }, ['app']) },
  { kind: 'set-ai', name: 'set_ai', description: 'Switch the chat AI model, or turn the AI off/on.', parameters: obj({ model: str('A model name the server lists.'), enabled: { type: 'boolean', description: 'false to turn the AI off, true to turn it on.' } }) },
  { kind: 'upload', name: 'upload_recording', description: 'Open the file picker for a screen recording. This is how a new app — or new screens for one — gets added; use it for "add an app", "new app", "upload".', parameters: obj({}) },
  { kind: 'open', name: 'open_page', description: 'Give the admin a button to a page of the library or to an app.', parameters: obj({ page: str('explore, apps, screens, ui elements, flows, patterns, collections or admin.'), app: str('An app, to open its page.') }) },
];

const SYSTEM = `You are the Motvin assistant — the helper inside Motvin Inspirations, a design-reference library like Mobbin — talking with the library's admin. You sound like a sharp, friendly colleague: warm, brief, specific, plain English. No markdown headings, tables or code; never write a URL or a file path (links come as buttons).

You act through tools, and only through tools.
- Read tools (list_apps, get_app, list_screens, list_flows, get_runs, get_ai) tell you what exists. Call them whenever you are not certain of a name, a version, a count or a run — never guess or invent an app, screen, flow, date or number.
- Write tools propose ONE change. You never perform it: the admin sees your proposal with a Confirm button, and nothing happens until they press it. So never say a change is done, saved or removed — say what will happen once they confirm.
- If a write tool comes back with a problem (not found, ambiguous, a value missing), do not retry the same call: look it up with a read tool, or ask the admin one short question.

Understand what is meant, from the whole conversation:
- "delete Swiggy" / "remove the app" is remove_app. "Sorry, version" or "I mean the version" right after that is delete_version for the same app — carry the subject over from your last proposal. A screen, flow, tagline or logo named makes it about that part, not the app.
- "Add an app", "add a new app", "new app", "another app", "upload" is upload_recording, at once — the app, its name and its screens all come from the screen recording, so never ask for a name or industry first. Only "create an app called X" (a name given, no recording) is create_app.
- Names, taglines and links must be the admin's own words; only when they ask you to suggest one may you write one, and then say it is a suggestion.
- A bare "yes" or "ok" means nothing here; the Confirm button is how things go ahead.
- Never announce that you will look something up or do something — call the tool in this same turn instead. Words without a tool call change nothing.

Reply in one or two sentences. If you proposed a change, describe it as what will happen when they confirm and invite them to confirm. If you asked a read tool something, answer from what it returned. If nothing needs changing, just answer, or ask.`;

// ─── The turn ────────────────────────────────────────────────────────────────

const norm = (text: string) => text.toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();

function findApp(state: LibraryState | null, wanted: unknown) {
  const needle = norm(String(wanted ?? ''));
  if (!needle) return null;
  const apps = state?.apps ?? [];
  return apps.find((app) => norm(app.name) === needle || app.id === needle.replace(/\s+/g, '-')) ?? apps.find((app) => norm(app.name).startsWith(needle) || needle.startsWith(norm(app.name))) ?? apps.find((app) => needle.includes(norm(app.name))) ?? null;
}

function screenNameOf(file: { file: string; sidecar?: { name?: string } | null }): string {
  return file.sidecar?.name || file.file.replace(/\.[^.]+$/, '').replace(/[-_/]+/g, ' ');
}

/** What a read tool says, as text for the model. */
function answerRead(name: string, args: Record<string, unknown>, deps: AgentDeps): string {
  const state = deps.state;
  const apps = state?.apps ?? [];
  const files = state?.files ?? [];
  const flows = state?.flows ?? [];
  const versionsOf = (app: { versions?: { id: string; label: string; isLatest: boolean }[] }) => (app.versions ?? []).map((v) => (v.isLatest ? `Latest (${v.label}, id ${v.id})` : `${v.label} (id ${v.id})`)).join(', ') || 'none';
  const flowLine = (flow: { name: string; screenIds?: string[]; parentId?: string | null }) => `${flow.name}${flow.parentId ? ` (under ${flows.find((entry) => entry.id === flow.parentId)?.name ?? '?'})` : ''}: ${(flow.screenIds ?? []).map((id) => screenNameOf(files.find((file) => file.id === id) ?? { file: id })).join(' → ') || 'no steps'}`;
  switch (name) {
    case 'list_apps':
      return apps.length
        ? apps.map((app) => `${app.name} (id ${app.id}): ${files.filter((file) => file.appId === app.id).length} screens, ${flows.filter((flow) => flow.appId === app.id).length} flows. Versions: ${versionsOf(app)}.`).join('\n')
        : 'The library has no apps yet.';
    case 'get_app':
    case 'list_screens':
    case 'list_flows': {
      const app = findApp(state, args.app);
      if (!app) return `No app called “${String(args.app ?? '')}”. The apps are: ${apps.map((entry) => entry.name).join(', ') || 'none'}.`;
      const own = files.filter((file) => file.appId === app.id);
      const ownFlows = flows.filter((flow) => flow.appId === app.id);
      if (name === 'list_flows') return ownFlows.length ? ownFlows.map(flowLine).join('\n') : `${app.name} has no flows.`;
      const wantedVersion = typeof args.version === 'string' && args.version.trim() ? args.version.trim() : '';
      const versions = app.versions ?? [];
      const byVersion = (versionId: string) => own.filter((file) => file.version === versionId).map((file) => `${screenNameOf(file)}${file.sidecar && 'screenType' in file.sidecar && file.sidecar.screenType ? ` [${String(file.sidecar.screenType)}]` : ''}`);
      const grouped = versions
        .filter((v) => !wantedVersion || v.id === wantedVersion || norm(v.label) === norm(wantedVersion) || (/^latest$/i.test(wantedVersion) && v.isLatest) || norm(v.label).includes(norm(wantedVersion)))
        .map((v) => {
          const names = byVersion(v.id);
          return `${v.isLatest ? `Latest (${v.label})` : v.label} — ${names.length} screen${names.length === 1 ? '' : 's'}: ${names.join(', ') || 'none'}`;
        });
      if (!versions.length && own.length) grouped.push(`Undated — ${own.length} screen${own.length === 1 ? '' : 's'}: ${own.map(screenNameOf).join(', ')}`);
      if (name === 'list_screens') return grouped.length ? `${app.name} has ${own.length} screen${own.length === 1 ? '' : 's'} in all.\n${grouped.join('\n')}` : `${app.name} has no version like “${wantedVersion}”. Its versions: ${versionsOf(app)}.`;
      return [
        `${app.name} (id ${app.id}): tagline “${app.tagline ?? ''}”, industry ${app.industry ?? '?'}, website ${app.website ?? 'none'}, logo ${app.logo ? 'set' : 'none'}, source status ${state?.sources?.[app.id]?.status ?? 'unknown'}.`,
        `Versions, newest first: ${versionsOf(app)}.`,
        `${own.length} screen${own.length === 1 ? '' : 's'} in all, by version:\n${grouped.join('\n') || 'none'}`,
        `Flows:\n${ownFlows.map(flowLine).join('\n') || 'none'}`,
      ].join('\n');
    }
    case 'get_runs': {
      const now = Date.now();
      return deps.jobs.length ? deps.jobs.slice(0, 5).map((job) => `- ${deps.describeJob(job, now)}`).join('\n') : 'No runs since the server started.';
    }
    case 'get_ai':
      return deps.describeAi(deps.ai);
    default:
      return `Unknown tool ${name}.`;
  }
}

/** The write tool's arguments, as the operation assistant.ts validates. */
function toParsedOp(tool: (typeof WRITE_TOOLS)[number], args: Record<string, unknown>): ParsedOp {
  const text = (key: string) => (typeof args[key] === 'string' ? (args[key] as string) : typeof args[key] === 'number' ? String(args[key]) : undefined);
  const op: ParsedOp = { kind: tool.kind, app: text('app') ?? null };
  if (tool.name === 'rename_app') return { ...op, fields: { name: text('to') ?? '' } };
  if (tool.kind === 'delete-app-version') op.to = text('version');
  else {
    if (args.version !== undefined) op.version = text('version') ?? null;
    if (args.to !== undefined) op.to = text('to');
  }
  if (args.screen !== undefined) op.screen = text('screen');
  if (args.flow !== undefined) op.flow = text('flow');
  if (args.tags !== undefined) op.tags = args.tags;
  if (args.mode !== undefined) op.mode = text('mode');
  if (args.screens !== undefined) op.screens = args.screens;
  if (args.category !== undefined) op.category = text('category') ?? null;
  if (args.parent !== undefined) op.parent = text('parent') ?? null;
  if (args.page !== undefined) op.page = text('page') ?? null;
  if (args.model !== undefined) op.model = text('model') ?? null;
  if (typeof args.enabled === 'boolean') op.enabled = args.enabled;
  if (args.fields && typeof args.fields === 'object') op.fields = args.fields as Record<string, unknown>;
  if (args.position !== undefined) op.position = typeof args.position === 'number' ? args.position : text('position') ?? null;
  if (args.before !== undefined) op.before = text('before') ?? null;
  if (args.after !== undefined) op.after = text('after') ?? null;
  if (args.capturedAt !== undefined) op.capturedAt = text('capturedAt') ?? null;
  if (args.elements !== undefined) op.elements = args.elements;
  if (args.style !== undefined) op.style = args.style;
  if (args.industry !== undefined) op.industry = text('industry') ?? null;
  return op;
}

/**
 * The conversation so far, as turns. The dock keeps only words, but the
 * model learns from what it sees: an assistant line that reads as a
 * proposal with no call behind it teaches it to answer in words alone. So
 * the most recent proposal is shown as the tool call it was, with its
 * result, before the line that described it.
 */
function historyTurns(history: HistoryLine[], lastOp: AdminOp | null): Turn[] {
  const turns: Turn[] = [];
  const lastAssistant = [...history].reverse().find((line) => line.role === 'assistant');
  const tool = lastOp ? WRITE_TOOLS.find((entry) => entry.kind === lastOp.kind) : null;
  for (const line of history) {
    if (line.role === 'user') {
      turns.push({ role: 'user', content: line.text });
      continue;
    }
    if (line === lastAssistant && tool && lastOp) {
      const record = lastOp as unknown as Record<string, unknown>;
      const args: Record<string, unknown> = {};
      if (typeof record.name === 'string' && 'appId' in record && !('flowId' in record) && !('file' in record)) args.app = record.name;
      else if (typeof record.appId === 'string') args.app = record.appId;
      if (typeof record.file === 'string') args.screen = record.name;
      if (typeof record.flowId === 'string') args.flow = record.name;
      if (typeof record.versionLabel === 'string') args.version = record.versionLabel;
      if (record.fields && typeof record.fields === 'object') args.fields = record.fields;
      turns.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: tool.name, arguments: args } }] });
      turns.push({ role: 'tool', tool_name: tool.name, content: 'Proposed to the admin, waiting for their Confirm. Nothing has happened yet.' });
    }
    turns.push({ role: 'assistant', content: line.text });
  }
  return turns;
}

/**
 * One turn. Null when no tool-capable model is available, so the caller can
 * fall back to the older pipeline.
 */
export async function runAgent(input: AgentInput, deps: AgentDeps): Promise<AssistantAnswer | null> {
  const config = agentConfig();
  const model = await pickAgentModel(config);
  if (!model) return null;

  const apps = deps.state?.apps ?? [];
  // What rarely changes goes in the system prompt, so the server's prompt
  // cache covers it turn after turn; what changes every turn rides with the
  // question. (A system message anywhere in the list is folded into the
  // prefix by the chat template, so a changing one would throw the whole
  // cache away — twenty seconds a turn on a 14B model.)
  const standing = [
    `Today: ${localDateString()}.`,
    `Apps in the library: ${apps.map((app) => `${app.name} (versions: ${(app.versions ?? []).map((v) => (v.isLatest ? `Latest = ${v.label}` : v.label)).join(', ') || 'none'})`).join('; ') || 'none yet'}.`,
    `Screen types: ${(deps.state?.vocabulary?.screenTypes ?? []).map((entry) => entry.replace(/_/g, ' ')).join(', ')}. Flow categories: ${(deps.state?.vocabulary?.flowCategories ?? []).join(', ')}. Industries: ${(deps.state?.vocabulary?.industries ?? []).join(', ')}. Styles: ${(deps.state?.vocabulary?.styles ?? []).join(', ')}.`,
  ].join('\n');
  const rightNow = [
    input.pending ? `an earlier proposal is still waiting for the admin's Confirm: “${input.pending}” — it has not happened` : 'nothing is waiting for confirmation',
    input.lastOp ? `your most recent proposal was ${JSON.stringify(input.lastOp)}, and a short correction refers to it` : null,
    input.heldImage ? `the admin has dropped an image named “${input.heldImage}” — “this” or “this image” means it (set_logo or add_screen)` : null,
    input.expecting ? `you asked the admin to type the ${input.expecting.field} for ${input.expecting.app}; unless this message is clearly something else, it is that ${input.expecting.field}, word for word — call update_app with it` : null,
    deps.jobs.some((job) => job.status === 'running' || job.status === 'uploading') ? 'a run is in progress' : 'no run is in progress',
    deps.describeAi(deps.ai),
  ]
    .filter(Boolean)
    .join('; ');

  const messages: Turn[] = [
    { role: 'system', content: `${SYSTEM}\n\nStanding facts:\n${standing}` },
    ...historyTurns(input.history.slice(-10), input.lastOp),
    { role: 'user', content: `${input.question}\n\n[Note, not from the admin — right now: ${rightNow}.]` },
  ];
  const tools = [...READ_TOOLS, ...WRITE_TOOLS];

  let action: AssistantAction | undefined;
  let note: string | undefined;
  let lastContent = '';
  let settled = false;
  let nudged = 0;
  let lastNote: string | undefined;
  let narratedAtEnd = false;
  for (let round = 0; round < 5; round++) {
    const reply = await chat(config, model, messages, tools);
    debug(`round ${round} reply`, reply.raw);
    lastContent = reply.content.trim() || lastContent;
    // Nothing at all on the first round — a model that spent its budget
    // thinking, or one that does not really follow tools — is the caller's
    // cue to use the older pipeline instead.
    if (round === 0 && !reply.toolCalls.length && !lastContent) return null;
    if (!reply.toolCalls.length) {
      // A small model sometimes narrates the lookup ("I'll list its
      // screens") instead of making it. One reminder, then take its words.
      const narrated = /\b(?:I(?:'|’)ll|I will|let me|let(?:'|’)?s|I(?:'|’)m going to|I am going to|I can)\s+(?:now\s+|just\s+)?(?:call|use|invoke|run|list|check|look|find|get|fetch|retrieve|see|propose|delete|remove|rename|set|update|change|create|add|try)\b/i.test(reply.content);
      const toldToUpload = /\b(?:upload|drop|provide|share)\b[^.]*\b(?:recording|video)\b/i.test(reply.content);
      // "Confirm to remove …" / "… will be renamed once you confirm" with no
      // call behind it: the model copied the shape of its earlier answers
      // and proposed nothing.
      const describedChange = /\bconfirm\b/i.test(reply.content) && /\b(remov|delet|renam|set|updat|chang|add|creat|mov|reorder|approv|mark|switch|stop|rebuil)\w*\b/i.test(reply.content);
      // Asking what a new app is called: the recording answers that.
      const askedAppName = /\b(?:name|title|industry)\b/i.test(reply.content) && /\bnew app\b|\badd (?:an? |the )?app\b/i.test(input.question) && /\?|please/i.test(reply.content);
      narratedAtEnd = narrated || describedChange;
      if (nudged < 2 && (narrated || toldToUpload || describedChange || askedAppName)) {
        nudged++;
        messages.push({ role: 'assistant', content: reply.content });
        messages.push({
          role: 'user',
          content: `[Note, not from the admin: ${
            toldToUpload || askedAppName
              ? 'the admin cannot upload until you call upload_recording — it opens their file picker. Call it now, without any words.'
              : describedChange
                ? 'you described a change but called no write tool, so nothing was proposed and there is no Confirm button. Call the matching tool now (look the app up first if you must), without any words.'
                : 'you said what you would do but called no tool, so nothing happened. Call the tool now, in this turn, without any words.'
          }]`,
        });
        lastContent = '';
        continue;
      }
      break;
    }
    // The assistant turn goes back as the model produced it, then one tool
    // result per call, so the transcript stays well-formed for the next round.
    messages.push({ role: 'assistant', content: reply.content, tool_calls: (reply.raw as { tool_calls?: unknown[] })?.tool_calls ?? [] });
    let stop = false;
    for (const call of reply.toolCalls) {
      const read = READ_TOOLS.find((tool) => tool.name === call.name);
      if (read) {
        messages.push({ role: 'tool', tool_call_id: call.id, tool_name: call.name, content: answerRead(call.name, call.args, deps) });
        continue;
      }
      const write = WRITE_TOOLS.find((tool) => tool.name === call.name);
      if (!write) {
        messages.push({ role: 'tool', tool_call_id: call.id, tool_name: call.name, content: `There is no tool called ${call.name}. The tools are: ${tools.map((tool) => tool.name).join(', ')}.` });
        continue;
      }
      const checked = deps.validate(toParsedOp(write, call.args));
      if (checked.action) {
        action = checked.action;
        note = checked.note;
        stop = true;
        // The model is told the proposal stands, so its closing words (if it
        // writes any) describe it as pending rather than done.
        messages.push({ role: 'tool', tool_call_id: call.id, tool_name: call.name, content: `Proposed to the admin, waiting for their Confirm: ${checked.note ?? checked.action.type}. Nothing has happened yet.` });
        break;
      }
      if (checked.settled) {
        settled = true;
        note = checked.note;
        messages.push({ role: 'tool', tool_call_id: call.id, tool_name: call.name, content: `Nothing to change: ${checked.note}` });
        continue;
      }
      lastNote = checked.note ?? lastNote;
      messages.push({ role: 'tool', tool_call_id: call.id, tool_name: call.name, content: `Could not propose that: ${checked.note ?? 'a value is missing — ask the admin for it, in one short question.'}` });
    }
    if (stop) {
      // One short closing round for the wording. Whatever the model wrote
      // alongside the call was written before it knew the proposal stood,
      // so it is not used.
      messages.push({ role: 'user', content: `[Note, not from the admin: tell them, in one or two plain sentences and your own words, what will happen when they press Confirm — nothing has happened yet — and invite them to confirm. Do not call tools, do not repeat this note, do not say "proposal".]` });
      try {
        const closing = await chat(config, model, messages, tools);
        debug('closing', closing.raw);
        lastContent = closing.content.trim();
      } catch {
        lastContent = '';
      }
      break;
    }
  }
  debug('tool results', messages.filter((turn) => turn.role === 'tool').map((turn) => turn.content));

  // Words about the machinery — a tool's name, "the function", "let me
  // check" with no check behind it — are not for the admin; the
  // validation's own sentence, or a plain question, is.
  if (/`|\bfunction\b|\btool\b|\b[a-z]+_(?:app|screen|flow|version|recording|page|index|run|names|ai|status|date|type|tags|description|details|category|parent|logo)\b/i.test(lastContent)) lastContent = '';
  if (!action && narratedAtEnd) lastContent = lastNote ?? '';
  let text = deps.unclaim(lastContent).replace(/\s*(?:—|-|:|at|here)?\s*\[[^\]]{2,60}\]\s*[.,]?/g, '').replace(/\s*(?:—|-|:|at)?\s*https?:\/\/\S+/gi, '').replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (action?.type === 'confirm') {
    if (!text) text = note ?? action.label;
    if (!/confirm/i.test(text)) text = `${text} Confirm and it’s set.`;
  } else if (!text) {
    text = note ?? (settled ? 'Nothing needs changing there.' : 'Could you say that another way? Tell me the app and what should change.');
  }
  const actions: AssistantAction[] = action ? [action] : [];
  if (action?.type === 'confirm' && !action.destructive) actions.push({ type: 'reply', text: 'Cancel that' });
  if (action?.type === 'upload') actions.push({ type: 'reply', text: 'What should I record?' });
  return { text, source: 'ai', actions, model, streamed: false };
}
