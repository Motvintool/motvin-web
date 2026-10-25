import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { activeJob, getJob, resumeJob, startJob } from '@/lib/server/ingestJobs';
import { clearReviewFolder, inspirationsDataDir, reviewFolder, reviewState } from '@/lib/server/reviews';

/**
 * Adding many apps at once, with nobody watching.
 *
 * A batch is a queue of recordings and the admin's settings for all of them.
 * The server works through it on its own: each recording is uploaded the way
 * the Motvin agent uploads one, cleaned up, reviewed by the Claude Code
 * command-line tool following docs/review-motvin.md, checked, and cleaned up —
 * one upload at a time, with the next upload running while the last one is
 * reviewed. The queue is kept on disk, so it carries on after a restart.
 *
 * What needs the admin's sign-in (making an app, its logo, removing an app
 * being replaced) is done by the browser when the batch is created; this only
 * runs the crawler and the review, which need none.
 */

export type BatchSettings = {
  /** What to do at the upload's pause: clean up as the crawler would, or wait for the admin's choice. */
  cleanup: 'automatic' | 'manual';
  /** Review each upload by itself (Claude Code) or leave the "Ask agent to review" button. */
  review: 'auto' | 'manual';
  /** Once a review is clean: remove its working files, or keep them for the admin to look at. */
  afterReview: 'cleanup' | 'keep';
  platform: 'ios' | 'webapp' | 'web';
  /** The version every upload goes into (YYYY-MM-DD); null for each upload's own day. */
  version: string | null;
  /** A system notification for each app and the summary, the summary only, or none. */
  notify: 'each' | 'summary' | 'off';
  /** How many reviews run side by side (uploads stay one at a time). */
  reviewsAtOnce?: 1 | 2 | 3;
};

export type BatchStage =
  | 'queued'
  | 'uploading'
  | 'choose' // waiting for the admin's clean-up choice in the Motvin agent
  | 'review-queued'
  | 'reviewing'
  | 'review-ready' // manual review: the "Ask agent to review" button
  | 'done'
  | 'skipped'
  | 'needs-you';

export type BatchItem = {
  id: string;
  title: string;
  /** The recording on this machine: in the records folder, or uploaded into the batch's own folder. */
  video: string;
  /** Uploaded for this batch, so it is deleted once the app is in. */
  ownsVideo: boolean;
  /** The app the upload adds to — made by the browser for a new one — or null to have the screens name it. */
  appId: string | null;
  detectIndustry: boolean;
  stage: BatchStage;
  note: string | null;
  jobId: string | null;
  version: string | null;
  uploadTries: number;
  reviewTries: number;
  /** Not before this time — waiting for disk space or for AI usage to come back. */
  waitUntil: string | null;
  startedAt: string | null;
  uploadedAt: string | null;
  reviewStartedAt: string | null;
  finishedAt: string | null;
  result: { appName: string; screens: number; flows: number; problems: number } | null;
};

export type Batch = {
  id: string;
  createdAt: string;
  createdBy: string;
  settings: BatchSettings;
  items: BatchItem[];
  state: 'running' | 'paused' | 'done';
  finishedAt: string | null;
  /** Taken off the board by the admin once finished (kept on disk). */
  cleared?: boolean;
};

/** Tries per upload and per review before it is left for the admin. */
const TRIES = 2;
/** Space a review needs on the way (early frames, strips, sheets). */
const MIN_FREE_BYTES = 15 * 1024 ** 3;
/** A review that writes nothing for this long is taken as stuck. */
const STUCK_MS = 30 * 60_000;
/** The longest a review may run at all. */
const MAX_REVIEW_MS = 3 * 60 * 60_000;
/** Out of AI usage: try again after this long. */
const USAGE_WAIT_MS = 30 * 60_000;
const KEEP_BATCHES = 10;
/** The model auto reviews run on (MOTVIN_REVIEW_MODEL to change it). */
const REVIEW_MODEL = process.env.MOTVIN_REVIEW_MODEL || 'claude-opus-5-5';

