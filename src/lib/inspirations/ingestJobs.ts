'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { getIdToken } from '@/lib/firebase/auth';
import { adminApi, type ScreenSidecar } from '@/lib/inspirations/admin';
import { doneText, type AdminOp, type AssistantAction, type ConfirmAction, type Expect } from '@/lib/inspirations/assistantActions';
import type { Platform, ScreenType } from '@/lib/inspirations/types';
import { invalidateInspirationsCache } from '@/lib/inspirations/api';

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
  /** Reading a recording, or rewriting an app's names with the AI. */
  mode?: 'ingest' | 'research';
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
  /** The model behind the assistant's chat. */
  chatModel?: string | null;
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
  /** The model that talks in the assistant and names journeys; empty means automatic. */
  chatModel?: string;
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

export type StartIngestOptions = { keepLoading?: boolean; fps?: number; platform?: 'ios' | 'android' | 'web' };

export const PLATFORM_CHOICES: { id: 'ios' | 'android' | 'web'; label: string }[] = [
  { id: 'ios', label: 'iOS' },
  { id: 'android', label: 'Android' },
  { id: 'web', label: 'Web' },
];

/** The platform named in a message, if any. */
export function platformIn(text: string): 'ios' | 'android' | 'web' | null {
  const t = text.toLowerCase();
  if (/\b(ios|iphone|ipad|apple)\b/.test(t)) return 'ios';
  if (/\b(android|pixel|samsung|galaxy)\b/.test(t)) return 'android';
  if (/\b(web|website|browser|desktop|chrome|safari)\b/.test(t)) return 'web';
  return null;
}

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
      query.set('platform', options.platform ?? 'ios');

      // XMLHttpRequest, for one reason: fetch cannot report upload progress.
      const xhr = new XMLHttpRequest();
      currentUpload = { xhr, jobId: localId };
      xhr.open('POST', `/api/crawler/ingest?${query}`);
      for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const fraction = event.loaded / event.total;
        upsert({ ...placeholder, uploaded: fraction, message: `Uploading ${megabytes(video.size)} — ${Math.round(fraction * 100)}%` });
      };
      xhr.onerror = () => {
        if (currentUpload?.jobId === localId) currentUpload = null;
        const message = 'The upload did not reach the server.';
        upsert({ ...placeholder, status: 'failed', error: message, finishedAt: new Date().toISOString() });
        reject(new Error(message));
      };
      xhr.onabort = () => {
        if (currentUpload?.jobId === localId) currentUpload = null;
        const message = 'Cancelled by the admin.';
        upsert({ ...placeholder, status: 'failed', error: message, message, finishedAt: new Date().toISOString() });
        reject(new Error(message));
      };
      xhr.onload = () => {
        if (currentUpload?.jobId === localId) currentUpload = null;
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

/**
 * Cancels a video upload while it is still in flight — before the server
 * even has a job to `?stop=1`. Returns false when nothing is uploading.
 */
export function cancelUpload(): boolean {
  if (!currentUpload) return false;
  currentUpload.xhr.abort();
  currentUpload = null;
  return true;
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

// ─── The assistant's conversation ───────────────────────────────────────────

export type { AdminOp, AssistantAction, ConfirmAction } from './assistantActions';

export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  at: string;
  pending?: boolean;
  actions?: AssistantAction[];
  source?: 'rules' | 'ai';
};

type ChatSnapshot = {
  messages: ChatMessage[];
  /** The operation offered last, waiting for a yes or a Confirm. */
  pending: ConfirmAction | null;
  /** An image dropped on the dock, kept until it is used as a logo. */
  heldImage: { name: string; size: number } | null;
  /** A recording dropped on the dock, waiting to be told its platform. */
  heldVideo: { name: string; size: number } | null;
  /** What the assistant asked to be told next — the next message is that value. */
  expecting: Expect | null;
};
let chat: ChatSnapshot = { messages: [], pending: null, heldImage: null, heldVideo: null, expecting: null };
let heldFile: File | null = null;
let heldVideoFile: File | null = null;
/** The in-flight assistant request, if any — `stopAssistant()` aborts it. */
let currentAsk: AbortController | null = null;
/** Set for the turn currently in flight; also halts the local typing animation for a whole (non-streamed) answer. */
let stopRequested = false;
/**
 * The video upload in flight, if any. Sending a 200+ MB recording can take
 * a while on its own, before a server job even exists to `?stop=1` — so a
 * cancel here has to abort the browser's own request, not ask the server.
 */
let currentUpload: { xhr: XMLHttpRequest; jobId: string } | null = null;
const chatListeners = new Set<() => void>();
const CHAT_EMPTY: ChatSnapshot = { messages: [], pending: null, heldImage: null, heldVideo: null, expecting: null };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loaded = false;

function emitChat(next: ChatSnapshot) {
  chat = next;
  for (const listener of chatListeners) listener();
  scheduleSave();
}

/**
 * The conversation is kept on the server (one admin, one conversation), so
 * a refresh or a second tab picks it up where it was. Saved a moment after
 * each settled change; a message still being typed out is not saved yet.
 */
function scheduleSave() {
  if (!loaded || typeof window === 'undefined') return;
  if (chat.messages.some((message) => message.pending)) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void (async () => {
      try {
        await fetch('/api/crawler/assistant/history', {
          method: 'PUT',
          headers: await authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ messages: chat.messages.slice(-200), pending: chat.pending, expecting: chat.expecting }),
        });
      } catch {
        // Kept in memory; the next change tries again.
      }
    })();
  }, 600);
}

