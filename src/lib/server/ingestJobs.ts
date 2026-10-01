import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IngestEvent, IngestJob, IngestResult } from '@/lib/inspirations/ingestJobs';

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

type ServerJob = IngestJob & { workDir: string | null };
/** Live processes, by job id — never persisted. */
const children = new Map<string, import('node:child_process').ChildProcess>();

type Store = { jobs: Map<string, ServerJob>; loaded: boolean };

const store: Store = ((globalThis as unknown as { __motvinIngestJobs?: Store }).__motvinIngestJobs ??= { jobs: new Map(), loaded: false });

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
      store.jobs.set(job.id, job);
    }
  } catch {
    // A corrupt mirror is not worth failing over; the list starts empty.
  }
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
  return view;
}

function trim() {
  const finished = [...store.jobs.values()].filter((job) => job.status === 'done' || job.status === 'failed').sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  for (const job of finished.slice(KEEP_JOBS)) store.jobs.delete(job.id);
}

export function listJobs(): IngestJob[] {
  load();
  return [...store.jobs.values()]
    .filter((job) => !job.dismissed)
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicView);
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
  job.dismissed = true;
  persist();
  return true;
}

/** Whether a run is in progress right now — one at a time keeps the Mac usable. */
export function activeJob(): IngestJob | null {
  load();
  const job = [...store.jobs.values()].find((entry) => entry.status === 'running');
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
    result: null,
    error: null,
    dismissed: false,
    workDir: input.workDir,
  };
  store.jobs.set(id, job);
  trim();
  persist();

  runCrawler(input.args, (event) => apply(job, event), input.mode ?? 'ingest', (child) => children.set(id, child))
    .then((outcome) => {
      if (job.status !== 'running') return; // stopped by the admin meanwhile
      if (outcome.ok) {
        job.result = outcome.data;
        job.status = 'done';
        job.stage = 'done';
        job.message = outcome.data ? `${outcome.data.app.name} — ${outcome.data.ingested} screens in ${outcome.data.flows.length} flows` : `${input.title} — finished`;
      } else {
        job.status = 'failed';
        job.error = outcome.message;
        job.message = outcome.message;
      }
    })
    .catch((error: Error) => {
      job.status = 'failed';
      job.error = error.message;
      job.message = error.message;
    })
    .finally(async () => {
      children.delete(id);
      job.finishedAt = job.finishedAt ?? new Date().toISOString();
      persist();
      if (job.workDir) await rm(job.workDir, { recursive: true, force: true }).catch(() => undefined);
      job.workDir = null;
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
): Promise<{ ok: true; data: IngestResult | null } | { ok: false; message: string }> {
  const script = join(process.cwd(), 'tools', 'ios-crawler', 'crawl.js');

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: join(process.cwd(), 'tools', 'ios-crawler'),
      env: { ...process.env, NO_COLOR: '1' },
    });
    onSpawn?.(child);

    let result: IngestResult | null = null;
    let resultError: string | null = null;
    const humanLines: string[] = [];
    let buffer = '';

    const handleLine = (raw: string) => {
      const line = raw.replace(/\r$/, '');
      if (!line.trim()) return;
      if (line.startsWith(PROGRESS_MARKER)) {
        try {
          const event = JSON.parse(line.slice(PROGRESS_MARKER.length).trim()) as Omit<Extract<IngestEvent, { type: 'progress' }>, 'type'>;
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
