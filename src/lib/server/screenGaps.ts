import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { claudeCli } from '@/lib/server/batch';
import { inspirationsDataDir } from '@/lib/server/reviews';

/**
 * Fills the gaps that keep a screen out of the search's Screens and UI Elements tabs: no UI elements, or a type
 * of only "other" (a manual upload whose details were typed in and left blank, say). Sonnet looks at each such
 * screen's picture and names its elements, and its type when it has none, from the library's own lists; the
 * answers go into the screen's sidecar .json, which the backend's manifest build reads. Run after an upload.
 *
 * A screen it has looked at is remembered (data/inspirations/screen-gaps-checked.json), so a splash or loading
 * screen that truly has nothing on it is not paid for again on every upload. One run at a time, as flowKinds.
 * Never throws; failures only log.
 */
const MODEL = 'claude-sonnet-5-5';
const BATCH = 8;
const CALL_TIMEOUT_MS = 6 * 60_000;

type ManifestScreen = { id: string; file: string; screenType?: string; elements?: string[] };

let running: Promise<void> | null = null;
let again = false;

export function fillScreenGaps(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      try {
        await fillOnce();
      } catch (failure) {
        console.warn('[screenGaps] filling failed:', (failure as Error).message);
      }
    } while (again);
  })().finally(() => {
    running = null;
  });
  return running;
}

const checkedFile = () => join(inspirationsDataDir(), 'screen-gaps-checked.json');

function readChecked(): Set<string> {
  try {
    return new Set((JSON.parse(readFileSync(checkedFile(), 'utf-8')) as { ids?: string[] }).ids ?? []);
  } catch {
    return new Set();
  }
}

function writeJson(path: string, value: unknown) {
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(`${path}.tmp`, path);
}

async function fillOnce() {
  const cli = claudeCli();
  if (!cli) return;
  const root = inspirationsDataDir();
  const manifestPath = join(root, 'manifest.json');
  if (!existsSync(manifestPath)) return;
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as {
    screens?: ManifestScreen[];
    taxonomy?: { elements?: string[]; screenTypes?: string[] };
  };
  const elements = manifest.taxonomy?.elements ?? [];
  const types = (manifest.taxonomy?.screenTypes ?? []).filter((type) => type !== 'other');
  const checked = readChecked();
  const todo = (manifest.screens ?? []).filter(
    (screen) => !checked.has(screen.id) && (!(screen.elements ?? []).length || !screen.screenType || screen.screenType === 'other'),
  );
  if (!todo.length) return;

  for (let i = 0; i < todo.length; i += BATCH) {
    const batch = todo.slice(i, i + BATCH);
    const dir = mkdtempSync(join(tmpdir(), 'motvin-screen-gaps-'));
    try {
      const names: string[] = [];
      for (const [n, screen] of batch.entries()) {
        const name = `${n + 1}.jpg`;
        await sharp(join(root, 'screens', screen.file)).resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(join(dir, name));
        names.push(name);
      }
      const answer = await ask(cli, dir, prompt(names, elements, types));
      if (!answer) return;
      const nowChecked = readChecked();
      for (const [n, screen] of batch.entries()) {
        const said = (answer[names[n]] ?? {}) as { elements?: unknown; type?: unknown };
        const sidecar = join(root, 'screens', screen.file.replace(/\.(webp|png|jpe?g)$/i, '.json'));
        if (existsSync(sidecar)) {
          const side = JSON.parse(readFileSync(sidecar, 'utf-8')) as { elements?: string[]; screenType?: string };
          let changed = false;
          const list = Array.isArray(said.elements) ? [...new Set(said.elements.filter((e): e is string => typeof e === 'string' && elements.includes(e)))] : [];
          if (list.length && !(side.elements ?? []).length) {
            side.elements = list;
            changed = true;
          }
          if (typeof said.type === 'string' && types.includes(said.type) && (!side.screenType || side.screenType === 'other')) {
            side.screenType = said.type;
            changed = true;
          }
          if (changed) writeJson(sidecar, side);
        }
        nowChecked.add(screen.id);
      }
      writeJson(checkedFile(), { ids: [...nowChecked] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

function prompt(names: string[], elements: string[], types: string[]): string {
  return [
    `Look at each of these app screenshots: ${names.join(', ')} (in this folder, use the Read tool).`,
    `For each, list the UI elements clearly visible on it, using ONLY these names: ${elements.join(', ')}.`,
    'A plain splash or loading screen with only a logo or spinner may have none (or just "progress" for a spinner or bar). Do not guess at things you cannot see.',
    `Also give the screen's type, ONLY one of: ${types.join(', ')}.`,
    `Answer with JSON only, no prose: {${names.map((n) => `"${n}":{"elements":[],"type":""}`).join(',')}}`,
  ].join('\n');
}

async function ask(cli: string, cwd: string, text: string): Promise<Record<string, unknown> | null> {
  try {
    const output = await new Promise<{ code: number | null; stdout: string }>((resolve) => {
      const child = spawn(cli, ['-p', text, '--model', MODEL, '--allowedTools', 'Read', '--output-format', 'json'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
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
  }
}
