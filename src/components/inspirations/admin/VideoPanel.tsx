'use client';

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { adminApi } from '@/lib/inspirations/admin';
import { invalidateInspirationsCache } from '@/lib/inspirations/api';
import {
  INGEST_STAGES,
  clock,
  dismissIngestJob,
  isActive,
  megabytes,
  PLATFORM_CHOICES,
  stageIndex,
  startIngest,
  useIngestJobs,
  type IngestJob,
} from '@/lib/inspirations/ingestJobs';
import { CheckIcon, CloseIcon, UploadIcon } from '../Icons';
import { AiPicker } from './AiPicker';
import { IngestSummary, interimResult } from './IngestSummary';

/**
 * Turn a screen recording into screens. One action, no form.
 *
 * Walking an app with the recorder on captures everything, including the
 * screens nobody would think to screenshot — a splash, a permission prompt, a
 * page mid-load, a toast, an empty state. Most frames are still worthless,
 * caught mid-animation or mid-scroll. The server reads the recording as a
 * timeline: it keeps a frame wherever the UI held still, works out what each
 * moment was in relation to its neighbours (a sheet over a screen, a screen
 * still loading, a return to somewhere already seen), skips third-party
 * sign-in pages, and files the rest as journeys in the order they were walked.
 *
 * The run belongs to the server, not to this page: it is started here and
 * then read from the shared job list, so its stages keep moving whether this
 * tab is open or the person has gone to look at something else (the dock in
 * the corner shows it there). Which app it is, what each screen is called,
 * its type and state, and the flows they form are all worked out from the
 * screens themselves — and, when a free AI is connected, the model writes
 * the flow content once the screens are already live. The only thing that
 * cannot be worked out is the app's logo, which never appears in its own UI.
 * So that is the one manual step, offered after the screens land.
 */

