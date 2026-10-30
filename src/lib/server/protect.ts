import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp, { type OverlayOptions } from 'sharp';
import { claudeCli } from '@/lib/server/batch';
import { inspirationsDataDir } from '@/lib/server/reviews';

/**
 * Protect screens: an agent looks at the library's screens and hides personal content on them — real
 * people's photos, phone numbers, emails, addresses, names in chats, card numbers — by blurring it (or
 * covering it with a grey box) inside the image file itself.
 *
 * Like Agent Upload (batch.ts), a check is a job kept on disk (data/batches/protect.json) and worked through
 * in the background by a runner that survives reloads. Screens are sent to Claude Code (Sonnet 5.5) a few at a
 * time; it reads the pictures and answers with boxes. Boxes on text are snapped to the screen's own OCR words,
 * so a phone number is covered exactly. With "Review first" a screen waits for the admin's approval; with
 * "Fix automatically" it is changed at once.
 *
 * A protected screen replaces the original: no copy of the original is kept anywhere. The screen's saved OCR
 * words inside the hidden areas are dropped too, so search can't find the hidden text either.
 */

export type ProtectKind = 'photo' | 'phone' | 'email' | 'address' | 'name' | 'card';
export const PROTECT_KINDS: ProtectKind[] = ['photo', 'phone', 'email', 'address', 'name', 'card'];
export type ProtectBox = { kind: ProtectKind; x: number; y: number; w: number; h: number; text?: string };

export type ProtectSettings = {
  platform: 'ios' | 'webapp' | 'web';
  kinds: ProtectKind[];
  mode: 'review' | 'auto';
  style: 'blur' | 'box';
  /** Leave out screens already checked (and not changed since). */
  onlyNew: boolean;
};

export type ProtectStage = 'queued' | 'checking' | 'clean' | 'found' | 'applied' | 'skipped' | 'failed';

export type ProtectItem = {
  screenId: string;
  appId: string;
  /** The image, relative to data/inspirations/screens. */
  file: string;
  name: string;
  stage: ProtectStage;
  boxes: ProtectBox[];
  error?: string;
};

export type ProtectJob = {
  id: string;
  createdAt: string;
  createdBy: string;
  finishedAt: string | null;
  state: 'running' | 'paused' | 'done';
  settings: ProtectSettings;
  apps: Array<{ appId: string; name: string }>;
  items: ProtectItem[];
  usage: { tokens: number; costUsd: number; calls: number };
  /** Time spent checking, waits left out. */
  workMs: number;
  /** Why the job stopped and what to do (not signed in, usage limit). */
  note: string | null;
  waitUntil: string | null;
  cleared?: boolean;
};

const MODEL = process.env.MOTVIN_SONNET_MODEL || 'claude-sonnet-5-5';
/** Screens per agent call: fewer calls, each still quick to read. */
const PER_CALL = 6;
const KEEP_JOBS = 10;
const CALL_TIMEOUT_MS = 6 * 60_000;

const screensDir = () => join(inspirationsDataDir(), 'screens');
const wordsDir = () => join(inspirationsDataDir(), 'words');
const protectDir = () => join(inspirationsDataDir(), '..', 'batches');
const jobsFile = () => join(protectDir(), 'protect.json');
/** screenId → the image's mtime when it was last checked, for "only screens not checked yet". */
const checkedFile = () => join(protectDir(), 'protect-checked.json');
const workDir = () => join(protectDir(), 'protect-work');

type Runner = { jobs: ProtectJob[]; loaded: boolean; timer: ReturnType<typeof setInterval> | null; ticking: boolean; child: ChildProcess | null; callStarted: number; lastTick: number };
const store = globalThis as unknown as { __motvinProtect?: Runner };
const runner: Runner = (store.__motvinProtect ??= { jobs: [], loaded: false, timer: null, ticking: false, child: null, callStarted: 0, lastTick: 0 });

