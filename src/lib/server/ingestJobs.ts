import { execFile, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { IngestEvent, IngestJob, IngestResult, ReviewDecision } from '@/lib/inspirations/ingestJobs';

const execFileAsync = promisify(execFile);

/**
 * Video ingest runs, kept by the server rather than by the request.
 *
 * A run takes minutes: a minute or two to read the recording and publish the
 * screens, then several more while a local model writes the flow content.
 * Tying that to one HTTP response meant a closed tab lost the progress and a
 * page change lost the picture of what was happening. Here the crawler is
 * started as a detached piece of work, its stages are recorded on a job, and
 * any page — the admin panel, the dock on every other page, a second tab —
 * reads the same job list.
 *
 * The list lives on `globalThis` so Next's dev server, which reloads modules
 * as files change, keeps it; and it is mirrored to a small file so a restart
 * of the server still shows what ran (a run that was in progress is then
 * marked as interrupted, since its process is gone).
 */

const PROGRESS_MARKER = 'MOTVIN_PROGRESS';
const RESULT_MARKER = 'MOTVIN_RESULT';
const PERSIST_FILE = join(tmpdir(), 'motvin-ingest-jobs.json');
const KEEP_JOBS = 12;
const KEEP_LOG_LINES = 160;

/** What a paused run needs to finish once the admin decides — kept only
 * server-side, the same as `workDir`, and reused to build `resume`'s args. */
export type ResumeConfig = {
  appId: string | null;
  authorizedBy: string;
  platform: string;
  version: string | null;
  keepLoading: boolean;
  dryRun: boolean;
};

type ServerJob = IngestJob & { workDir: string | null; stagingDir: string | null; resumeConfig: ResumeConfig | null };
/** Live processes, by job id — never persisted. */
const children = new Map<string, import('node:child_process').ChildProcess>();

type Store = { jobs: Map<string, ServerJob>; loaded: boolean };

const store: Store = ((globalThis as unknown as { __motvinIngestJobs?: Store }).__motvinIngestJobs ??= { jobs: new Map(), loaded: false });

/**
 * How long an `awaiting-review` run waits for a decision before it is given
 * up on. Nothing is lost by waiting too long — the captured screens just
 * never get classified or published — but the staging dir behind it (every
 * screen's full-size frame) sits in the OS temp folder regardless, and
 * without this it would sit there forever. Checked lazily, wherever a job
 * might be read, rather than on a timer — the same way `trim()` already
 * keeps the finished-job list from growing without bound.
 */
const REVIEW_TIMEOUT_MS = 6 * 60 * 60 * 1000;

function sweepStaleReviews() {
  let changed = false;
  for (const job of store.jobs.values()) {
    if (job.status !== 'awaiting-review' || Date.now() - Date.parse(job.startedAt) < REVIEW_TIMEOUT_MS) continue;
    job.status = 'failed';
    job.error = 'This run waited too long for a decision and was given up — nothing it captured was published. Upload the recording again when ready.';
    job.message = job.error;
    job.finishedAt = new Date().toISOString();
    job.capturedScreens = null;
    changed = true;
    if (job.stagingDir) {
      const dir = job.stagingDir;
      job.stagingDir = null;
      void rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  if (changed) persist();
}

function load() {
  if (store.loaded) return;
  store.loaded = true;
  if (!existsSync(PERSIST_FILE)) return;
  try {
    const parsed = JSON.parse(readFileSync(PERSIST_FILE, 'utf-8')) as ServerJob[];
    for (const job of parsed) {
      if (job.status === 'running' || job.status === 'uploading') {
        job.status = 'failed';
        job.error = 'The server restarted while this run was in progress. The screens it had published are still in the library.';
        job.finishedAt = job.finishedAt ?? new Date().toISOString();
      }
      // A run dismissed while still `awaiting-review`, from before dismissing
      // one properly released it, is exactly the state that kept it quietly
      // holding the single-run slot: invisible (dismissed hides its card)
      // yet still "active" as far as a new upload was concerned.
      if (job.status === 'awaiting-review' && job.dismissed) {
        job.status = 'failed';
        job.error = 'Dismissed before a decision was made — nothing it captured was published.';
        job.finishedAt = job.finishedAt ?? new Date().toISOString();
        job.capturedScreens = null;
        if (job.stagingDir) {
          const dir = job.stagingDir;
          job.stagingDir = null;
          void rm(dir, { recursive: true, force: true }).catch(() => undefined);
        }
      }
      store.jobs.set(job.id, job);
    }
  } catch {
    // A corrupt mirror is not worth failing over; the list starts empty.
  }
  sweepStaleReviews();
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      writeFileSync(PERSIST_FILE, JSON.stringify([...store.jobs.values()].map((job) => ({ ...job, workDir: null }))));
    } catch {
      // Best effort.
    }
  }, 300);
}

