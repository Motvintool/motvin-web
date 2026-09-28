'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getIdToken } from '@/lib/firebase/auth';

/**
 * Video ingest runs, as the browser sees them.
 *
 * A run outlives the page that started it. The server keeps every run in a
 * job list (lib/server/ingestJobs.ts) and this module mirrors that list on
 * the client: one poll loop, shared by the admin panel that starts a run and
 * the dock that shows it on every page. Leave the admin page, come back, open
 * a second tab — the same run is there, at the same step, until it is done.
 *
 * The AI's standing (which model, whether it answers) is read the same way,
 * from the crawler itself, so the page and the terminal never disagree.
 */

export type IngestScreen = {
  screenId: string;
  name: string;
  file: string;
  url: string;
  flow: string | null;
  flowName: string | null;
  position: number | null;
  screenType: string;
  publishedType: string;
  states: string[];
  brief: boolean;
  atSeconds: number | null;
  holdSeconds: number | null;
};

export type IngestFlow = { id: string; name: string; category: string; screenIds: string[]; parentId?: string | null; summary?: string | null };

export type IngestResult = {
  ingested: number;
  duplicates: number;
  status: string;
  /** True only when a model analysed the screens; false for the on-device path. */
  classified: boolean;
  backend: string;
  grouped: boolean;
  app: { id: string; name: string; industry: string };
  identified: { confident: boolean; detected: boolean; evidence?: string | null } | null;
  excluded: { file: string; name: string; reason: string }[];
  skipped: { nodeId: string; name: string; screenType: string; reason: string }[];
  capture: { source: string; fps: number; frames: number; durationSeconds: number; excluded?: number } | null;
  timeline: {
    frames: number;
    fps: number;
    durationSeconds: number;
    dropped: { transitions: number; blank: number; scrims: number; revisits: number; merged: number };
  } | null;
  researched: { journeysRenamed: number; screensUpdated: number; batches: number; screens: number; flows: number } | null;
  flows: IngestFlow[];
  screens: IngestScreen[];
};

export type IngestEvent =
  | { type: 'progress'; stage: string; message: string; done?: number; total?: number; frames?: number; screens?: number; result?: Partial<IngestResult> }
  | { type: 'log'; line: string }
  | { type: 'result'; data: IngestResult }
  | { type: 'error'; message: string };

export type IngestJobStatus = 'uploading' | 'running' | 'done' | 'failed';

export type IngestJob = {
  id: string;
  /** The recording's file name, which is what the person will recognise it by. */
  title: string;
  sizeBytes: number | null;
  startedBy: string;
  startedAt: string;
  finishedAt: string | null;
  status: IngestJobStatus;
  stage: string;
  message: string;
  done: number | null;
  total: number | null;
  frames: number | null;
  screens: number | null;
  /** Upload progress, 0–1, while the file is still travelling to the server. */
  uploaded: number | null;
  /** Which analyzer the run is using, as the crawler names it. */
  analyzer: string | null;
  log: string[];
  /** The screens once published, before the AI has written their content. */
  interim: Partial<IngestResult> | null;
  result: IngestResult | null;
  error: string | null;
  dismissed: boolean;
};

export type AiProvider = { id: string; name: string; url: string; needsKey: boolean; hint: string; model?: string };

export type AiStatus = {
  provider: string;
  url: string;
  source: 'env' | 'settings' | 'default';
  enabled: boolean;
  hasKey: boolean;
  models: string[];
  usable: boolean;
  connected: boolean;
  model: string | null;
  /** The model that names the journeys — a larger general model when one is installed. */
  journeyModel?: string | null;
  vision: boolean;
  reason: string | null;
  providers: AiProvider[];
  configuredModel: string | null;
  configuredUrl: string;
};

export type AiSettingsInput = {
  provider: string;
  url: string;
  model: string;
  /** Omitted or empty keeps the key already saved. */
  key?: string;
  enabled: boolean;
};

/** Stages in the order a run goes through them. */
export const INGEST_STAGES: { id: string; label: string }[] = [
  { id: 'upload', label: 'Uploading' },
  { id: 'extract', label: 'Reading frames' },
  { id: 'segment', label: 'Finding screens' },
  { id: 'classify', label: 'Naming and typing' },
  { id: 'identify', label: 'Identifying the app' },
  { id: 'flows', label: 'Grouping journeys' },
  { id: 'publish', label: 'Publishing' },
  { id: 'published', label: 'In the library' },
  { id: 'research', label: 'AI writing content' },
  { id: 'manifest', label: 'Rebuilding index' },
];

export function stageIndex(stage: string): number {
  return INGEST_STAGES.findIndex((entry) => entry.id === stage);
}

export function isActive(job: IngestJob): boolean {
  return job.status === 'uploading' || job.status === 'running';
}