function load() {
  if (runner.loaded) return;
  runner.loaded = true;
  try {
    const parsed = JSON.parse(readFileSync(jobsFile(), 'utf-8')) as { jobs?: ProtectJob[] };
    runner.jobs = parsed.jobs ?? [];
  } catch {
    runner.jobs = [];
  }
  // A screen being checked when the server stopped is checked again.
  for (const job of runner.jobs) for (const item of job.items) if (item.stage === 'checking') item.stage = 'queued';
}

function save() {
  mkdirSync(protectDir(), { recursive: true });
  runner.jobs = runner.jobs.slice(-KEEP_JOBS);
  const tmp = `${jobsFile()}.tmp`;
  writeFileSync(tmp, JSON.stringify({ jobs: runner.jobs }, null, 2));
  renameSync(tmp, jobsFile());
}

function readChecked(): Record<string, number> {
  try {
    return JSON.parse(readFileSync(checkedFile(), 'utf-8')) as Record<string, number>;
  } catch {
    return {};
  }
}

function markChecked(items: ProtectItem[]) {
  const checked = readChecked();
  for (const item of items) {
    try {
      checked[item.screenId] = statSync(join(screensDir(), item.file)).mtimeMs;
    } catch {
      // Gone since: nothing to remember.
    }
  }
  mkdirSync(protectDir(), { recursive: true });
  writeFileSync(checkedFile(), JSON.stringify(checked));
}

type ManifestScreen = { id: string; appId: string; file: string; name?: string; platform: string };
type Manifest = { apps: Array<{ id: string; name: string }>; screens: ManifestScreen[] };

function manifest(): Manifest {
  return JSON.parse(readFileSync(join(inspirationsDataDir(), 'manifest.json'), 'utf-8')) as Manifest;
}

/** Every app on a platform, with how many screens it has and how many haven't been checked yet. */
export function protectApps(platform: ProtectSettings['platform']) {
  const { apps, screens } = manifest();
  const checked = readChecked();
  const names = new Map(apps.map((app) => [app.id, app.name]));
  const counts = new Map<string, { screens: number; unchecked: number }>();
  for (const screen of screens) {
    if (screen.platform !== platform) continue;
    const entry = counts.get(screen.appId) ?? { screens: 0, unchecked: 0 };
    entry.screens += 1;
    if (!isChecked(screen, checked)) entry.unchecked += 1;
    counts.set(screen.appId, entry);
  }
  return [...counts].map(([appId, count]) => ({ appId, name: names.get(appId) ?? appId, ...count })).sort((a, b) => a.name.localeCompare(b.name));
}

function isChecked(screen: ManifestScreen, checked: Record<string, number>) {
  const at = checked[screen.id];
  if (at === undefined) return false;
  try {
    return statSync(join(screensDir(), screen.file)).mtimeMs <= at;
  } catch {
    return true;
  }
}

export function listProtectJobs(): ProtectJob[] {
  load();
  return runner.jobs.filter((job) => !job.cleared);
}

export function startProtectRunner() {
  load();
  if (runner.timer) return;
  runner.lastTick = Date.now();
  runner.timer = setInterval(() => void tick(), 2000);
}

export function createProtectJob(input: { createdBy: string; settings: ProtectSettings; appIds: string[] }): ProtectJob {
  load();
  const { apps, screens } = manifest();
  const checked = readChecked();
  const wanted = new Set(input.appIds);
  const picked = screens.filter((s) => s.platform === input.settings.platform && wanted.has(s.appId) && (!input.settings.onlyNew || !isChecked(s, checked)));
  const names = new Map(apps.map((app) => [app.id, app.name]));
  const job: ProtectJob = {
    id: `protect-${Date.now().toString(36)}`,
    createdAt: new Date().toISOString(),
    createdBy: input.createdBy,
    finishedAt: null,
    state: 'running',
    settings: input.settings,
    apps: input.appIds.map((appId) => ({ appId, name: names.get(appId) ?? appId })),
    items: picked.map((s) => ({ screenId: s.id, appId: s.appId, file: s.file, name: s.name ?? s.id, stage: 'queued', boxes: [] })),
    usage: { tokens: 0, costUsd: 0, calls: 0 },
    workMs: 0,
    note: null,
    waitUntil: null,
  };
  if (!job.items.length) {
    job.state = 'done';
    job.finishedAt = job.createdAt;
  }
  runner.jobs.push(job);
  save();
  startProtectRunner();
  return job;
}