/** Loads the saved conversation once the admin is known. */
export async function loadAssistantChat(): Promise<void> {
  if (loaded) return;
  try {
    const res = await fetch('/api/crawler/assistant/history', { headers: await authHeaders(), cache: 'no-store' });
    if (res.ok) {
      const stored = (await res.json()) as { messages?: ChatMessage[]; pending?: ConfirmAction | null; expecting?: Expect | null };
      const messages = Array.isArray(stored.messages) ? stored.messages.filter((message) => message && message.id && message.role && typeof message.text === 'string').map((message) => ({ ...message, pending: false })) : [];
      // What happened in this tab before the load finished comes after.
      const seen = new Set(messages.map((message) => message.id));
      chat = { ...chat, messages: [...messages, ...chat.messages.filter((message) => !seen.has(message.id))], pending: chat.pending ?? stored.pending ?? null, expecting: chat.expecting ?? stored.expecting ?? null };
      for (const listener of chatListeners) listener();
    }
  } catch {
    // Offline or signed out: the conversation starts empty here.
  } finally {
    loaded = true;
  }
}

function subscribeChat(listener: () => void) {
  chatListeners.add(listener);
  return () => {
    chatListeners.delete(listener);
  };
}

/** The conversation so far. Kept for the page's life, across navigation. */
export function useAssistantChat(): ChatSnapshot {
  return useSyncExternalStore(subscribeChat, () => chat, () => CHAT_EMPTY);
}

function patchMessage(id: string, patch: Partial<ChatMessage>) {
  emitChat({ ...chat, messages: chat.messages.map((message) => (message.id === id ? { ...message, ...patch } : message)) });
}

function append(message: ChatMessage) {
  emitChat({ ...chat, messages: [...chat.messages.slice(-60), message] });
}

/** Types a whole answer out over a moment, the way a streamed one arrives. */
function typeOut(id: string, text: string, done: Partial<ChatMessage>): Promise<void> {
  return new Promise((resolve) => {
    const words = text.split(/(\s+)/);
    let shown = 0;
    const tick = () => {
      if (stopRequested) {
        // The admin pressed Stop while an instant answer was still being
        // typed out; it freezes where it is, exactly like an aborted stream.
        patchMessage(id, { text: words.slice(0, shown).join('') || 'Stopped.', pending: false, actions: [] });
        resolve();
        return;
      }
      shown = Math.min(words.length, shown + 3);
      patchMessage(id, { text: words.slice(0, shown).join(''), pending: shown < words.length });
      if (shown < words.length) setTimeout(tick, 24);
      else {
        patchMessage(id, { ...done, text, pending: false });
        resolve();
      }
    };
    tick();
  });
}

