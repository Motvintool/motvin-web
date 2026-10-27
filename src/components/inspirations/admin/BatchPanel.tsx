'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adminApi, type AdminState } from '@/lib/inspirations/admin';
import { inspirationsApi } from '@/lib/inspirations/api';
import { authHeaders } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { dayLabel } from '@/lib/inspirations/dates';
import type { Industry } from '@/lib/inspirations/types';
import { CheckIcon, ChevronDownIcon, CloseIcon, CloudUploadIcon, CopyIcon, ExternalIcon, FolderIcon, PlayIcon, RetryIcon, SearchIcon, StopIcon } from '../Icons';
import { Summary, Wizard } from './Wizard';
import { onRecordings, takeRecordings } from './recordingHandoff';

/**
 * Agent Upload — many apps at once, with nobody watching.
 *
 * The admin lists the recordings (from the records folder on this machine, or
 * from their computer), with a name and logo each when they want one, and
 * picks the settings once. Starting makes each new app and sets its logo here
 * (that needs the admin's sign-in); the server then works through the queue
 * by itself — upload, clean-up, review, final check, clean-up — and this board
 * shows where each app is. Closing the page does not stop it.
 */

type Platform = 'ios' | 'webapp' | 'web';
type Settings = {
  cleanup: 'automatic' | 'manual';
  review: 'auto' | 'manual';
  afterReview: 'cleanup' | 'keep';
  existing: 'skip' | 'version' | 'replace';
  platform: Platform;
  version: string | null;
  notify: 'each' | 'summary' | 'off';
  appsAtOnce: 1 | 2 | 3 | 4;
  reviewer: 'claude' | 'gemini';
  reviewModel: 'opus' | 'sonnet';
};
type RecordVideo = { name: string; file: string; path: string; platform: Platform | 'any'; sizeBytes: number };
type Row = { key: string; title: string; name: string; video: { kind: 'records'; path: string } | { kind: 'file'; file: File }; logo: { kind: 'records'; file: string } | { kind: 'file'; file: File } | null; sizeBytes: number };
type BatchItem = {
  id: string;
  title: string;
  stage: 'queued' | 'uploading' | 'choose' | 'review-queued' | 'reviewing' | 'review-ready' | 'done' | 'skipped' | 'needs-you';
  note: string | null;
  appId: string | null;
  version: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  waitUntil: string | null;
  result: { appName: string; screens: number; flows: number } | null;
  workMs?: number;
  usage?: { tokens: number; reviews: number };
  model?: string;
};
type Batch = { id: string; cleared?: boolean; createdAt: string; settings: Settings & { platform: Platform }; items: BatchItem[]; state: 'running' | 'paused' | 'done'; finishedAt: string | null };

const STAGE_LABEL: Record<BatchItem['stage'], string> = {
  queued: 'Waiting',
  uploading: 'Uploading',
  choose: 'Needs your clean-up choice',
  'review-queued': 'Waiting for review',
  reviewing: 'Reviewing',
  'review-ready': 'Ready for review',
  done: 'Done',
  skipped: 'Skipped',
  'needs-you': 'Needs you',
};

const STEPS = [
  { id: 'recordings', label: 'Recordings' },
  { id: 'apps', label: 'Apps' },
  { id: 'settings', label: 'Settings' },
  { id: 'start', label: 'Check & start' },
];