// ─── The shared store ───────────────────────────────────────────────────────

type Snapshot = { jobs: IngestJob[]; loaded: boolean; error: string | null };

const EMPTY: Snapshot = { jobs: [], loaded: false, error: null };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();
let pollTimer: ReturnType<typeof setTimeout> | null = null;
let polling = false;
/** Set once an admin has been seen, so the loop never asks as a stranger. */
let allowed = false;

function emit(next: Snapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

function upsert(job: IngestJob) {
  const rest = snapshot.jobs.filter((entry) => entry.id !== job.id);
  emit({ ...snapshot, jobs: sortJobs([job, ...rest]) });
}

function sortJobs(jobs: IngestJob[]): IngestJob[] {
  return [...jobs].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

async function authHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
  const token = await getIdToken();
  if (!token) throw new Error('You are signed out. Sign in again to continue.');
  return { Authorization: `Bearer ${token}`, ...extra };
}

async function fetchJobs(): Promise<void> {
  try {
    const res = await fetch('/api/crawler/jobs', { headers: await authHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not read the run list (${res.status}).`);
    const payload = (await res.json()) as { jobs: IngestJob[] };
    // Uploads in flight exist only in this tab; the server does not know
    // them yet, so they are kept alongside what it returned.
    const uploading = snapshot.jobs.filter((job) => job.status === 'uploading' && !payload.jobs.some((entry) => entry.id === job.id));
    emit({ jobs: sortJobs([...uploading, ...payload.jobs]), loaded: true, error: null });
  } catch (error) {
    emit({ ...snapshot, loaded: true, error: (error as Error).message });
  }
}

function schedule() {
  if (pollTimer) clearTimeout(pollTimer);
  if (!polling) return;
  // Quick while something is running, relaxed otherwise: a run started in
  // another tab still shows up within half a minute.
  const busy = snapshot.jobs.some(isActive);
  pollTimer = setTimeout(async () => {
    await fetchJobs();
    schedule();
  }, busy ? 1500 : 20000);
}

function startPolling() {
  if (polling || !allowed) return;
  polling = true;
  void fetchJobs().then(schedule);
}

function stopPolling() {
  polling = false;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = null;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) startPolling();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) stopPolling();
  };
}

/**
 * The run list, live. `admin` says whether the signed-in account may read it;
 * nothing is fetched until it is true.
 */
export function useIngestJobs(admin: boolean): Snapshot {
  useEffect(() => {
    if (!admin) return;
    allowed = true;
    if (listeners.size) startPolling();
  }, [admin]);
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}

/** Forces a read now — after starting or dismissing a run. */
export function refreshIngestJobs(): Promise<void> {
  return fetchJobs().then(schedule);
}

export type StartIngestOptions = { keepLoading?: boolean; fps?: number };

/**
 * Uploads a recording and starts its run. The upload itself is shown as a
 * job straight away, with a percentage, so the dock has something to say
 * from the first second.
 */
export function startIngest(video: File, startedBy: string, options: StartIngestOptions = {}): Promise<string> {
  const localId = `upload-${Date.now().toString(36)}`;
  const placeholder: IngestJob = {
    id: localId,
    title: video.name,
    sizeBytes: video.size,
    startedBy,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'uploading',
    stage: 'upload',
    message: `Uploading ${megabytes(video.size)}…`,
    done: null,
    total: null,
    frames: null,
    screens: null,
    uploaded: 0,
    analyzer: null,
    log: [],
    interim: null,
    result: null,
    error: null,
    dismissed: false,
  };
  upsert(placeholder);

  return new Promise<string>((resolve, reject) => {
    void (async () => {
      let headers: Record<string, string>;
      try {
        headers = await authHeaders({ 'Content-Type': video.type || 'video/quicktime' });
      } catch (error) {
        upsert({ ...placeholder, status: 'failed', error: (error as Error).message, finishedAt: new Date().toISOString() });
        reject(error);
        return;
      }
      const query = new URLSearchParams({ ext: extensionOf(video), name: video.name });
      if (options.keepLoading) query.set('loading', '1');
      if (options.fps) query.set('fps', String(options.fps));

      // XMLHttpRequest, for one reason: fetch cannot report upload progress.
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/crawler/ingest?${query}`);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const fraction = event.loaded / event.total;
        upsert({ ...placeholder, uploaded: fraction, message: `Uploading ${megabytes(video.size)} — ${Math.round(fraction * 100)}%` });
      };
      xhr.onerror = () => {
        const message = 'The upload did not reach the server.';
        upsert({ ...placeholder, status: 'failed', error: message, finishedAt: new Date().toISOString() });
        reject(new Error(message));
      };
      xhr.onload = () => {
        let payload: { jobId?: string; message?: string } = {};
        try {
          payload = JSON.parse(xhr.responseText) as typeof payload;
        } catch {
          // The status line decides.
        }
        if (xhr.status < 200 || xhr.status >= 300 || !payload.jobId) {
          const message = payload.message || `Request failed (${xhr.status})`;
          upsert({ ...placeholder, status: 'failed', error: message, finishedAt: new Date().toISOString() });
          reject(new Error(message));
          return;
        }
        // The server's job replaces the local one on the next read.
        emit({ ...snapshot, jobs: snapshot.jobs.filter((job) => job.id !== localId) });
        void refreshIngestJobs();
        resolve(payload.jobId);
      };
      xhr.send(video);
    })();
  });
}