type AssistantEvent =
  | { type: 'token'; text: string }
  | { type: 'done'; text: string; source: 'rules' | 'ai'; actions: AssistantAction[]; model?: string; streamed?: boolean; expect?: Expect | null }
  | { type: 'error'; message: string };

/**
 * Asks the assistant. The question shows at once; the answer types itself
 * out — piece by piece as the model writes it, or over a moment when it
 * came whole from the run list. The last few lines of the conversation go
 * along, so "set it to Order in minutes" can follow "change Swiggy's
 * tagline" and be understood.
 */
export async function askAssistant(question: string): Promise<ChatMessage> {
  const trimmed = question.trim();
  const stamp = Date.now().toString(36);
  const history = chat.messages.filter((message) => !message.pending && message.text).slice(-12).map((message) => ({ role: message.role, text: message.text }));
  const user: ChatMessage = { id: `u-${stamp}`, role: 'user', text: trimmed, at: new Date().toISOString() };
  const pending: ChatMessage = { id: `a-${stamp}`, role: 'assistant', text: '', at: new Date().toISOString(), pending: true };
  emitChat({ ...chat, messages: [...chat.messages.slice(-60), user, pending] });

  // One in-flight request at a time; a stray abort from an earlier turn
  // must never cancel this one.
  const controller = new AbortController();
  currentAsk = controller;
  stopRequested = false;

  let streamedText = '';
  let stopped = false;
  let final: AssistantEvent | null = null;
  try {
    const res = await fetch('/api/crawler/assistant', {
      method: 'POST',
      headers: await authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ question: trimmed, history, pending: chat.pending?.label ?? null, heldImage: heldFile?.name ?? null, lastOp: lastOfferedOp(), expecting: chat.expecting }),
      signal: controller.signal,
    });
    if (!res.ok || !res.body) {
      const payload = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(payload.message || `The assistant did not answer (${res.status}).`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const handle = (line: string) => {
      let event: AssistantEvent;
      try {
        event = JSON.parse(line) as AssistantEvent;
      } catch {
        return;
      }
      if (event.type === 'token') {
        streamedText += event.text;
        patchMessage(pending.id, { text: streamedText, pending: true });
      } else final = event;
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let index = buffer.indexOf('\n');
      while (index !== -1) {
        const line = buffer.slice(0, index).trim();
        buffer = buffer.slice(index + 1);
        if (line) handle(line);
        index = buffer.indexOf('\n');
      }
    }
    if (buffer.trim()) handle(buffer.trim());
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      stopped = true;
      // The reader is torn down by the abort; whatever streamed in already
      // is what is kept, exactly as ChatGPT leaves a stopped reply in place.
    } else {
      final = { type: 'error', message: (error as Error).message };
    }
  } finally {
    if (currentAsk === controller) currentAsk = null;
  }

  if (stopped) {
    patchMessage(pending.id, { text: streamedText || 'Stopped.', pending: false, actions: [] });
    return chat.messages.find((message) => message.id === pending.id) ?? pending;
  }

  // Assigned inside the reader's callbacks, which TypeScript cannot follow.
  const settled = (final as AssistantEvent | null) ?? { type: 'error' as const, message: 'The assistant stopped without answering.' };
  if (settled.type === 'error') {
    patchMessage(pending.id, { text: settled.message, pending: false, actions: [] });
  } else if (settled.type !== 'done') {
    patchMessage(pending.id, { text: streamedText || 'The assistant stopped without answering.', pending: false, actions: [] });
  } else if (streamedText) {
    patchMessage(pending.id, { text: settled.text || streamedText, pending: false, actions: settled.actions ?? [], source: settled.source });
  } else {
    await typeOut(pending.id, settled.text, { actions: settled.actions ?? [], source: settled.source });
  }
  // An offered operation waits for a yes — typed or pressed; a cancel drops it.
  if (settled.type === 'done') {
    const cancelled = (settled.actions ?? []).some((action) => action.type === 'cancel');
    const offered = (settled.actions ?? []).find((action): action is ConfirmAction => action.type === 'confirm') ?? null;
    // `expect` undefined keeps what was there; null clears it; an object sets it.
    emitChat({ ...chat, pending: cancelled ? null : offered, expecting: settled.expect === undefined ? (offered ? null : chat.expecting) : settled.expect });
  }
  return chat.messages.find((message) => message.id === pending.id) ?? pending;
}