export type ProtectAction = 'pause' | 'resume' | 'stop' | 'clear' | 'approve' | 'skip' | 'approve-all' | 'boxes';

export async function controlProtectJob(id: string, action: ProtectAction, screenId?: string, boxes?: ProtectBox[]): Promise<ProtectJob | null> {
  load();
  const job = runner.jobs.find((j) => j.id === id);
  if (!job) return null;
  const item = screenId ? job.items.find((i) => i.screenId === screenId) : undefined;
  switch (action) {
    case 'pause':
      if (job.state === 'running') job.state = 'paused';
      break;
    case 'resume':
      if (job.state !== 'done') {
        job.state = 'running';
        job.note = null;
        job.waitUntil = null;
      }
      break;
    case 'stop':
      runner.child?.kill('SIGTERM');
      for (const i of job.items) if (i.stage === 'queued' || i.stage === 'checking') i.stage = 'skipped';
      finish(job);
      break;
    case 'clear':
      job.cleared = true;
      break;
    case 'boxes':
      if (item && (item.stage === 'found' || item.stage === 'clean') && boxes) {
        item.boxes = cleanBoxes(boxes);
        item.stage = item.boxes.length ? 'found' : 'clean';
      }
      break;
    case 'approve':
      if (item && item.stage === 'found') await applyItem(job, item);
      break;
    case 'skip':
      if (item && (item.stage === 'found' || item.stage === 'queued')) {
        item.stage = 'skipped';
        if (item.boxes.length) markChecked([item]);
      }
      break;
    case 'approve-all':
      for (const i of job.items) if (i.stage === 'found') await applyItem(job, i);
      break;
  }
  save();
  return job;
}

function finish(job: ProtectJob) {
  if (job.state === 'done') return;
  job.state = 'done';
  job.finishedAt = new Date().toISOString();
}

async function tick() {
  if (runner.ticking) return;
  runner.ticking = true;
  const now = Date.now();
  const since = now - runner.lastTick;
  runner.lastTick = now;
  try {
    const job = runner.jobs.find((j) => j.state === 'running' && !j.cleared);
    if (!job) return;
    if (runner.child) {
      job.workMs += since;
      if (now - runner.callStarted > CALL_TIMEOUT_MS) runner.child.kill('SIGTERM');
      return;
    }
    if (job.waitUntil && Date.parse(job.waitUntil) > now) return;
    job.waitUntil = null;
    const next = job.items.filter((i) => i.stage === 'queued').slice(0, PER_CALL);
    if (!next.length) {
      finish(job);
      save();
      return;
    }
    await checkScreens(job, next);
  } finally {
    runner.ticking = false;
  }
}

const KIND_TEXT: Record<ProtectKind, string> = {
  photo: '"photo": a real personal photo or video thumbnail — real people, faces, homes, family or private moments, profile pictures of real people. In a photo picker, camera roll or gallery that shows the phone owner\'s own library, EVERY thumbnail is personal (screenshots and photos of screens too) — box each one, including ones cut off at the edges. NOT the app\'s own artwork, marketing images, promo banners, sample templates, illustrations, icons or logos.',
  phone: '"phone": a real phone number.',
  email: '"email": an email address. Leave out any email that contains "motvin" — those are the library\'s own test accounts.',
  address: '"address": a home or street address of a real person.',
  name: '"name": a real private person\'s name in chats, messages, contacts or comments (not brand, product or celebrity names, and not the app\'s own sample names).',
  card: '"card": a card, bank or account number.',
};