const batchesDir = () => join(inspirationsDataDir(), '..', 'batches');
export const batchFilesDir = () => join(batchesDir(), 'files');
const storeFile = () => join(batchesDir(), 'batches.json');
/** The plugin folder, where docs/review-motvin.md is — the review runs from there. */
const pluginRoot = () => resolve(process.cwd(), '..');
/** Recordings and logos the admin keeps on this machine. */
const settingsFile = () => join(batchesDir(), 'settings.json');

/** Recordings and logos the admin keeps on this machine: the folder they chose, else ../../records. */
export function recordsDir(): string {
  try {
    const chosen = (JSON.parse(readFileSync(settingsFile(), 'utf-8')) as { recordsDir?: string }).recordsDir;
    if (chosen && existsSync(chosen)) return resolve(chosen);
  } catch {
    // Not chosen yet.
  }
  return process.env.MOTVIN_RECORDS_DIR ? resolve(process.env.MOTVIN_RECORDS_DIR) : resolve(process.cwd(), '..', '..', 'records');
}

/** Remembers the records folder the admin picked. Only a folder in their home folder. */
export function setRecordsDir(path: string): string {
  const full = resolve(path);
  if (!full.startsWith(`${homedir()}/`) || !existsSync(full) || !statSync(full).isDirectory()) throw new Error('Choose a folder inside your home folder.');
  mkdirSync(batchesDir(), { recursive: true });
  writeFileSync(settingsFile(), `${JSON.stringify({ recordsDir: full }, null, 2)}\n`);
  return full;
}

/** Opens the Mac's own folder picker (the server runs on this Mac) and returns the folder chosen, or null if cancelled. Never blocks the server while it is open. */
export function pickFolder(): Promise<string | null> {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise((done) => {
    execFile('osascript', ['-e', 'activate', '-e', 'POSIX path of (choose folder with prompt "Choose the folder with your recordings")'], { encoding: 'utf-8', timeout: 5 * 60_000 }, (error, stdout) => {
      const picked = error ? '' : String(stdout).trim();
      done(picked ? picked.replace(/\/$/, '') : null);
    });
  });
}

/** This copy of the module, so a timer started by an older copy is replaced (see startBatchRunner). */
const MODULE = Math.random().toString(36).slice(2);

type Runner = { module?: string; batches: Batch[]; loaded: boolean; timer: ReturnType<typeof setInterval> | null; reviews: Map<string, { child: ChildProcess; output: string; startedAt: number }>; awake: ChildProcess | null; ticking: boolean };
const runner: Runner = ((globalThis as unknown as { __motvinBatches?: Runner }).__motvinBatches ??= { batches: [], loaded: false, timer: null, reviews: new Map(), awake: null, ticking: false });

function save() {
  mkdirSync(batchesDir(), { recursive: true });
  writeFileSync(storeFile(), `${JSON.stringify(runner.batches.slice(-KEEP_BATCHES), null, 2)}\n`);
}

function load() {
  if (runner.loaded) return;
  runner.loaded = true;
  try {
    runner.batches = JSON.parse(readFileSync(storeFile(), 'utf-8')) as Batch[];
  } catch {
    runner.batches = [];
  }
  // After a restart: an upload or review that was under way starts again (it does not count as a try).
  for (const batch of runner.batches) {
    for (const item of batch.items) {
      if (item.stage === 'uploading') {
        const job = item.jobId ? getJob(item.jobId) : null;
        if (!job || job.status === 'failed') {
          item.stage = 'queued';
          item.jobId = null;
          item.note = 'Started again after a restart';
        }
      }
      if (item.stage === 'reviewing') {
        item.stage = 'review-queued';
        item.note = 'Review started again after a restart';
      }
    }
  }
}

/** Starts working through the queue; called at server start and whenever the batch API is used. */
export function startBatchRunner() {
  load();
  // One timer, always running this module's code: after an update the next call swaps it in.
  if (runner.timer && runner.module === MODULE) return;
  if (runner.timer) clearInterval(runner.timer);
  runner.module = MODULE;
  runner.timer = setInterval(() => void tick().catch((error: Error) => logLine(`tick failed: ${error.message}`)), 5000);
  void tick();
}