/** Aborts the assistant's in-flight reply, if any — the send button becomes this while it types. */
export function stopAssistant() {
  stopRequested = true;
  currentAsk?.abort();
}

const YES = /^(yes|y|yeah|yep|ok|okay|sure|confirm|do it|go ahead|proceed|yes remove|yes delete|remove it|delete it|apply|save)\b/i;
const NO = /^(no|nope|cancel|stop|don't|dont|never mind|nevermind|forget it)\b/i;

/** The operation offered most recently, answered or not — what "another" refers to. */
export function lastOfferedOp(): AdminOp | null {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const confirm = chat.messages[i].actions?.find((action): action is ConfirmAction => action.type === 'confirm');
    if (confirm) return confirm.op;
  }
  return null;
}

/** The operation waiting for a yes right now. */
export function getPending(): ConfirmAction | null {
  return chat.pending;
}

/** Whether a typed line answers the operation that is waiting. */
export function answersPending(text: string): 'yes' | 'no' | null {
  if (!chat.pending) return null;
  const trimmed = text.trim();
  if (YES.test(trimmed)) return 'yes';
  if (NO.test(trimmed)) return 'no';
  return null;
}

export function cancelPending() {
  if (!chat.pending) {
    if (chat.expecting) emitChat({ ...chat, expecting: null });
    return;
  }
  const label = chat.pending.label;
  emitChat({ ...chat, pending: null, expecting: null });
  assistantSays(`Cancelled — “${label}” was not done. Nothing changed.`);
}

/** Keeps an image the admin dropped, until a request says which app it is for. */
export function holdImage(file: File) {
  heldFile = file;
  emitChat({ ...chat, heldImage: { name: file.name, size: file.size } });
}

export function heldImageFile(): File | null {
  return heldFile;
}

export function releaseImage() {
  heldFile = null;
  emitChat({ ...chat, heldImage: null });
}

/** Keeps a recording until the admin says which platform it is from. */
export function holdVideo(file: File) {
  heldVideoFile = file;
  emitChat({ ...chat, heldVideo: { name: file.name, size: file.size } });
}

export function heldVideoFileNow(): File | null {
  return heldVideoFile;
}

export function releaseVideo() {
  heldVideoFile = null;
  emitChat({ ...chat, heldVideo: null });
}

function tellAdminChanged() {
  invalidateInspirationsCache();
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('motvin:admin-changed'));
}

/**
 * Performs a confirmed operation through the admin API, as the signed-in
 * admin, and reports what happened. A logo needs an image: the one dropped
 * earlier, or the one passed in from the picker.
 */