function publicView(job: ServerJob): IngestJob {
  const view: ServerJob = { ...job };
  delete (view as Partial<ServerJob>).workDir;
  delete (view as Partial<ServerJob>).stagingDir;
  delete (view as Partial<ServerJob>).resumeConfig;
  return view;
}

function trim() {
  const finished = [...store.jobs.values()].filter((job) => job.status === 'done' || job.status === 'failed').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const job of finished.slice(KEEP_JOBS)) store.jobs.delete(job.id);
}

export function listJobs(): IngestJob[] {
  load();
  sweepStaleReviews();
  return [...store.jobs.values()]
    .filter((job) => !job.dismissed)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicView);
}

/**
 * Where a captured screen's full-size frame sits on disk, while its job is
 * still `awaiting-review` — the one path server-only state (`stagingDir`) is
 * read for from outside this module, and only for a frame the job itself
 * reported capturing.
 */
export function reviewFramePath(jobId: string, frame: number): string | null {
  load();
  const job = store.jobs.get(jobId);
  if (!job || !job.stagingDir || !job.capturedScreens?.some((screen) => screen.frame === frame)) return null;
  // The crawler's own frame reader names a full-size extract by its index
  // plus one (tools/ios-crawler/src/frames.js), not by the segmenter's
  // 0-based frame number that `capturedScreens` carries — the one place
  // this module has to know that, since everywhere else either reads the
  // filename back (resumeIngest) or never has to name one at all.
  return join(job.stagingDir, 'frames', `frame-${String(frame + 1).padStart(5, '0')}.png`);
}

/**
 * A captured screen's picture, sized for the review grid rather than for a
 * device screen. The full-size extract a device recorded is a few hundred
 * kilobytes to a few megabytes — fine for one screenshot, not for the eighty
 * or more a real recording turns up, each fetched as an authenticated blob
 * rather than a cheap `<img src>`. A small JPEG made once, the first time a
 * screen is looked at, and kept beside the original, is what makes a big
 * batch feel instant instead of merely eventual; `sips` is already how this
 * whole crawler resizes an image, so nothing new is added to make it.
 */
export async function reviewThumbnailPath(jobId: string, frame: number): Promise<string | null> {
  const full = reviewFramePath(jobId, frame);
  if (!full) return null;
  const thumb = full.replace(/frame-(\d+)\.png$/, 'thumb-$1.jpg');
  if (existsSync(thumb)) return thumb;
  try {
    await execFileAsync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '70', '-Z', '280', full, '--out', thumb], { timeout: 15_000 });
    return thumb;
  } catch {
    // sips missing, or this specific frame malformed: the full image still
    // works, just slower — better than the review grid showing nothing.
    return full;
  }
}

export function getJob(id: string): IngestJob | null {
  load();
  const job = store.jobs.get(id);
  return job ? publicView(job) : null;
}