const DEFAULTS: Settings = { cleanup: 'automatic', review: 'auto', afterReview: 'cleanup', existing: 'skip', platform: 'ios', version: null, notify: 'each', appsAtOnce: 3, reviewer: 'claude', reviewModel: 'sonnet' };
const PLATFORM_LABEL: Record<Platform, string> = { ios: 'iOS', webapp: 'Web App', web: 'Web' };

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
const plainName = (file: string) => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
const minutes = (from: string | null, to: string | null) => {
  if (!from) return '';
  const seconds = Math.max(0, Math.round(((to ? Date.parse(to) : Date.now()) - Date.parse(from)) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

const clockOf = (ms: number) => {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: await authHeaders(init?.headers as Record<string, string> | undefined), cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as T & { message?: string; error?: string };
  if (!res.ok) throw new Error(body.message ?? body.error ?? `Request failed (${res.status})`);
  return body;
}

function Choice<T extends string>({ label, value, options, onChange, hint }: { label: string; value: T; options: Array<[T, string]>; onChange: (next: T) => void; hint?: string }) {
  return (
    <div className="ins-field">
      <span className="ins-field-label">{label}</span>
      <div className="ins-segmented" role="radiogroup" aria-label={label}>
        {options.map(([id, text]) => (
          <button key={id} type="button" role="radio" aria-checked={value === id} className={`ins-segmented-item ${value === id ? 'is-active' : ''}`} onClick={() => onChange(id)}>
            {text}
          </button>
        ))}
      </div>
      {hint && <span className="ins-field-hint">{hint}</span>}
    </div>
  );
}

export function BatchPanel({ state, onChanged }: { state: AdminState; onChanged: () => Promise<void> | void }) {
  const [settings, setSettings] = useState<Settings>(DEFAULTS);
  const [rows, setRows] = useState<Row[]>([]);
  const [records, setRecords] = useState<{ root: string; videos: RecordVideo[]; logos: string[] } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [step, setStep] = useState(0);
  const [recordSearch, setRecordSearch] = useState('');
  const [started, setStarted] = useState<number | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [autoReview, setAutoReview] = useState(true);
  const [reviewers, setReviewers] = useState<{ claude: boolean; gemini: boolean }>({ claude: true, gemini: false });
  const [starting, setStarting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, setNow] = useState(0);
  const videoInput = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(key: K, value: Settings[K]) => setSettings((current) => ({ ...current, [key]: value }));

  const refresh = useCallback(async () => {
    try {
      const next = await api<{ batches: Batch[]; autoReview: boolean }>('/api/crawler/batch');
      setBatches(next.batches);
      setAutoReview(next.autoReview);
    } catch {
      // The board still shows the last state.
    }
  }, []);
  // The board follows the queue every five seconds while this tab is open.
  useEffect(() => {
    let live = true;
    const poll = async () => {
      try {
        const next = await api<{ batches: Batch[]; autoReview: boolean; reviewers?: { claude: boolean; gemini: boolean } }>('/api/crawler/batch');
        if (!live) return;
        setBatches(next.batches);
        setAutoReview(next.autoReview);
        if (next.reviewers) setReviewers(next.reviewers);
        setNow(Date.now());
      } catch {
        // The board still shows the last state.
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 5000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, []);
  const loadRecords = useCallback(() => api<{ root: string; videos: RecordVideo[]; logos: string[] }>('/api/crawler/batch/records').then(setRecords, () => setRecords({ root: '', videos: [], logos: [] })), []);
  useEffect(() => {
    void api<{ root: string; videos: RecordVideo[]; logos: string[] }>('/api/crawler/batch/records').then(setRecords, () => setRecords({ root: '', videos: [], logos: [] }));
  }, []);
  // The Mac's own folder picker, opened by the server on this Mac.
  const chooseFolder = async () => {
    setChoosing(true);
    setError(null);
    try {
      const picked = await api<{ success: boolean; cancelled?: boolean }>('/api/crawler/batch/records', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pick: true }) });
      if (picked.success) await loadRecords();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setChoosing(false);
    }
  };

  // A logo kept under the app's name in the records folder (Netflix.mov ↔ Netflix.webp).
  const matchLogo = useCallback((name: string): Row['logo'] => {
    const file = records?.logos.find((entry) => entry.replace(/\.[^.]+$/, '').toLowerCase() === name.toLowerCase());
    return file ? { kind: 'records', file } : null;
  }, [records]);

  const appFor = useCallback((name: string) => {
    const id = slug(name);
    return state.apps.find((app) => app.id === id || app.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
  }, [state.apps]);

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    const next = [...files].filter((file) => /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name)).map((file): Row => {
      const name = plainName(file.name);
      return { key: `f-${file.name}-${file.size}`, title: file.name, name, video: { kind: 'file', file }, logo: matchLogo(name), sizeBytes: file.size };
    });
    setRows((current) => [...current, ...next.filter((row) => !current.some((other) => other.key === row.key))]);
  }, [matchLogo]);
  // Recordings dropped on the Motvin agent come here, once the logos are known.
  useEffect(() => {
    if (!records) return;
    const take = () => addFiles(takeRecordings());
    take();
    return onRecordings(take);
  }, [records, addFiles]);
  const toggleRecord = (video: RecordVideo) => {
    const key = `r-${video.path}`;
    setRows((current) => (current.some((row) => row.key === key) ? current.filter((row) => row.key !== key) : [...current, { key, title: video.file, name: video.name, video: { kind: 'records', path: video.path }, logo: matchLogo(video.name), sizeBytes: video.sizeBytes }]));
  };
  const update = (key: string, patch: Partial<Row>) => setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const active = batches.filter((batch) => batch.state !== 'done').at(-1) ?? null;
  const last = active ?? batches.filter((batch) => !batch.cleared).at(-1) ?? null;
  // Every recording is an app already in the library, and those are skipped: starting would do nothing.
  const allSkipped = rows.length > 0 && settings.existing === 'skip' && rows.every((row) => appFor(row.name.trim() || plainName(row.title)));
  const recordsForPlatform = useMemo(() => (records?.videos ?? []).filter((video) => video.platform === settings.platform || video.platform === 'any'), [records, settings.platform]);

  const start = async () => {
    setError(null);
    try {
      const items = [];
      // Every upload lands in this day's version (or the one chosen), fixed now so a run past midnight keeps it.
      const now = new Date();
      const day = settings.version ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      for (const [i, row] of rows.entries()) {
        const name = row.name.trim() || plainName(row.title);
        setStarting(`Preparing ${i + 1} of ${rows.length}: ${name}`);
        const existing = appFor(name);
        if (existing && settings.existing === 'skip') {
          items.push({ title: row.title, video: row.video.kind === 'records' ? row.video.path : '', ownsVideo: false, appId: existing.id, detectIndustry: false, skip: `${existing.name} is already in the library` });
          continue;
        }
        let appId = existing?.id ?? slug(name);
        let detectIndustry = false;
        if (existing && settings.existing === 'replace') await adminApi.deleteApp(existing.id);
        if (!existing || settings.existing === 'replace') {
          // A new app under the name given; its real category is looked up by the upload.
          appId = slug(name) || `app-${Date.now().toString(36)}`;
          await adminApi.saveApp({ id: appId, name, industry: 'saas' as Industry });
          detectIndustry = true;
        }
        if (row.logo) {
          const blob = row.logo.kind === 'file' ? row.logo.file : await fetch(`/api/crawler/batch/records?logo=${encodeURIComponent(row.logo.file)}`, { headers: await authHeaders() }).then((res) => res.blob());
          await adminApi.uploadLogo(appId, row.logo.kind === 'file' ? row.logo.file.name : row.logo.file, blob);
        }
        let video = row.video.kind === 'records' ? row.video.path : '';
        if (row.video.kind === 'file') {
          setStarting(`Sending ${i + 1} of ${rows.length}: ${row.title}`);
          const ext = row.video.file.name.split('.').pop() ?? 'mov';
          video = (await api<{ path: string }>(`/api/crawler/batch/upload?ext=${encodeURIComponent(ext)}`, { method: 'POST', body: row.video.file })).path;
        }
        items.push({ title: row.title, video, ownsVideo: row.video.kind === 'file', appId, detectIndustry });
      }
      setStarting('Starting the queue');
      await api('/api/crawler/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ settings: { ...settings, version: day }, items }) });
      setStarted(rows.length);
      setRows([]);
      setStep(0);
      await refresh();
      await onChanged();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setStarting(null);
    }
  };

  const control = async (batch: Batch, action: 'pause' | 'resume' | 'retry' | 'skip' | 'stop' | 'stop-now' | 'clear', item?: string) => {
    try {
      await api(`/api/crawler/batch?${new URLSearchParams({ id: batch.id, action, ...(item ? { item } : {}) })}`, { method: 'PATCH' });
      await refresh();
    } catch (failure) {
      setError((failure as Error).message);
    }
  };

  return (
    <div className="ins-admin-panel ins-batch">
      {last && (
        <section className="ins-batch-board" aria-label="Queue">
          <div className="ins-batch-board-head">
            <div>
              <p className="ins-addflow-title">{last.state === 'done' ? 'Last batch' : last.state === 'paused' ? 'Batch paused' : 'Batch running'}</p>
              <p className="ins-muted">
                {last.items.filter((item) => item.stage === 'done').length} of {last.items.length} done · {PLATFORM_LABEL[last.settings.platform]} · started {new Date(last.createdAt).toLocaleString()}
                {last.finishedAt ? ` · took ${minutes(last.createdAt, last.finishedAt)}` : ''}
              </p>
            </div>
            {last.state === 'done' && (
              <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void control(last, 'clear')}>
                <CloseIcon size={13} /> Clear
              </button>
            )}
            {last.state !== 'done' && (
              <div className="ins-admin-actions ins-admin-actions--tight">
                {last.state === 'running' ? (
                  <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void control(last, 'pause')}>Pause</button>
                ) : (
                  <button type="button" className="ins-btn ins-btn--ghost" onClick={() => void control(last, 'resume')}><PlayIcon size={13} /> Resume</button>
                )}
                <button type="button" className="ins-btn ins-btn--ghost" onClick={() => { if (window.confirm('Stop every app now? The apps under way stop at once, the screens they added are taken out of the library again, and the rest are skipped.')) void control(last, 'stop-now'); }}><StopIcon size={13} /> Stop all</button>
              </div>
            )}
          </div>
          <ol className="ins-batch-items">
            {last.items.map((item) => (
              <li key={item.id} className={`ins-batch-item is-${item.stage}`}>
                <div className="ins-batch-item-main">
                  <span className="ins-batch-item-title">{item.result?.appName ?? item.title}</span>
                  <span className="ins-batch-stage">
                    {['uploading', 'reviewing'].includes(item.stage) && <span className="ins-spinner" aria-hidden />}
                    {item.stage === 'done' && <CheckIcon size={12} />}
                    {STAGE_LABEL[item.stage]}
                  </span>
                </div>
                <div className="ins-batch-item-sub">
                  {item.note && <span>{item.note}</span>}
                  {item.result && <span>{item.result.screens} screens · {item.result.flows} flows</span>}
                  {/* Working time only — waits for a turn, for AI usage or for you are left out. */}
                  {item.model && <span>{item.model.includes('sonnet') ? 'Sonnet 5.5' : item.model.includes('opus') ? 'Opus 5.5' : item.model}</span>}
                  {item.usage && <span title={`${item.usage.reviews} review run(s)`}>AI {item.usage.tokens >= 1_000_000 ? `${(item.usage.tokens / 1_000_000).toFixed(1)}M` : `${Math.round(item.usage.tokens / 1000)}k`} tokens</span>}
                  {item.workMs !== undefined ? <span title="Time spent uploading and reviewing">{clockOf(item.workMs)}</span> : item.startedAt && <span>{minutes(item.startedAt, item.finishedAt)}</span>}
                </div>
                <div className="ins-batch-item-actions">
                  {item.appId && ['done', 'review-ready'].includes(item.stage) && (
                    <Link className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn" href={`/inspirations/app/${item.appId}`}>Open <ExternalIcon size={11} /></Link>
                  )}
                  {item.stage === 'review-ready' && item.appId && item.version && (
                    <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn" onClick={() => void navigator.clipboard.writeText(`Follow docs/review-motvin.md to review ${item.appId} ${last.settings.platform} ${item.version}`)}>
                      <CopyIcon size={11} /> Copy review request
                    </button>
                  )}
                  {item.stage === 'choose' && <span className="ins-muted">Open the Motvin agent to choose</span>}
                  {['needs-you', 'skipped'].includes(item.stage) && last.state !== 'done' && <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn" onClick={() => void control(last, 'retry', item.id)}><RetryIcon size={11} /> Retry</button>}
                  {item.stage === 'needs-you' && last.state === 'done' && <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn" onClick={() => void control(last, 'retry', item.id)}><RetryIcon size={11} /> Retry</button>}
                  {['uploading', 'choose', 'review-queued', 'reviewing'].includes(item.stage) && (
                    <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn is-stop" onClick={() => { if (window.confirm(`Stop ${item.result?.appName ?? item.title} now? It stops at once and the screens it added are taken out of the library again; Retry starts it over.`)) void control(last, 'stop-now', item.id); }}><StopIcon size={11} /> Stop</button>
                  )}
                  {item.stage === 'queued' && <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm ins-batch-rowbtn" onClick={() => void control(last, 'skip', item.id)}>Skip</button>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {started !== null && (
        <div className="ins-wizard-result is-ok">
          <span className="ins-wizard-result-icon"><CheckIcon size={18} /></span>
          <div>
            <p className="ins-wizard-result-title">Started {started} app{started === 1 ? '' : 's'}</p>
            <p className="ins-field-hint">Each one is uploaded, cleaned up, reviewed and checked by itself — follow it above. You can close this page.</p>
          </div>
          <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label="Dismiss" onClick={() => setStarted(null)}><CloseIcon size={14} /></button>
        </div>
      )}

      <Wizard
        steps={STEPS}
        current={step}
        onStep={(index) => {
          if (index < 0 || index >= STEPS.length) return;
          if (index > step && !rows.length) return;
          setStep(index);
        }}
        title={[
          'Which recordings do you want to add?',
          'Name each app',
          'How should they be added?',
          'Check and start',
        ][step]}
        description={[
          'Each recording becomes one app, or a new version of an app already in the library.',
          'The name is taken from the file; change it if you like, and add a logo. A logo in the records folder with the same name is picked up by itself.',
          'The usual choices are already set. Change only what you need.',
          'Nothing has started yet. After Start, each app is uploaded, cleaned up and reviewed by the agent on its own.',
        ][step]}
        canNext={step === 3 ? rows.length > 0 && !active && !allSkipped : rows.length > 0}
        busy={Boolean(starting)}
        nextLabel={starting ?? `Start ${rows.length} app${rows.length === 1 ? '' : 's'}`}
        onNext={() => void start()}
        footerNote={!rows.length ? 'Pick at least one recording.' : step === 3 && active ? 'A batch is running — start this one when it ends.' : step >= 2 && allSkipped ? 'These apps are all in the library already and would be skipped — in Settings, choose “Add as a new version”.' : `${rows.length} recording${rows.length === 1 ? '' : 's'} picked`}
      >
        {step === 0 && (
          <div className="ins-wizard-stack">
            <div className="ins-rec-bar">
              <div className="ins-segmented" role="radiogroup" aria-label="Platform">
                {([['ios', 'iOS'], ['webapp', 'Web App'], ['web', 'Web']] as const).map(([id, text]) => (
                  <button key={id} type="button" role="radio" aria-checked={settings.platform === id} className={`ins-segmented-item ${settings.platform === id ? 'is-active' : ''}`} onClick={() => set('platform', id)}>
                    {text}
                  </button>
                ))}
              </div>
              <span className="ins-rec-folder" title={records?.root}>
                <FolderIcon size={13} /> {records?.root ? records.root.split('/').slice(-2).join('/') : 'Records folder'}
              </span>
              <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => void chooseFolder()} disabled={choosing}>
                {choosing ? <><span className="ins-spinner" aria-hidden /> Choose in Finder…</> : 'Change folder'}
              </button>
            </div>

            <div className="ins-rec-tools">
              <label className="ins-app-search">
                <SearchIcon size={14} />
                <input value={recordSearch} onChange={(e) => setRecordSearch(e.target.value)} placeholder={`Search ${recordsForPlatform.length} recordings`} aria-label="Search recordings" />
              </label>
              <button
                type="button"
                className="ins-btn ins-btn--sm"
                disabled={!recordsForPlatform.some((video) => !appFor(video.name))}
                onClick={() => recordsForPlatform.filter((video) => !appFor(video.name) && !rows.some((row) => row.key === `r-${video.path}`)).forEach(toggleRecord)}
              >
                Select all new
              </button>
              {rows.length > 0 && (
                <button type="button" className="ins-btn ins-btn--ghost ins-btn--sm" onClick={() => setRows([])}>
                  Clear ({rows.length})
                </button>
              )}
            </div>

            <ul className="ins-rec-grid" role="listbox" aria-multiselectable aria-label="Recordings">
              <li>
                <button type="button" className="ins-rec ins-rec--add" onClick={() => videoInput.current?.click()}>
                  <span className="ins-rec-logo"><CloudUploadIcon size={18} /></span>
                  <span className="ins-rec-text">
                    <span className="ins-rec-name">Upload{rows.some((row) => row.video.kind === 'file') ? ` (${rows.filter((row) => row.video.kind === 'file').length})` : ''}</span>
                  </span>
                </button>
                <input ref={videoInput} type="file" accept="video/*,.mov,.mp4,.m4v" multiple hidden onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }} />
              </li>
              {recordsForPlatform
                .filter((video) => !recordSearch.trim() || video.name.toLowerCase().includes(recordSearch.trim().toLowerCase()))
                .map((video) => {
                  const picked = rows.some((row) => row.key === `r-${video.path}`);
                  const known = appFor(video.name);
                  const logo = known ? state.logos.find((name) => name.startsWith(`${known.id}.`)) : undefined;
                  const recordsLogo = records?.logos.find((entry) => entry.replace(/\.[^.]+$/, '').toLowerCase() === video.name.toLowerCase());
                  return (
                    <li key={video.path}>
                      <button type="button" role="option" aria-selected={picked} className={`ins-rec ${picked ? 'is-on' : ''}`} onClick={() => toggleRecord(video)}>
                        <span className="ins-rec-logo">
                          {logo ? <img src={inspirationsApi.mediaUrl(`/api/inspirations/logos/${logo}`) ?? undefined} alt="" /> : recordsLogo ? <RecordsLogo file={recordsLogo} /> : video.name.slice(0, 1)}
                        </span>
                        <span className="ins-rec-text">
                          <span className="ins-rec-name">{video.name}</span>
                          <span className="ins-rec-meta">
                            <span className={`ins-pill ${known ? '' : 'is-new'}`}>{known ? 'In library' : 'New'}</span>
                            {Math.round(video.sizeBytes / 1024 ** 2)} MB
                          </span>
                        </span>
                        <span className="ins-rec-check" aria-hidden>{picked && <CheckIcon size={12} />}</span>
                      </button>
                    </li>
                  );
                })}
            </ul>
            {!recordsForPlatform.length && (
              <p className="ins-muted">No {PLATFORM_LABEL[settings.platform]} recordings in this folder (looked in it and in {settings.platform === 'ios' ? 'iOS' : settings.platform === 'webapp' ? 'Web Apps' : 'Webs'}/).</p>
            )}
          </div>
        )}

        {step === 1 && (
          <ol className="ins-app-rows">
            {rows.map((row) => {
              const known = appFor(row.name.trim() || plainName(row.title));
              const pill = !known ? ['is-new', 'New app'] : settings.existing === 'skip' ? ['is-skip', 'In library — skipped'] : settings.existing === 'version' ? ['is-version', 'New version'] : ['is-replace', 'Replaces the app'];
              return (
                <li key={row.key} className="ins-app-row">
                  <label className={`ins-batch-logo-pick ${row.logo ? 'has-logo' : ''}`} title={row.logo ? (row.logo.kind === 'records' ? row.logo.file : row.logo.file.name) : 'Add a logo'}>
                    {row.logo?.kind === 'file' ? <LogoPreview file={row.logo.file} /> : row.logo ? <RecordsLogo file={row.logo.file} /> : 'Logo'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) update(row.key, { logo: { kind: 'file', file } }); event.target.value = ''; }} />
                  </label>
                  <span className="ins-app-text">
                    <input className="ins-input" value={row.name} placeholder="App name (read from the screens if empty)" onChange={(event) => update(row.key, { name: event.target.value })} aria-label="App name" />
                    <span className="ins-muted">{row.title} · {Math.round(row.sizeBytes / 1024 ** 2)} MB{row.logo ? ` · logo ${row.logo.kind === 'records' ? row.logo.file : row.logo.file.name}` : ''}</span>
                  </span>
                  <span className={`ins-pill ${pill[0]}`}>{pill[1]}</span>
                  <button type="button" className="ins-iconbtn ins-iconbtn--plain" aria-label={`Remove ${row.title}`} onClick={() => setRows((current) => current.filter((other) => other.key !== row.key))}><CloseIcon size={14} /></button>
                </li>
              );
            })}
          </ol>
        )}

        {step === 2 && (
          <div className="ins-wizard-stack">
            <Choice label="An app already in the library" value={settings.existing} onChange={(v) => set('existing', v)} options={[['skip', 'Skip it'], ['version', 'Add as a new version'], ['replace', 'Replace it']]} hint={settings.existing === 'replace' ? 'Replace removes the app and all its screens before uploading it again.' : settings.existing === 'version' ? 'Versions are by day: a version from the same day is replaced by the new upload.' : 'Apps already in the library are left as they are.'} />
            <Choice label="Notify me" value={settings.notify} onChange={(v) => set('notify', v)} options={[['each', 'Each app and the end'], ['summary', 'Only at the end'], ['off', 'Off']]} />
            <details className="ins-wizard-more">
              <summary><ChevronDownIcon size={14} /> More settings</summary>
              <Choice label="Version date" value={settings.version === null ? 'today' : 'date'} onChange={(v) => set('version', v === 'today' ? null : new Date().toISOString().slice(0, 10))} options={[['today', 'Today'], ['date', 'Choose a date']]} />
              {settings.version !== null && <input type="date" className="ins-input" value={settings.version} onChange={(event) => set('version', event.target.value || null)} aria-label="Version date" />}
              <Choice label="Clean up" value={settings.cleanup} onChange={(v) => set('cleanup', v)} options={[['automatic', 'Automatically'], ['manual', 'I’ll choose myself']]} hint={settings.cleanup === 'manual' ? 'Each app waits for your choice in the Motvin agent; the next one waits behind it.' : undefined} />
              <Choice label="Review" value={settings.review} onChange={(v) => set('review', v)} options={[['auto', 'By the agent'], ['manual', 'I’ll ask for it']]} hint={settings.review === 'auto' && !autoReview ? 'Auto review needs the Claude Code command-line tool on this computer. Until it is installed, each app ends ready for you to review.' : undefined} />
              {settings.review === 'auto' && (
                <Choice
                  label="Reviewer"
                  value={settings.reviewer}
                  onChange={(v) => set('reviewer', v)}
                  options={[['claude', 'Claude'], ['gemini', 'Gemini']]}
                  hint={settings.reviewer === 'gemini' ? (reviewers.gemini ? 'Reviews run with Google’s Gemini CLI (the Gemini models Antigravity uses). New — test it on one app before a big batch.' : 'Needs Google’s Gemini CLI on this computer: npm install -g @google/gemini-cli, then run gemini once to sign in. Until then, each app ends ready for you to review — copy the request into Antigravity.') : undefined}
                />
              )}
              <Choice label="Apps at the same time" value={String(settings.appsAtOnce) as '1' | '2' | '3' | '4'} onChange={(v) => set('appsAtOnce', Number(v) as 1 | 2 | 3 | 4)} options={[['1', '1'], ['2', '2'], ['3', '3'], ['4', '4']]} hint="More at once finishes sooner; the AI usage is the same in total. 3 suits most Macs." />
              <Choice label="After a clean review" value={settings.afterReview} onChange={(v) => set('afterReview', v)} options={[['cleanup', 'Clean up working files'], ['keep', 'Keep files for me to check']]} />
            </details>
          </div>
        )}

        {step === 3 && (
          <div className="ins-wizard-stack">
            <Summary
              rows={[
                ['Apps', rows.map((row) => row.name.trim() || plainName(row.title)).join(', ')],
                ['Platform', PLATFORM_LABEL[settings.platform]],
                ['New or existing', (() => {
                  const known = rows.filter((row) => appFor(row.name.trim() || plainName(row.title))).length;
                  const fresh = rows.length - known;
                  return [fresh ? `${fresh} new app${fresh === 1 ? '' : 's'}` : '', known ? `${known} already in the library — ${settings.existing === 'skip' ? 'skipped' : settings.existing === 'version' ? 'added as a new version' : 'replaced'}` : ''].filter(Boolean).join(' · ');
                })()],
                ['Version', settings.version ? dayLabel(settings.version) : 'Today'],
                ['Review', settings.review === 'auto' ? `By the agent (${settings.reviewer === 'gemini' ? 'Gemini' : 'Sonnet'}), then checked` : 'You ask for it when each app is in'],
                ['At the same time', `${settings.appsAtOnce} app${settings.appsAtOnce === 1 ? '' : 's'}`],
              ]}
            />
            {error && <p className="ins-admin-err">{error}</p>}
          </div>
        )}
      </Wizard>
    </div>
  );
}

/** A logo picked from this computer, shown as it will look. */
function LogoPreview({ file }: { file: File }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return <img src={url} alt="" />;
}

/** A logo from the records folder, read with the admin's sign-in. */
function RecordsLogo({ file }: { file: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    let made: string | null = null;
    void (async () => {
      const res = await fetch(`/api/crawler/batch/records?logo=${encodeURIComponent(file)}`, { headers: await authHeaders() });
      if (!res.ok || !live) return;
      made = URL.createObjectURL(await res.blob());
      setUrl(made);
    })().catch(() => undefined);
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [file]);
  return url ? <img src={url} alt="" /> : <CheckIcon size={14} />;
}