export async function performAction(action: ConfirmAction, image?: File | null): Promise<'done' | 'needs-image' | 'failed'> {
  const { op } = action;
  if ((op.kind === 'set-logo' || op.kind === 'add-screen') && !(image ?? heldFile)) return 'needs-image';
  emitChat({ ...chat, pending: null });
  const working: ChatMessage = { id: `a-${Date.now().toString(36)}`, role: 'assistant', text: `${action.label}…`, at: new Date().toISOString(), pending: true };
  append(working);
  try {
    let done = doneText(op);
    switch (op.kind) {
      case 'remove-app': {
        const { removed } = await adminApi.deleteApp(op.appId);
        done = doneText(op, { screens: removed.screens ?? 0, flows: removed.flows ?? 0 });
        break;
      }
      case 'rebuild': {
        const report = await adminApi.rebuild();
        const problems = report.problems?.length ?? 0;
        done = problems ? `Index rebuilt with ${problems} problem${problems === 1 ? '' : 's'} — see the admin page.` : doneText(op);
        break;
      }
      case 'update-app': {
        const state = await adminApi.getState();
        const current = state.apps.find((app) => app.id === op.appId);
        if (!current) throw new Error(`${op.name} is no longer in the library.`);
        const next = { ...current, ...(op.fields as Partial<typeof current>) };
        await adminApi.saveApp(next);
        break;
      }
      case 'set-logo': {
        const file = image ?? heldFile!;
        await adminApi.uploadLogo(op.appId, file.name, file);
        releaseImage();
        done = `${op.name}’s logo is now “${file.name}”.`;
        break;
      }
      case 'rename-screen': {
        const state = await adminApi.getState();
        const file = state.files.find((entry) => entry.appId === op.appId && entry.platform === op.platform && entry.file === op.file);
        await adminApi.saveScreenMeta(op.platform as Platform, op.appId, op.file, { ...(file?.sidecar ?? {}), name: op.to });
        break;
      }
      case 'delete-screen':
        await adminApi.deleteScreen(op.platform as Platform, op.appId, op.file);
        break;
      case 'rename-flow': {
        const state = await adminApi.getState();
        const flow = state.flows.find((entry) => entry.id === op.flowId);
        if (!flow) throw new Error('That flow is no longer in the library.');
        await adminApi.saveFlow({ ...flow, name: op.to });
        break;
      }
      case 'delete-flow':
        await adminApi.deleteFlow(op.flowId);
        break;
      case 'set-screen-type': {
        const state = await adminApi.getState();
        const file = state.files.find((entry) => entry.appId === op.appId && entry.platform === op.platform && entry.file === op.file);
        await adminApi.saveScreenMeta(op.platform as Platform, op.appId, op.file, { ...(file?.sidecar ?? {}), screenType: op.screenType as ScreenType });
        break;
      }
      case 'set-flow-category': {
        const state = await adminApi.getState();
        const flow = state.flows.find((entry) => entry.id === op.flowId);
        if (!flow) throw new Error('That flow is no longer in the library.');
        await adminApi.saveFlow({ ...flow, category: op.category });
        break;
      }
      case 'set-screen-tags': {
        const state = await adminApi.getState();
        const file = state.files.find((entry) => entry.appId === op.appId && entry.platform === op.platform && entry.file === op.file);
        const existing = file?.sidecar?.tags ?? [];
        const tags = op.mode === 'replace' ? op.tags : [...new Set([...existing, ...op.tags])];
        await adminApi.saveScreenMeta(op.platform as Platform, op.appId, op.file, { ...(file?.sidecar ?? {}), tags });
        break;
      }
      case 'set-screen-description': {
        const state = await adminApi.getState();
        const file = state.files.find((entry) => entry.appId === op.appId && entry.platform === op.platform && entry.file === op.file);
        await adminApi.saveScreenMeta(op.platform as Platform, op.appId, op.file, { ...(file?.sidecar ?? {}), description: op.description } as ScreenSidecar);
        break;
      }
      case 'add-to-flow':
      case 'remove-from-flow': {
        const state = await adminApi.getState();
        const flow = state.flows.find((entry) => entry.id === op.flowId);
        if (!flow) throw new Error('That flow is no longer in the library.');
        const screenIds = op.kind === 'add-to-flow' ? [...new Set([...flow.screenIds, ...op.screenIds])] : flow.screenIds.filter((id) => !op.screenIds.includes(id));
        await adminApi.saveFlow({ ...flow, screenIds });
        break;
      }
      case 'create-flow': {
        const slug = op.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'flow';
        await adminApi.saveFlow({ id: `${op.appId}-ios-${slug}`, appId: op.appId, name: op.name, category: op.category, platform: 'ios' as Platform, screenIds: op.screenIds, parentId: null });
        break;
      }
      case 'set-flow-parent': {
        const state = await adminApi.getState();
        const flow = state.flows.find((entry) => entry.id === op.flowId);
        if (!flow) throw new Error('That flow is no longer in the library.');
        await adminApi.saveFlow({ ...flow, parentId: op.parentId });
        break;
      }
      case 'set-source-status': {
        const state = await adminApi.getState();
        await adminApi.saveSource(op.appId, { ...(state.sources[op.appId] ?? {}), status: op.status });
        break;
      }
      case 'stop-run': {
        const res = await fetch(`/api/crawler/jobs/${encodeURIComponent(op.jobId)}?stop=1`, { method: 'DELETE', headers: await authHeaders() });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? `Could not stop the run (${res.status}).`);
        void refreshIngestJobs();
        break;
      }
      case 'research-app': {
        const res = await fetch('/api/crawler/research', { method: 'POST', headers: await authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ appId: op.appId, name: op.name }) });
        if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { message?: string }).message ?? `Could not start the rewrite (${res.status}).`);
        void refreshIngestJobs();
        break;
      }
      case 'set-ai': {
        const current = aiSnapshot.status ?? (await refreshAiStatus());
        if (!current) throw new Error('The AI status could not be read.');
        const provider = current.providers.find((entry) => entry.id === current.provider)?.id ?? 'custom';
        await saveAiSettings({ provider, url: current.configuredUrl, model: current.configuredModel ?? '', chatModel: op.chatModel ?? undefined, enabled: op.enabled !== false });
        break;
      }
      case 'add-screen': {
        const file = image ?? heldFile!;
        await adminApi.uploadScreen('ios' as Platform, op.appId, file.name, file);
        releaseImage();
        done = `“${file.name}” is now a screen of ${op.name}.`;
        break;
      }
    }
    patchMessage(working.id, { pending: false, text: done, actions: [] });
    tellAdminChanged();
    return 'done';
  } catch (error) {
    patchMessage(working.id, { pending: false, text: `That did not go through: ${(error as Error).message}`, actions: [] });
    return 'failed';
  }
}