function prompt(kinds: ProtectKind[], files: string[]) {
  return [
    'You check app screenshots for personal content that must be hidden before they are published in a public UI library.',
    `Read each image file in the current folder: ${files.join(', ')}. Only read them; do not write, change or run anything.`,
    '',
    'Find only these kinds:',
    ...kinds.map((kind) => `- ${KIND_TEXT[kind]}`),
    '',
    'For each item give its box in PERCENT of the image: x = left edge, y = top edge, w = width, h = height, each 0–100. Box the whole thumbnail or the whole text run, tightly. In a grid of personal thumbnails give one box per thumbnail. For text kinds also give "text", exactly as it is shown.',
    'When unsure whether something is personal, leave it out. A screen with nothing to hide gets an empty list.',
    '',
    `Answer with JSON only, no prose and no code fence: {${files.map((f) => `"${f}":[]`).join(',')}} where each list holds objects like {"kind":"photo","x":10,"y":20,"w":30,"h":15,"text":""}.`,
  ].join('\n');
}

async function checkScreens(job: ProtectJob, items: ProtectItem[]) {
  const cli = claudeCli();
  if (!cli) {
    pauseWith(job, 'Claude Code isn’t installed on this Mac, so the agent can’t look at screens.');
    return;
  }
  for (const item of items) item.stage = 'checking';
  save();

  // Each picture as a small JPEG the agent can read, in a folder of its own.
  const dir = join(workDir(), `${job.id}-${Date.now().toString(36)}`);
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  const ready: ProtectItem[] = [];
  for (const [index, item] of items.entries()) {
    const name = `${index + 1}.jpg`;
    try {
      await sharp(join(screensDir(), item.file)).resize({ width: 1400, height: 1400, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(join(dir, name));
      files.push(name);
      ready.push(item);
    } catch (failure) {
      item.stage = 'failed';
      item.error = `Couldn’t read the image: ${(failure as Error).message}`;
    }
  }
  if (!ready.length) {
    rmSync(dir, { recursive: true, force: true });
    save();
    return;
  }

  const args = ['-p', prompt(job.settings.kinds, files), '--model', MODEL, '--allowedTools', 'Read', '--output-format', 'json'];
  runner.callStarted = Date.now();
  const output = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(cli, args, { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NO_COLOR: '1' } });
    runner.child = child;
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 4_000_000) stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 100_000) stderr += chunk.toString();
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.on('error', (failure) => resolve({ code: -1, stdout, stderr: failure.message }));
  });
  runner.child = null;
  rmSync(dir, { recursive: true, force: true });

  // Stopped while it ran: the job has already moved on.
  if (job.state === 'done') {
    for (const item of ready) if (item.stage === 'checking') item.stage = 'skipped';
    save();
    return;
  }

  const envelope = parseEnvelope(output.stdout);
  const said = `${envelope?.result ?? ''}\n${output.stderr}`;
  if (envelope) recordUsage(job, envelope);
  if (/not logged in|failed to authenticate|oauth|please run \/login|invalid api key/i.test(said)) {
    for (const item of ready) item.stage = 'queued';
    pauseWith(job, 'Claude Code isn’t signed in on this Mac. Sign in again in Terminal (run “claude”, then /login), then press Resume.');
    return;
  }
  if (/usage limit|rate limit|limit reached|resets/i.test(said) && !extractJson(envelope?.result ?? '')) {
    for (const item of ready) item.stage = 'queued';
    job.waitUntil = new Date(Date.now() + 30 * 60_000).toISOString();
    job.note = 'AI usage limit reached — it carries on by itself in 30 minutes.';
    save();
    return;
  }

  const answer = extractJson(envelope?.result ?? '') as Record<string, unknown> | null;
  if (!answer || envelope?.is_error) {
    for (const item of ready) {
      item.stage = 'failed';
      item.error = 'The agent’s answer couldn’t be read.';
    }
    save();
    return;
  }

  job.note = null;
  for (const [index, item] of ready.entries()) {
    const raw = answer[files[index]];
    const boxes = cleanBoxes(Array.isArray(raw) ? (raw as ProtectBox[]) : []).filter((box) => job.settings.kinds.includes(box.kind));
    item.boxes = snapToWords(item, boxes);
    if (!item.boxes.length) {
      item.stage = 'clean';
      markChecked([item]);
    } else if (job.settings.mode === 'auto') {
      await applyItem(job, item);
    } else {
      item.stage = 'found';
    }
  }
  save();
}