export function listBatches(): Batch[] {
  load();
  return runner.batches;
}

export function createBatch(input: { createdBy: string; settings: BatchSettings; items: Array<Pick<BatchItem, 'title' | 'video' | 'ownsVideo' | 'appId' | 'detectIndustry'> & { skip?: string }> }): Batch {
  load();
  const now = new Date().toISOString();
  const batch: Batch = {
    id: `batch-${Date.now().toString(36)}`,
    createdAt: now,
    createdBy: input.createdBy,
    settings: input.settings,
    state: 'running',
    finishedAt: null,
    items: input.items.map((entry, i) => ({
      id: `${i + 1}`,
      title: entry.title,
      video: entry.video,
      ownsVideo: entry.ownsVideo,
      appId: entry.appId,
      detectIndustry: entry.detectIndustry,
      stage: entry.skip ? 'skipped' : 'queued',
      note: entry.skip ?? null,
      jobId: null,
      version: null,
      uploadTries: 0,
      reviewTries: 0,
      waitUntil: null,
      startedAt: null,
      uploadedAt: null,
      reviewStartedAt: null,
      finishedAt: entry.skip ? now : null,
      result: null,
    })),
  };
  runner.batches.push(batch);
  save();
  startBatchRunner();
  return batch;
}

/** Pause, resume, retry an item, skip an item, or stop the batch. */
export function controlBatch(id: string, action: 'pause' | 'resume' | 'retry' | 'skip' | 'stop' | 'clear', itemId?: string): Batch | null {
  load();
  const batch = runner.batches.find((entry) => entry.id === id);
  if (!batch) return null;
  const item = itemId ? batch.items.find((entry) => entry.id === itemId) : undefined;
  if (action === 'clear' && batch.state === 'done') batch.cleared = true;
  if (action === 'pause' && batch.state === 'running') batch.state = 'paused';
  if (action === 'resume' && batch.state === 'paused') batch.state = 'running';
  if (action === 'retry' && item && ['needs-you', 'skipped'].includes(item.stage)) {
    // Back to the step it stopped at: the upload, or the review once the app is in.
    item.stage = item.version ? 'review-queued' : 'queued';
    item.uploadTries = 0;
    item.reviewTries = 0;
    item.waitUntil = null;
    item.note = null;
    item.finishedAt = null;
    if (batch.state === 'done') batch.state = 'running';
  }
  if (action === 'skip' && item && ['queued', 'review-queued', 'needs-you', 'review-ready'].includes(item.stage)) {
    item.stage = 'skipped';
    item.note = 'Skipped by you';
    item.finishedAt = new Date().toISOString();
  }
  if (action === 'stop') {
    for (const entry of batch.items) {
      if (['queued', 'review-queued'].includes(entry.stage)) {
        entry.stage = 'skipped';
        entry.note = 'Batch stopped';
        entry.finishedAt = new Date().toISOString();
      }
    }
  }
  save();
  void tick();
  return batch;
}

