import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { claudeCli } from '@/lib/server/batch';
import { inspirationsDataDir } from '@/lib/server/reviews';
import { FLOW_KIND_GROUPS, FLOW_KINDS } from '@/lib/inspirations/flowKinds';

/**
 * Gives every flow without one its standard kind (flowKinds.ts: Logging In, Browsing Home…), so a new upload's
 * flows join the search's Flows groups by themselves. Sonnet reads each flow's name, app and screen names —
 * text only — and picks one kind; the answers go into data/inspirations/flow-kinds.json ({ kinds: { id: kind } }),
 * which the backend's manifest build attaches to each flow. Run after an Agent Upload finishes an app.
 *
 * One run at a time: a call while one is going asks for another pass once it ends, so flows that arrive
 * meanwhile are not missed. A flow the agent leaves out (or names a kind not on the list) stays untagged and is
 * tried again next time. Never throws; failures only log.
 */
const MODEL = 'claude-sonnet-5-5';
const BATCH = 120;
const CALL_TIMEOUT_MS = 6 * 60_000;

type FlowRecord = { id: string; appId: string; name: string; category?: string; screenIds?: string[] };

let running: Promise<void> | null = null;
let again = false;

export function tagUntaggedFlows(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await tagOnce();
      } catch (failure) {
        console.warn('[flowKinds] tagging failed:', (failure as Error).message);
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

const kindsFile = () => join(inspirationsDataDir(), 'flow-kinds.json');

function readKinds(): Record<string, string> {
  try {
    return (JSON.parse(readFileSync(kindsFile(), 'utf-8')) as { kinds?: Record<string, string> }).kinds ?? {};
  } catch {
    return {};
  }
}

async function tagOnce() {
  const cli = claudeCli();
  if (!cli) return;
  const root = inspirationsDataDir();
  const flows = (JSON.parse(readFileSync(join(root, 'flows.json'), 'utf-8')) as { flows?: FlowRecord[] }).flows ?? [];
  const known = new Set<string>(FLOW_KINDS);
  const tagged = readKinds();
  const todo = flows.filter((flow) => !known.has(tagged[flow.id]));
  if (!todo.length) return;

  // Names to give the agent context: the app's, and each step's (the manifest's screen names).
  const manifestPath = join(root, 'manifest.json');
  const manifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf-8')) as { apps?: { id: string; name: string }[]; screens?: { id: string; name: string }[] })
    : {};
  const appName = new Map((manifest.apps ?? []).map((app) => [app.id, app.name]));
  const screenName = new Map((manifest.screens ?? []).map((screen) => [screen.id, screen.name]));

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const answer = await ask(cli, prompt(batch, appName, screenName));
    if (!answer) return;
    // Re-read before writing: another writer (a manual fix, an earlier pass) may have added kinds meanwhile.
    const kinds = readKinds();
    let added = 0;
    for (const flow of batch) {
      const kind = answer[flow.id];
      if (typeof kind === 'string' && known.has(kind)) {
        kinds[flow.id] = kind;
        added += 1;
      }
    }
    if (!added) continue;
    const tmp = `${kindsFile()}.tmp`;
    writeFileSync(tmp, JSON.stringify({ kinds }, null, 2));
    renameSync(tmp, kindsFile());
  }
}

function prompt(batch: FlowRecord[], appName: Map<string, string>, screenName: Map<string, string>): string {
  const lines = batch.map((flow) =>
    JSON.stringify({
      id: flow.id,
      app: appName.get(flow.appId) ?? flow.appId,
      flow: flow.name,
      category: flow.category ?? '',
      steps: (flow.screenIds ?? []).slice(0, 6).map((id) => screenName.get(id)).filter(Boolean).join(' > '),
    }),
  );
  return [
    'You tag UI flows from app recordings with ONE standard flow kind each, like Mobbin does.',
    '',
    'Standard kinds (use these exact strings, nothing else):',
    ...FLOW_KIND_GROUPS.map((group) => `${group.label}: ${group.kinds.join(' | ')}`),
    '',
    'Pick the kind that best describes what the user does in the flow. Use the flow name first, its steps (screen names) to decide when the name is vague (e.g. "Home" is Browsing Home, "Settings" is Browsing Settings, "Profile" is Viewing a Profile unless the steps edit it). Every flow gets exactly one kind.',
    '',
    'Flows (one JSON per line):',
    ...lines,
    '',
    'Answer with only a JSON object mapping each flow id to its kind, no other text.',
  ].join('\n');
}

/** One CLI call; the answer's id → kind object, or null when it failed or could not be read. */
async function ask(cli: string, text: string): Promise<Record<string, unknown> | null> {
  const dir = mkdtempSync(join(tmpdir(), 'motvin-flow-kinds-'));
  try {
    const output = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      const child = spawn(cli, ['-p', text, '--model', MODEL, '--output-format', 'json'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
      let stdout = '';
      child.stdout?.on('data', (chunk: Buffer) => {
        if (stdout.length < 4_000_000) stdout += chunk.toString();
      });
      const limit = setTimeout(() => child.kill('SIGTERM'), CALL_TIMEOUT_MS);
      child.on('close', (code) => {
        clearTimeout(limit);
        resolve({ code, stdout });
      });
      child.on('error', () => resolve({ code: -1, stdout }));
    });
    if (output.code !== 0) return null;
    const envelope = JSON.parse(output.stdout.trim().split('\n').pop() ?? '{}') as { result?: string; is_error?: boolean };
    if (envelope.is_error) return null;
    const result = String(envelope.result ?? '');
    return JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)) as Record<string, unknown>;
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