/** Offers an operation for the admin to confirm — the way the server does, but from the page. */
export function offerAction(text: string, action: ConfirmAction) {
  append({ id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, role: 'assistant', text, at: new Date().toISOString(), actions: [action] });
  emitChat({ ...chat, pending: action });
}

/** Asks whether to stop a running job; the answer is a Confirm or a typed yes. */
export function offerStop(job: IngestJob) {
  offerAction(`Stop “${job.title}”? The screens it has already published stay; the rest of the run is abandoned.`, {
    type: 'confirm',
    op: { kind: 'stop-run', jobId: job.id, title: job.title },
    label: `Stop “${job.title}”`,
    destructive: true,
  });
}

/**
 * Stops whatever a job is doing right now, however far it has got. A
 * recording still in flight over the wire is cancelled outright — nothing
 * has been published yet, so there is nothing at stake in asking twice. A
 * run already going on the server (reading frames, publishing, writing
 * names) gets the usual Confirm, since it may already have screens live.
 */
export function stopActiveRun(job: IngestJob) {
  if (job.status === 'uploading') {
    if (cancelUpload()) assistantSays(`Cancelled the upload of “${job.title}”.`);
    return;
  }
  offerStop(job);
}

/** A line the assistant says on its own — after an upload starts, for one. */
export function assistantSays(text: string, actions: AssistantAction[] = []) {
  append({ id: `a-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`, role: 'assistant', text, at: new Date().toISOString(), actions });
}

/** What the admin typed, shown as theirs — for a yes or no settled locally. */
export function adminSays(text: string) {
  append({ id: `u-${Date.now().toString(36)}`, role: 'user', text, at: new Date().toISOString() });
}

export async function clearAssistantChat() {
  heldFile = null;
  heldVideoFile = null;
  emitChat({ messages: [], pending: null, heldImage: null, heldVideo: null, expecting: null });
  try {
    await fetch('/api/crawler/assistant/history', { method: 'DELETE', headers: await authHeaders() });
  } catch {
    // The empty conversation is saved on the next change anyway.
  }
}