/** Removes a finished run from the list, everywhere it is shown. */
export async function dismissIngestJob(id: string): Promise<void> {
  if (id.startsWith('upload-')) {
    emit({ ...snapshot, jobs: snapshot.jobs.filter((job) => job.id !== id) });
    return;
  }
  // Gone from the screen at once; the server catches up.
  emit({ ...snapshot, jobs: snapshot.jobs.filter((job) => job.id !== id) });
  await fetch(`/api/crawler/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', headers: await authHeaders() }).catch(() => undefined);
}

// ─── Where the dock shows ───────────────────────────────────────────────────

let suppressed = 0;
const suppressListeners = new Set<() => void>();

/**
 * The admin's Automatic tab shows a run in full, so while it is on screen the
 * floating dock steps aside rather than showing the same run twice.
 */
export function useSuppressDock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    suppressed++;
    for (const listener of suppressListeners) listener();
    return () => {
      suppressed--;
      for (const listener of suppressListeners) listener();
    };
  }, [active]);
}

export function useDockSuppressed(): boolean {
  return useSyncExternalStore(
    (listener) => {
      suppressListeners.add(listener);
      return () => {
        suppressListeners.delete(listener);
      };
    },
    () => suppressed > 0,
    () => false,
  );
}

// ─── The AI's standing ──────────────────────────────────────────────────────

type AiSnapshot = { status: AiStatus | null; loading: boolean; error: string | null };
let aiSnapshot: AiSnapshot = { status: null, loading: false, error: null };
const aiListeners = new Set<() => void>();
const AI_EMPTY: AiSnapshot = { status: null, loading: false, error: null };

function emitAi(next: AiSnapshot) {
  aiSnapshot = next;
  for (const listener of aiListeners) listener();
}

function subscribeAi(listener: () => void) {
  aiListeners.add(listener);
  return () => {
    aiListeners.delete(listener);
  };
}

/** Reads the AI's standing from the server: which model, and does it answer. */
export async function refreshAiStatus(): Promise<AiStatus | null> {
  emitAi({ ...aiSnapshot, loading: true });
  try {
    const res = await fetch('/api/crawler/ai', { headers: await authHeaders(), cache: 'no-store' });
    if (!res.ok) throw new Error(`Could not read the AI status (${res.status}).`);
    const status = (await res.json()) as AiStatus;
    emitAi({ status, loading: false, error: null });
    return status;
  } catch (error) {
    emitAi({ ...aiSnapshot, loading: false, error: (error as Error).message });
    return null;
  }
}

/** Saves a choice of AI and returns its standing afterwards. */
export async function saveAiSettings(input: AiSettingsInput): Promise<AiStatus> {
  emitAi({ ...aiSnapshot, loading: true });
  try {
    const res = await fetch('/api/crawler/ai', {
      method: 'PUT',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(input),
    });
    const payload = (await res.json().catch(() => ({}))) as AiStatus & { message?: string };
    if (!res.ok) throw new Error(payload.message || `Could not save the AI settings (${res.status}).`);
    emitAi({ status: payload, loading: false, error: null });
    return payload;
  } catch (error) {
    emitAi({ ...aiSnapshot, loading: false, error: (error as Error).message });
    throw error;
  }
}

/**
 * The AI's standing, fetched once for the first component that asks and
 * shared with every other. `admin` gates the request as above.
 */
export function useAiStatus(admin: boolean): AiSnapshot {
  const current = useSyncExternalStore(subscribeAi, () => aiSnapshot, () => AI_EMPTY);
  useEffect(() => {
    if (admin && !aiSnapshot.status && !aiSnapshot.loading) void refreshAiStatus();
  }, [admin]);
  return current;
}

// ─── Small helpers shared by the panel and the dock ─────────────────────────

export function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

export function clock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '';
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

export function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'mov';
}

/** A short line for the AI pill: the model, or why there is none. */
export function aiLabel(status: AiStatus | null): string {
  if (!status) return 'AI…';
  if (!status.enabled) return 'AI off';
  if (status.usable) return status.model ?? 'AI ready';
  return 'AI not connected';
}