/** Whether the Claude Code command-line tool is on this machine, for auto review. */
export function claudeCli(): string | null {
  // Installed with npm, it sits next to the node running this server.
  const candidates = [process.env.CLAUDE_BIN, join(dirname(process.execPath), 'claude'), join(homedir(), '.claude', 'local', 'claude'), join(homedir(), '.local', 'bin', 'claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'].filter(Boolean) as string[];
  for (const path of candidates) if (existsSync(path)) return path;
  try {
    const found = execFileSync('/bin/sh', ['-lc', 'command -v claude'], { encoding: 'utf-8', timeout: 5000 }).trim();
    return found || null;
  } catch {
    return null;
  }
}

const later = (item: BatchItem) => item.waitUntil !== null && Date.parse(item.waitUntil) > Date.now();
const finished = (item: BatchItem) => ['done', 'skipped', 'needs-you', 'review-ready'].includes(item.stage);

async function tick() {
  if (runner.ticking) return;
  runner.ticking = true;
  try {
    let changed = false;
    for (const batch of runner.batches) {
      if (batch.state === 'done') continue;
      for (const item of batch.items) changed = followUpload(batch, item) || changed;
      for (const item of batch.items) changed = followReview(batch, item) || changed;
      if (batch.state === 'running') {
        changed = startNextUpload(batch) || changed;
        // Up to the setting's number of reviews side by side.
        for (let started = 0; started < 3 && startNextReview(batch); started++) changed = true;
      }
      if (batch.items.every(finished) && ![...runner.reviews.keys()].some((key) => key.startsWith(`${batch.id}/`))) {
        batch.state = 'done';
        batch.finishedAt = new Date().toISOString();
        changed = true;
        if (batch.settings.notify !== 'off') notify('Batch finished', summaryLine(batch));
      }
    }
    keepAwake(runner.batches.some((batch) => batch.state !== 'done'));
    if (changed) save();
  } finally {
    runner.ticking = false;
  }
}

function summaryLine(batch: Batch): string {
  const count = (stage: BatchStage) => batch.items.filter((item) => item.stage === stage).length;
  const parts = [`${count('done')} done`];
  if (count('review-ready')) parts.push(`${count('review-ready')} ready for review`);
  if (count('needs-you')) parts.push(`${count('needs-you')} need you`);
  if (count('skipped')) parts.push(`${count('skipped')} skipped`);
  return parts.join(', ');
}

/** One upload at a time — and never while the admin's own upload is running. */
function startNextUpload(batch: Batch): boolean {
  if (batch.items.some((item) => item.stage === 'uploading' || item.stage === 'choose')) return false;
  if (activeJob()) return false;
  const item = batch.items.find((entry) => entry.stage === 'queued' && !later(entry));
  if (!item) return false;
  if (!existsSync(item.video)) {
    item.stage = 'needs-you';
    item.note = 'The recording is no longer there';
    item.finishedAt = new Date().toISOString();
    return true;
  }
  const free = freeBytes();
  if (free !== null && free < MIN_FREE_BYTES) {
    item.waitUntil = new Date(Date.now() + 2 * 60_000).toISOString();
    item.note = `Waiting for disk space — ${(free / 1024 ** 3).toFixed(1)} GB free, needs ${MIN_FREE_BYTES / 1024 ** 3} GB`;
    return true;
  }
  const { settings } = batch;
  const args = [
    'ingest',
    '--from', item.video,
    '--authorized',
    '--authorized-by', batch.createdBy,
    '--json',
    '--fps', String(10 / 3),
    '--min-hold', '0.5',
    '--platform', settings.platform,
    ...(settings.version ? ['--version', settings.version] : []),
    ...(item.appId ? ['--app-id', item.appId] : []),
    ...(item.detectIndustry ? ['--detect-industry'] : []),
    '--keep-loading',
    '--backend', 'local',
    '--keep-source',
    '--review',
  ];
  const job = startJob({
    title: basename(item.video),
    sizeBytes: statSync(item.video).size,
    startedBy: batch.createdBy,
    workDir: null,
    args,
    resumeConfig: { appId: item.appId, detectIndustry: item.detectIndustry, authorizedBy: batch.createdBy, platform: settings.platform, version: settings.version, keepLoading: true, dryRun: false, full: false },
  });
  item.jobId = job.id;
  item.stage = 'uploading';
  item.note = 'Reading the recording';
  item.waitUntil = null;
  item.uploadTries += 1;
  item.startedAt = item.startedAt ?? new Date().toISOString();
  return true;
}

function followUpload(batch: Batch, item: BatchItem): boolean {
  if (item.stage !== 'uploading' && item.stage !== 'choose') return false;
  const job = item.jobId ? getJob(item.jobId) : null;
  if (!job) return false;
  if (job.status === 'awaiting-review') {
    if (batch.settings.cleanup === 'automatic') {
      resumeJob(job.id, { mode: 'automatic' });
      item.note = 'Cleaning up automatically';
      return true;
    }
    if (item.stage !== 'choose') {
      item.stage = 'choose';
      item.note = 'Choose how to clean up — open the Motvin agent';
      if (batch.settings.notify === 'each') notify(item.title, 'Waiting for your clean-up choice');
      return true;
    }
    return false;
  }
  if (job.status === 'running') {
    const note = job.message || 'Uploading';
    if (item.stage === 'choose' || item.note !== note) {
      item.stage = 'uploading';
      item.note = note;
      return true;
    }
    return false;
  }
  if (job.status === 'done' && job.result) {
    item.version = job.result.version ?? null;
    item.appId = job.result.app.id;
    item.result = { appName: job.result.app.name, screens: job.result.ingested, flows: job.result.flows.length, problems: 0 };
    item.uploadedAt = new Date().toISOString();
    if (item.ownsVideo) rmSync(item.video, { force: true });
    if (!item.version) {
      item.stage = 'needs-you';
      item.note = 'Uploaded, but its version is unknown — review it from the Motvin agent';
    } else if (batch.settings.review === 'auto') {
      item.stage = 'review-queued';
      item.note = 'Waiting for its review';
    } else {
      item.stage = 'review-ready';
      item.note = 'Uploaded — ask the agent to review it';
      item.finishedAt = new Date().toISOString();
    }
    return true;
  }
  if (job.status === 'failed' || job.status === 'done') {
    if (item.uploadTries < TRIES) {
      item.stage = 'queued';
      item.note = `Upload failed (${job.error ?? 'no result'}) — trying again`;
    } else {
      item.stage = 'needs-you';
      item.note = `Upload failed: ${job.error ?? 'no result'}`;
      item.finishedAt = new Date().toISOString();
      if (batch.settings.notify === 'each') notify(item.title, 'Upload failed — needs you');
    }
    item.jobId = null;
    return true;
  }
  return false;
}

/** One review at a time, while the next upload runs. */
function startNextReview(batch: Batch): boolean {
  const running = batch.items.filter((item) => item.stage === 'reviewing').length;
  if (running >= (batch.settings.reviewsAtOnce ?? 1)) return false;
  const item = batch.items.find((entry) => entry.stage === 'review-queued' && !later(entry));
  if (!item || !item.appId || !item.version) return false;
  // Each review keeps frames and sheets on disk while it runs: room for one more first.
  const free = freeBytes();
  if (running > 0 && free !== null && free < MIN_FREE_BYTES) {
    item.waitUntil = new Date(Date.now() + 2 * 60_000).toISOString();
    item.note = `Waiting for disk space to review alongside the others — ${(free / 1024 ** 3).toFixed(1)} GB free`;
    return true;
  }
  const cli = claudeCli();
  if (!cli) {
    item.stage = 'review-ready';
    item.note = 'Auto review needs the Claude Code command-line tool — ask the agent to review it';
    item.finishedAt = new Date().toISOString();
    return true;
  }
  const { platform } = batch.settings;
  // Already reviewed (the admin did it meanwhile): straight to the end.
  if (reviewState(item.appId, platform, item.version).reviewed && !reviewState(item.appId, platform, item.version).problems.length) return finishReview(batch, item);
  const prompt = [
    `Follow docs/review-motvin.md to review ${item.appId} ${platform} ${item.version}.`,
    'You are running unattended, started by the Motvin batch queue: nobody will answer questions, so make every decision the steps describe yourself.',
    'Finish only when apply-review says "review check: no problems left".',
  ].join(' ');
  const tools = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Task', 'Bash(cd:*)', 'Bash(node:*)', 'Bash(npm run build:inspirations)', 'Bash(npm run --silent build:inspirations)', 'Bash(cp:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(mkdir:*)', 'Bash(python3:*)', 'Bash(echo:*)', 'Bash(grep:*)', 'Bash(head:*)', 'Bash(tail:*)', 'Bash(wc:*)', 'Bash(sort:*)', 'Bash(uniq:*)', 'Bash(find:*)', 'Bash(sed:*)', 'Bash(awk:*)', 'Bash(date:*)', 'Bash(pwd)', 'Bash(jq:*)'];
  // The review's model is fixed here, not left to whatever the terminal last picked.
  const child = spawn(cli, ['-p', prompt, '--model', REVIEW_MODEL, '--allowedTools', tools.join(','), '--permission-mode', 'acceptEdits', '--output-format', 'text'], { cwd: pluginRoot(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  const key = `${batch.id}/${item.id}`;
  const entry = { child, output: '', startedAt: Date.now() };
  const keep = (chunk: Buffer) => {
    entry.output = (entry.output + chunk.toString()).slice(-8000);
  };
  child.stdout?.on('data', keep);
  child.stderr?.on('data', keep);
  child.on('error', (error) => {
    entry.output += `\n${error.message}`;
  });
  runner.reviews.set(key, entry);
  item.stage = 'reviewing';
  item.note = 'The agent is reviewing';
  item.reviewTries += 1;
  item.reviewStartedAt = new Date().toISOString();
  return true;
}

function followReview(batch: Batch, item: BatchItem): boolean {
  if (item.stage !== 'reviewing' || !item.appId || !item.version) return false;
  const key = `${batch.id}/${item.id}`;
  const entry = runner.reviews.get(key);
  const { platform } = batch.settings;
  // Done when the review says so — the final check clean — whatever the process is doing.
  const now = reviewState(item.appId, platform, item.version);
  const running = entry && entry.child.exitCode === null && entry.child.signalCode === null && alive(entry.child.pid);
  if (now.reviewed && !now.reviewing && !now.problems.length) {
    if (running) entry.child.kill('SIGTERM');
    runner.reviews.delete(key);
    logLine(`${item.title}: review finished clean`);
    return finishReview(batch, item);
  }
  if (running) {
    // Still going: stuck when it has written nothing for a long while, or has run far too long.
    const quiet = Date.now() - newestWrite(reviewFolder(item.appId, platform, item.version), entry.startedAt);
    if (quiet > STUCK_MS || Date.now() - entry.startedAt > MAX_REVIEW_MS) {
      entry.child.kill('SIGTERM');
      entry.output += '\n(stopped: the review was stuck)';
    }
    return false;
  }
  runner.reviews.delete(key);
  const state = reviewState(item.appId, platform, item.version);
  logLine(`${item.title}: review ended — ${state.reviewed ? `${state.problems.length} problem(s) left` : 'not reviewed'}; output: ${(entry?.output ?? '').slice(-400).replace(/\s+/g, ' ')}`);
  if (state.reviewed && !state.problems.length && !state.reviewing) return finishReview(batch, item);
  const output = entry?.output ?? '';
  // Signed out of Claude Code: nothing will work until the admin signs in again.
  if (/not logged in|please run \/login|invalid api key|authentication|unauthori[sz]ed|oauth token/i.test(output)) {
    item.stage = 'needs-you';
    item.reviewTries = Math.max(0, item.reviewTries - 1);
    item.note = 'Sign in to Claude again: run "claude" in a terminal and type /login, then click Retry';
    item.finishedAt = new Date().toISOString();
    if (batch.settings.notify !== 'off') notify('Claude needs you', 'Sign in to Claude again to continue the reviews');
    return true;
  }
  // Out of AI usage: wait and go again, without counting it as a try.
  if (/usage limit|rate limit|limit reached|resets at|quota/i.test(output)) {
    item.stage = 'review-queued';
    item.reviewTries = Math.max(0, item.reviewTries - 1);
    item.waitUntil = new Date(Date.now() + USAGE_WAIT_MS).toISOString();
    item.note = 'Out of AI usage for now — trying again in 30 minutes';
    return true;
  }
  if (item.reviewTries < TRIES) {
    item.stage = 'review-queued';
    item.note = `The review did not finish${state.problems.length ? ` (${state.problems.length} problem(s) left)` : ''} — trying once more`;
    return true;
  }
  item.stage = 'needs-you';
  item.note = `The review did not finish${state.problems.length ? ` — ${state.problems.length} problem(s) left` : ''}: ask the agent to review it again`;
  item.finishedAt = new Date().toISOString();
  if (batch.settings.notify === 'each') notify(item.result?.appName ?? item.title, 'Review did not finish — needs you');
  return true;
}

function finishReview(batch: Batch, item: BatchItem): boolean {
  const { platform } = batch.settings;
  if (batch.settings.afterReview === 'cleanup' && item.appId && item.version) clearReviewFolder(item.appId, platform, item.version);
  item.stage = 'done';
  item.note = batch.settings.afterReview === 'cleanup' ? 'Reviewed and cleaned up' : 'Reviewed — files kept for you to check';
  item.finishedAt = new Date().toISOString();
  if (item.result && item.appId) item.result = { ...item.result, ...countScreens(item.appId, platform, item.version) };
  if (batch.settings.notify === 'each') notify(item.result?.appName ?? item.title, `Reviewed — ${item.result?.screens ?? '?'} screens in ${item.result?.flows ?? '?'} flows`);
  return true;
}

/** The reviewed version's screens and flows, as the library now holds them. */
function countScreens(appId: string, platform: string, version: string | null): { screens: number; flows: number } | Record<string, never> {
  if (!version) return {};
  try {
    const dir = join(inspirationsDataDir(), 'screens', platform, appId, 'versions', version);
    const walk = (path: string): number => readdirSync(path, { withFileTypes: true }).reduce((n, entry) => n + (entry.isDirectory() ? walk(join(path, entry.name)) : /\.(webp|png|jpe?g)$/i.test(entry.name) ? 1 : 0), 0);
    const flows = (JSON.parse(readFileSync(join(inspirationsDataDir(), 'flows.json'), 'utf-8')) as { flows: Array<{ appId: string; screenIds?: string[] }> }).flows.filter((flow) => flow.appId === appId && (flow.screenIds ?? []).some((sid) => sid.includes(`-versions-${version}-`))).length;
    return { screens: walk(dir), flows };
  } catch {
    return {};
  }
}

/** The latest time anything in a folder was written, or `since` when nothing was. */
function newestWrite(dir: string, since: number): number {
  let newest = since;
  try {
    for (const entry of readdirSync(dir)) newest = Math.max(newest, statSync(join(dir, entry)).mtimeMs);
  } catch {
    // No folder yet.
  }
  return newest;
}

function freeBytes(): number | null {
  try {
    const stats = statfsSync(inspirationsDataDir());
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
}

/** Keeps the Mac awake while a batch runs (caffeinate), and lets it sleep again after. */
function keepAwake(on: boolean) {
  if (process.platform !== 'darwin') return;
  if (on && !runner.awake) {
    try {
      runner.awake = spawn('caffeinate', ['-i', '-m', '-s'], { stdio: 'ignore' });
      runner.awake.on('exit', () => {
        runner.awake = null;
      });
    } catch {
      runner.awake = null;
    }
  }
  if (!on && runner.awake) {
    runner.awake.kill();
    runner.awake = null;
  }
}

function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** A line in batches/batch.log, to see afterwards what the queue did. */
function logLine(text: string) {
  try {
    mkdirSync(batchesDir(), { recursive: true });
    appendFileSync(join(batchesDir(), 'batch.log'), `${new Date().toISOString()} ${text}\n`);
  } catch {
    // The log is a nicety.
  }
}

/** A system notification on this Mac. */
function notify(title: string, message: string) {
  if (process.platform !== 'darwin') return;
  const quote = (text: string) => `"${text.replace(/["\\]/g, '').slice(0, 180)}"`;
  try {
    spawn('osascript', ['-e', `display notification ${quote(message)} with title ${quote(`Motvin — ${title}`)}`], { stdio: 'ignore' }).unref();
  } catch {
    // Notifications are a nicety.
  }
}