function pauseWith(job: ProtectJob, note: string) {
  job.state = 'paused';
  job.note = note;
  save();
}

type Envelope = { result?: string; is_error?: boolean; usage?: Record<string, number>; modelUsage?: Record<string, Record<string, number>>; total_cost_usd?: number };

function parseEnvelope(stdout: string): Envelope | null {
  try {
    return JSON.parse(stdout.trim().split('\n').filter(Boolean).at(-1) ?? '') as Envelope;
  } catch {
    return null;
  }
}

function recordUsage(job: ProtectJob, envelope: Envelope) {
  const models = Object.values(envelope.modelUsage ?? {});
  const sum = (key: string) => models.reduce((n, entry) => n + (entry[key] ?? 0), 0);
  const usage = envelope.usage ?? {};
  const tokens = models.length
    ? sum('inputTokens') + sum('cacheReadInputTokens') + sum('cacheCreationInputTokens') + sum('outputTokens')
    : (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0) + (usage.output_tokens ?? 0);
  job.usage = {
    tokens: job.usage.tokens + tokens,
    costUsd: Math.round((job.usage.costUsd + (envelope.total_cost_usd ?? 0)) * 100) / 100,
    calls: job.usage.calls + 1,
  };
}

function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

const clamp = (n: number) => Math.min(100, Math.max(0, n));

function cleanBoxes(boxes: ProtectBox[]): ProtectBox[] {
  return boxes
    .filter((box) => box && PROTECT_KINDS.includes(box.kind) && [box.x, box.y, box.w, box.h].every((n) => typeof n === 'number' && Number.isFinite(n)))
    .map((box) => {
      const x = clamp(box.x);
      const y = clamp(box.y);
      return { kind: box.kind, x, y, w: clamp(x + box.w) - x, h: clamp(y + box.h) - y, ...(box.text ? { text: String(box.text).slice(0, 200) } : {}) };
    })
    .filter((box) => box.w > 0.3 && box.h > 0.2)
    .slice(0, 80);
}

type Word = { text: string; left: number; top: number; width: number; height: number };

function readWords(screenId: string): { file: string; data: { text?: string; words?: Word[] } & Record<string, unknown> } | null {
  const file = join(wordsDir(), `${screenId}.json`);
  if (!existsSync(file)) return null;
  try {
    return { file, data: JSON.parse(readFileSync(file, 'utf-8')) };
  } catch {
    return null;
  }
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9@]+/g, '');

/**
 * The agent's box on a piece of text, moved onto the OCR words that spell it near where it pointed: exact
 * edges instead of an estimate. Photos keep their box, a touch larger so no edge peeks out.
 */
function snapToWords(item: ProtectItem, boxes: ProtectBox[]): ProtectBox[] {
  const words = readWords(item.screenId)?.data.words ?? [];
  return boxes.map((box) => {
    if (box.kind === 'photo') return grow(box, 0.6);
    const target = norm(box.text ?? '');
    if (target.length < 3 || !words.length) return grow(box, 0.8);
    const near = (w: Word) => w.left + w.width >= box.x - 6 && w.left <= box.x + box.w + 6 && w.top + w.height >= box.y - 3 && w.top <= box.y + box.h + 3;
    const hits = words.filter((w) => {
      const t = norm(w.text);
      return t.length >= 2 && target.includes(t) && near(w);
    });
    if (!hits.length) return grow(box, 0.8);
    const left = Math.min(...hits.map((w) => w.left));
    const top = Math.min(...hits.map((w) => w.top));
    const right = Math.max(...hits.map((w) => w.left + w.width));
    const bottom = Math.max(...hits.map((w) => w.top + w.height));
    return grow({ ...box, x: left, y: top, w: right - left, h: bottom - top }, 0.6);
  });
}