export function dismissJob(id: string): boolean {
  load();
  const job = store.jobs.get(id);
  if (!job) return false;
  // Dismissing a run still `awaiting-review` is the admin saying they are
  // done with it, not just that they don't want to see the card any more —
  // without this it would keep "running" in the one sense that matters,
  // holding the single-run slot and its staging dir forever, invisibly.
  if (job.status === 'awaiting-review') {
    job.status = 'failed';
    job.error = 'Dismissed before a decision was made — nothing it captured was published.';
    job.message = job.error;
    job.finishedAt = job.finishedAt ?? new Date().toISOString();
    job.capturedScreens = null;
    if (job.stagingDir) {
      const dir = job.stagingDir;
      job.stagingDir = null;
      void rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
  job.dismissed = true;
  persist();
  return true;
}

/**
 * Whether a run is in progress right now, or waiting on the admin — one at a
 * time keeps the Mac usable, and a run sitting at `awaiting-review` still
 * holds a place on the list and a staging dir full of frames, so a second
 * upload has to wait for that choice the same as it would for a run still
 * reading the video.
 */
export function activeJob(): IngestJob | null {
  load();
  sweepStaleReviews();
  const job = [...store.jobs.values()].find((entry) => entry.status === 'running' || entry.status === 'awaiting-review');
  return job ? publicView(job) : null;
}

export type StartJobInput = {
  title: string;
  sizeBytes: number | null;
  startedBy: string;
  workDir: string | null;
  args: string[];
  /** What the run is: reading a recording, or rewriting an app's names. */
  mode?: 'ingest' | 'research';
  /** Set when the run may pause for review — what `resumeJob` needs to finish it the same way. */
  resumeConfig?: ResumeConfig | null;
};

/** Ends a running job's process. The screens it published stay. */
export function stopJob(id: string): boolean {
  load();
  const job = store.jobs.get(id);
  const child = children.get(id);
  if (!job || job.status !== 'running') return false;
  // Stopped after the screens were published — during the naming pass —
  // the run did its work; only the names it would have improved are missing.
  const published = job.interim;
  if (published) {
    const screens = published.ingested ?? published.screens?.length ?? 0;
    job.result = {
      ingested: screens,
      duplicates: published.duplicates ?? 0,
      status: 'stopped-after-publish',
      classified: published.classified ?? false,
      backend: published.backend ?? 'unknown',
      grouped: published.grouped ?? false,
      app: published.app ?? { id: '', name: job.title, industry: '' },
      identified: published.identified ?? null,
      excluded: published.excluded ?? [],
      skipped: published.skipped ?? [],
      capture: published.capture ?? null,
      timeline: published.timeline ?? null,
      researched: null,
      flows: published.flows ?? [],
      screens: published.screens ?? [],
    };
    job.status = 'done';
    job.stage = 'done';
    job.message = `${job.result.app.name} — ${screens} screens published; stopped before the AI finished naming them`;
  } else {
    job.error = 'Stopped by the admin.';
    job.message = 'Stopped by the admin.';
    job.status = 'failed';
  }
  job.finishedAt = new Date().toISOString();
  persist();
  if (child) child.kill('SIGTERM');
  return true;
}

/**
 * Starts the crawler on a recording already on disk and returns the job at
 * once. Progress lands on the job as the CLI prints it; the temp folder is
 * removed when the process ends, whatever the outcome.
 */
export function startJob(input: StartJobInput): IngestJob {
  load();
  const id = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const job: ServerJob = {
    id,
    title: input.title,
    sizeBytes: input.sizeBytes,
    startedBy: input.startedBy,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    stage: input.mode === 'research' ? 'research' : 'extract',
    message: input.mode === 'research' ? 'Reading the stored screens' : 'Reading the recording',
    mode: input.mode ?? 'ingest',
    done: null,
    total: null,
    frames: null,
    screens: null,
    uploaded: 1,
    analyzer: null,
    log: [],
    interim: null,
    capturedScreens: null,
    result: null,
    error: null,
    dismissed: false,
    workDir: input.workDir,
    stagingDir: null,
    resumeConfig: input.resumeConfig ?? null,
  };
  store.jobs.set(id, job);
  trim();
  persist();

  runCrawler(input.args, (event) => apply(job, event), input.mode ?? 'ingest', (child) => children.set(id, child))
    .then((outcome) => settleOutcome(job, outcome))
    .catch((error: Error) => {
      job.status = 'failed';
      job.error = error.message;
      job.message = error.message;
    })
    .finally(async () => {
      children.delete(id);
      // Paused for review: the video is no longer needed (its frames are
      // already extracted), but the job itself is not finished — the staged
      // frames stay put for resumeJob, which cleans up when it actually is.
      if (job.status !== 'awaiting-review') job.finishedAt = job.finishedAt ?? new Date().toISOString();
      persist();
      if (job.workDir) await rm(job.workDir, { recursive: true, force: true }).catch(() => undefined);
      job.workDir = null;
    });

  return publicView(job);
}

/**
 * Settles a crawler run's outcome onto its job — done, failed, or (new)
 * paused for the admin to review what was captured. Shared by a run that
 * goes straight through (startJob) and one picking up after that pause
 * (resumeJob), since the crawler reports its result the same way either
 * time.
 */
function settleOutcome(job: ServerJob, outcome: Awaited<ReturnType<typeof runCrawler>>) {
  if (job.status !== 'running') return; // stopped by the admin meanwhile
  if (outcome.ok && outcome.pausedForReview) {
    job.status = 'awaiting-review';
    job.stage = 'review';
    // job.message and job.capturedScreens were already set from the
    // crawler's own "captured" progress event, a moment before this.
    return;
  }
  if (outcome.ok) {
    job.result = outcome.data;
    job.status = 'done';
    job.stage = 'done';
    job.message = outcome.data ? `${outcome.data.app.name} — ${outcome.data.ingested} screens in ${outcome.data.flows.length} flows` : `${job.title} — finished`;
  } else {
    job.status = 'failed';
    job.error = outcome.message;
    job.message = outcome.message;
  }
}

/**
 * Finishes a run that paused for review: the admin's choice becomes
 * `node crawl.js resume`'s arguments, run from the same staging dir the
 * paused run left behind, continuing the same job id and progress stream.
 */
export function resumeJob(id: string, decision: ReviewDecision): IngestJob | null {
  load();
  const job = store.jobs.get(id);
  if (!job || job.status !== 'awaiting-review' || !job.stagingDir) return null;
  const config = job.resumeConfig;
  // --excluded has to be passed for "manual" even when nothing is excluded —
  // that still means something different from "automatic": every candidate
  // the segmenter had dropped gets recovered and published. Aliasing the two
  // on an empty list, as an earlier version of this did, silently turned
  // "manual, everything recovered" into "automatic, nothing recovered".
  const manual = decision.mode === 'manual';
  const excluded = manual ? decision.excluded : [];
  const args = [
    'resume',
    '--staging', job.stagingDir,
    '--json',
    // The original upload already required this — it is not a fresh choice
    // to make a second time, just the proof that it was made once.
    '--authorized',
    ...(config?.authorizedBy ? ['--authorized-by', config.authorizedBy] : []),
    ...(config?.appId ? ['--app-id', config.appId] : []),
    ...(config?.platform ? ['--platform', config.platform] : []),
    ...(config?.version ? ['--version', config.version] : []),
    ...(config?.keepLoading ? ['--keep-loading'] : []),
    ...(config?.dryRun ? ['--dry-run'] : []),
    ...(manual ? ['--excluded', excluded.join(',')] : []),
  ];
  job.status = 'running';
  job.stage = 'classify';
  job.message = manual ? `Applying ${excluded.length} exclusion${excluded.length === 1 ? '' : 's'} and continuing` : 'Cleaning up automatically and continuing';
  job.capturedScreens = null;
  persist();

  runCrawler(args, (event) => apply(job, event), 'ingest', (child) => children.set(id, child))
    .then((outcome) => settleOutcome(job, outcome))
    .catch((error: Error) => {
      job.status = 'failed';
      job.error = error.message;
      job.message = error.message;
    })
    .finally(async () => {
      children.delete(id);
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      persist();
      if (job.stagingDir) await rm(job.stagingDir, { recursive: true, force: true }).catch(() => undefined);
      job.stagingDir = null;
    });

  return publicView(job);
}

function apply(job: ServerJob, event: IngestEvent) {
  if (event.type === 'progress') {
    job.stage = event.stage;
    job.message = event.message;
    job.done = event.done ?? null;
    job.total = event.total ?? null;
    if (event.frames !== undefined) job.frames = event.frames;
    if (event.screens !== undefined) job.screens = event.screens;
    if (event.stage === 'published' && event.result) job.interim = event.result;
    if (event.stage === 'captured') {
      job.capturedScreens = event.capturedScreens ?? [];
      if (event.stagingDir) job.stagingDir = event.stagingDir;
    }
  } else if (event.type === 'log') {
    // Stamped with the time since the run began, so "Show detail" doubles as
    // a record of how long each step took.
    const seconds = Math.max(0, Math.round((Date.now() - Date.parse(job.startedAt)) / 1000));
    job.log.push(`[${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}] ${event.line}`);
    if (job.log.length > KEEP_LOG_LINES) job.log.splice(0, job.log.length - KEEP_LOG_LINES);
    const analyzer = event.line.match(/analyzer:\s*(.+)$/);
    if (analyzer) job.analyzer = analyzer[1].trim();
  }
  persist();
}

/**
 * Runs the CLI, relaying its progress lines as they arrive, and resolves with
 * the marked result line.
 *
 * On failure the last few log lines become the message, because the CLI's own
 * errors ("no frame held still long enough…", "the analyzer stopped
 * responding…") are already written for a person to read and are far more
 * useful than an exit code.
 */
function runCrawler(
  args: string[],
  send: (event: IngestEvent) => void,
  mode: 'ingest' | 'research' = 'ingest',
  onSpawn?: (child: import('node:child_process').ChildProcess) => void,
): Promise<{ ok: true; data: IngestResult | null; pausedForReview?: boolean } | { ok: false; message: string }> {
  const script = join(process.cwd(), 'tools', 'ios-crawler', 'crawl.js');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: join(process.cwd(), 'tools', 'ios-crawler'),
      env: { ...process.env, NO_COLOR: '1' },
    });
    onSpawn?.(child);

    let result: IngestResult | null = null;
    let resultError: string | null = null;
    // A "captured" progress event is how the crawler says it paused for
    // review — it then exits cleanly with no result line at all, which
    // close() has to read as a pause, not a failure.
    let pausedForReview = false;
    const humanLines: string[] = [];
    let buffer = '';

    const handleLine = (raw: string) => {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) return;
      if (line.startsWith(PROGRESS_MARKER)) {
        try {
          const event = JSON.parse(line.slice(PROGRESS_MARKER.length).trim()) as Omit<Extract<IngestEvent, { type: 'progress' }>, 'type'>;
          if (event.stage === 'captured') pausedForReview = true;
          send({ type: 'progress', ...event });
        } catch {
          // A malformed progress line is not worth failing the run for.
        }
        return;
      }
      if (line.startsWith(RESULT_MARKER)) {
        try {
          result = JSON.parse(line.slice(RESULT_MARKER.length).trim()) as IngestResult;
        } catch {
          resultError = 'The crawler returned a result that could not be read.';
        }
        return;
      }
      const clean = line.replace(/^[✗!›✓⊘]\s*/, '').trim();
      humanLines.push(clean);
      send({ type: 'log', line: line.trim() });
    };

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        handleLine(buffer.slice(0, index));
        buffer = buffer.slice(index + 1);
        index = buffer.indexOf('\n');
      }
    });
    child.stderr.on('data', (chunk: Buffer) => {
      for (const line of chunk.toString('utf-8').split('\n')) {
        if (line.trim()) humanLines.push(line.trim());
      }
    });

    child.on('error', (error) => resolve({ ok: false, message: `Could not start the crawler: ${error.message}` }));

    child.on('close', (code) => {
      if (buffer.trim()) handleLine(buffer);
      if (pausedForReview) return resolve({ ok: true, data: null, pausedForReview: true });
      if (result) return resolve({ ok: true, data: result });
      if (resultError) return resolve({ ok: false, message: resultError });
      // A names rewrite prints no result line; a clean exit is the result.
      if (mode === 'research' && code === 0) return resolve({ ok: true, data: null });
      resolve({
        ok: false,
        message: humanLines.filter(Boolean).slice(-4).join(' — ') || `The crawler exited with code ${code}.`,
      });
    });
  });
}