export function VideoPanel({ busy, onIngested }: { busy: boolean; onIngested: () => Promise<void> | void }) {
  const { user } = useAuth();
  const admin = Boolean(user && !user.isAnonymous);
  const { jobs, error: listError } = useIngestJobs(admin);

  const [video, setVideo] = useState<File | null>(null);
  const [platform, setPlatform] = useState<'ios' | 'android' | 'web'>('ios');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoState, setLogoState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [showLog, setShowLog] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const latest = jobs.find((job) => !job.dismissed) ?? null;
  const running = jobs.some(isActive);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // When a run finishes, the rest of the admin (counts, Screens, Flows) is
  // reloaded so it shows what the run wrote.
  const finishedId = latest && latest.status === 'done' ? latest.id : null;
  const seenRef = useRef<string | null>(null);
  useEffect(() => {
    if (!finishedId || seenRef.current === finishedId) return;
    seenRef.current = finishedId;
    invalidateInspirationsCache();
    void onIngested();
  }, [finishedId, onIngested]);

  const pick = (files: FileList | File[]) => {
    const found = Array.from(files).find(
      (file) => file.type.startsWith('video/') || /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name),
    );
    if (!found) {
      setError('That is not a video. Use a screen recording — .mov or .mp4.');
      return;
    }
    setError(null);
    setVideo(found);
  };

  const submit = async () => {
    if (!video || !user) return;
    setError(null);
    setLogoState('idle');
    try {
      await startIngest(video, user.email, { platform });
      setVideo(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const uploadLogo = async (file: File) => {
    const app = latest?.result?.app ?? latest?.interim?.app;
    if (!app?.id) return;
    setLogoState('saving');
    try {
      await adminApi.uploadLogo(app.id, file.name, file);
      setLogoState('done');
      await onIngested();
    } catch (err) {
      setError((err as Error).message);
      setLogoState('idle');
    }
  };

  const shown = latest ? latest.result ?? (latest.interim ? interimResult(latest.interim) : null) : null;

  return (
    <div className="ins-admin-panel">
      <div className="ins-admin-toolbar">
        <p className="ins-field-hint">
          Record yourself using the app on a real device, then drop the video here. Walk at a normal
          pace and pause a moment on each screen. Every screen that held still is kept — splash, prompts,
          empty states, sheets and toasts included — repeats are folded into one, and pages still loading and
          Google or Apple sign-in pages are left out. The app, the screen names and the journeys are worked
          out from the screens themselves; the AI chosen here then writes the flow content.
        </p>
        <AiPicker admin={admin} align="right" />
      </div>

      <div
        className={`ins-dropzone ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(e: DragEvent) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e: DragEvent) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files?.length) pick(e.dataTransfer.files);
        }}
      >
        <UploadIcon size={22} className="ins-dropzone-icon" />
        <div className="ins-dropzone-text">
          <p className="ins-dropzone-title">{video ? video.name : 'Drop a screen recording here'}</p>
          <p className="ins-dropzone-desc">
            {video ? megabytes(video.size) : 'MOV or MP4, straight from the iPhone recorder.'}
          </p>
        </div>
        <button type="button" className="ins-btn" onClick={() => inputRef.current?.click()} disabled={running}>
          {video ? 'Choose a different video' : 'Choose a video'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="video/*,.mov,.mp4,.m4v"
          hidden
          onChange={(e) => {
            if (e.target.files?.length) pick(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="ins-admin-actions">
        <div className="ins-segmented" role="radiogroup" aria-label="Platform">
          {PLATFORM_CHOICES.map((choice) => (
            <button
              key={choice.id}
              type="button"
              role="radio"
              aria-checked={platform === choice.id}
              className={`ins-segmented-item ${platform === choice.id ? 'is-active' : ''}`}
              onClick={() => setPlatform(choice.id)}
              disabled={running}
            >
              {choice.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ins-btn ins-btn--primary"
          disabled={!video || running || busy}
          onClick={() => void submit()}
        >
          {running ? <span className="ins-spinner" /> : <UploadIcon size={15} />}
          {running ? 'A run is in progress…' : 'Find screens in this video'}
        </button>
        {running && (
          <span className="ins-muted">
            You can leave this page — the run continues on the server and the assistant in the corner follows it.
          </span>
        )}
      </div>

      {(error || listError) && <p className="ins-admin-err">{error ?? listError}</p>}

      {latest && (
        <RunCard job={latest} now={now} showLog={showLog} onToggleLog={() => setShowLog((value) => !value)} />
      )}

      {shown && (
        <IngestSummary result={shown} writing={latest?.status === 'running'} logoState={logoState} onPickLogo={() => logoRef.current?.click()} />
      )}

      {shown && (
        <input
          ref={logoRef}
          type="file"
          accept="image/*,.svg"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void uploadLogo(file);
          }}
        />
      )}
    </div>
  );
}

/**
 * The run as a live card: the stage chips, a progress bar, the message the
 * crawler is printing right now, and the log behind a toggle. Reads the same
 * job the dock reads, so the two never disagree.
 */
function RunCard({ job, now, showLog, onToggleLog }: { job: IngestJob; now: number; showLog: boolean; onToggleLog: () => void }) {
  const active = isActive(job);
  const current = job.status === 'uploading' ? 0 : stageIndex(job.stage);
  const bar =
    job.status === 'uploading'
      ? job.uploaded
      : (job.stage === 'classify' || job.stage === 'research') && job.total
        ? Math.min(1, (job.done ?? 0) / job.total)
        : null;
  const started = Date.parse(job.startedAt);
  const ended = job.finishedAt ? Date.parse(job.finishedAt) : now;
  const elapsed = clock((ended - started) / 1000);

  if (!active && job.status === 'done') {
    return (
      <div className="ins-ingest ins-ingest--quiet" role="status">
        <div className="ins-ingest-message">
          <span>
            <CheckIcon size={13} className="ins-chat-ok" /> “{job.title}” finished in {elapsed}
            {job.analyzer ? ` · ${job.analyzer.replace(/^free AI — /, '')}` : ''}
          </span>
          <span className="ins-admin-actions ins-admin-actions--tight">
            <button type="button" className="ins-linkbtn" onClick={onToggleLog}>
              {showLog ? 'Hide detail' : 'Show detail'}
            </button>
            <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(job.id)}>
              Dismiss
            </button>
          </span>
        </div>
        {showLog && job.log.length > 0 && <pre className="ins-ingest-log">{job.log.join('\n')}</pre>}
      </div>
    );
  }

  return (
    <div className="ins-ingest" role="status" aria-live="polite">
      <ol className="ins-ingest-steps">
        {INGEST_STAGES.map((stage, index) => {
          const state = index < current ? 'is-done' : index === current && active ? 'is-active' : job.status === 'failed' && index === current ? 'is-failed' : '';
          return (
            <li key={stage.id} className={`ins-ingest-step ${state}`}>
              {state === 'is-done' ? <CheckIcon size={12} /> : state === 'is-failed' ? <CloseIcon size={12} /> : <span className="ins-ingest-step-dot" aria-hidden />}
              {stage.label}
            </li>
          );
        })}
      </ol>
      {active && (
        <div className={`ins-ingest-bar ${bar === null ? 'is-indeterminate' : ''}`}>
          <span style={{ width: bar === null ? '30%' : `${Math.round(bar * 100)}%` }} />
        </div>
      )}
      <div className="ins-ingest-message">
        <span className={job.status === 'failed' ? 'ins-admin-err' : ''}>
          {active && (
            <span className="ins-typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          )}
          {job.status === 'failed' ? job.error ?? 'The run failed.' : job.message}
          <span className="ins-muted"> · {elapsed}</span>
        </span>
        <span className="ins-admin-actions ins-admin-actions--tight">
          <button type="button" className="ins-linkbtn" onClick={onToggleLog}>
            {showLog ? 'Hide detail' : 'Show detail'}
          </button>
          {!active && (
            <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(job.id)}>
              Dismiss
            </button>
          )}
        </span>
      </div>
      {showLog && job.log.length > 0 && <pre className="ins-ingest-log">{job.log.join('\n')}</pre>}
      {job.stage === 'research' && job.interim && (
        <p className="ins-field-hint">
          The screens below are live already. Their names update as the AI finishes each batch; you can leave this
          page and they will still land.
        </p>
      )}
    </div>
  );
}