function grow(box: ProtectBox, by: number): ProtectBox {
  const x = clamp(box.x - by);
  const y = clamp(box.y - by * 0.5);
  return { ...box, x, y, w: clamp(box.x + box.w + by) - x, h: clamp(box.y + box.h + by * 0.5) - y };
}

/** Hides an item's boxes in its image file — the protected picture replaces the original — and its OCR words. */
async function applyItem(job: ProtectJob, item: ProtectItem) {
  const path = join(screensDir(), item.file);
  try {
    const source = readFileSync(path);
    const image = sharp(source);
    const { width = 0, height = 0 } = await image.metadata();
    if (!width || !height) throw new Error('The image has no size.');
    const layers: OverlayOptions[] = [];
    for (const box of item.boxes) {
      const left = Math.max(0, Math.floor((box.x / 100) * width));
      const top = Math.max(0, Math.floor((box.y / 100) * height));
      const w = Math.min(width - left, Math.ceil((box.w / 100) * width));
      const h = Math.min(height - top, Math.ceil((box.h / 100) * height));
      if (w < 2 || h < 2) continue;
      if (job.settings.style === 'box') {
        const r = Math.round(Math.min(w, h) * 0.12);
        layers.push({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${r}" fill="#c9c9cc"/></svg>`), left, top });
      } else {
        // Shrunk far down and blown back up, then softened: nothing of the original can be read back.
        // (Two pipelines: sharp keeps only the last resize of one.)
        const small = Math.max(2, Math.round(Math.max(w, h) / 28));
        const tiny = await sharp(source)
          .extract({ left, top, width: w, height: h })
          .resize(Math.max(2, Math.round((w / Math.max(w, h)) * small)), Math.max(2, Math.round((h / Math.max(w, h)) * small)), { fit: 'fill' })
          .png()
          .toBuffer();
        const patch = await sharp(tiny)
          .resize(w, h, { fit: 'fill', kernel: 'cubic' })
          .blur(Math.max(4, Math.min(w, h) / 10))
          .png()
          .toBuffer();
        layers.push({ input: patch, left, top });
      }
    }
    const out = await sharp(source).composite(layers).webp({ quality: 90 }).toBuffer();
    const tmp = `${path}.protect-tmp`;
    writeFileSync(tmp, out);
    renameSync(tmp, path);
    dropWords(item);
    item.stage = 'applied';
    item.error = undefined;
    markChecked([item]);
  } catch (failure) {
    item.stage = 'failed';
    item.error = `Couldn’t change the image: ${(failure as Error).message}`;
  }
}

/** The screen's saved OCR words that lay under a hidden area are removed, so search can't find them. */
function dropWords(item: ProtectItem) {
  const saved = readWords(item.screenId);
  if (!saved?.data.words) return;
  const inside = (w: Word) => item.boxes.some((b) => w.left + w.width / 2 >= b.x && w.left + w.width / 2 <= b.x + b.w && w.top + w.height / 2 >= b.y && w.top + w.height / 2 <= b.y + b.h);
  const kept = saved.data.words.filter((w) => !inside(w));
  if (kept.length === saved.data.words.length) return;
  const hidden = new Set(saved.data.words.filter(inside).map((w) => norm(w.text)).filter((t) => t.length >= 2));
  const text = (saved.data.text ?? '')
    .split('\n')
    .map((line) => line.split(/\s+/).filter((token) => !hidden.has(norm(token))).join(' '))
    .join('\n');
  writeFileSync(saved.file, JSON.stringify({ ...saved.data, words: kept, text, savedAt: new Date().toISOString() }, null, 2));
}
