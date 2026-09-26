'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useRef, useState, type DragEvent } from 'react';
import { adminApi } from '@/lib/inspirations/admin';
import { inspirationsApi, invalidateInspirationsCache } from '@/lib/inspirations/api';
import { fineTypeLabel, screenStateLabel } from '@/lib/inspirations/taxonomy';
import { getIdToken } from '@/lib/firebase/auth';
import type { IngestEvent, IngestResult, IngestScreen } from '@/app/api/crawler/ingest/route';
import { CheckIcon, ExternalIcon, UploadIcon } from '../Icons';
import { SCREEN_PARAM } from '../ScreenPreviewModal';

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
 * The run takes tens of seconds, so its stages stream back and are shown as
 * they happen rather than behind a spinner. Which app it is, what each screen
 * is called, its type and state, and the flows they form are all worked out
 * from the screens themselves. The only thing that cannot be: the app's logo,
 * which never appears in its own UI. So that is the one manual step, offered
 * after the screens land.
 */

const STAGES: { id: string; label: string }[] = [
  { id: 'upload', label: 'Uploading' },
  { id: 'extract', label: 'Reading frames' },
  { id: 'segment', label: 'Finding screens' },
  { id: 'classify', label: 'Naming and typing' },
  { id: 'identify', label: 'Identifying the app' },
  { id: 'flows', label: 'Grouping journeys' },
  { id: 'publish', label: 'Publishing' },
  { id: 'manifest', label: 'Rebuilding index' },
];

type Progress = {
  stage: string;
  message: string;
  done?: number;
  total?: number;
  frames?: number;
  screens?: number;
};

function extensionOf(file: File): string {
  const dot = file.name.lastIndexOf('.');
  return dot > 0 ? file.name.slice(dot + 1).toLowerCase() : 'mov';
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(0)} MB`;
}

function clock(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Reads a newline-delimited JSON response, calling `onEvent` for each line as
 * it arrives — which is what makes the stage list move while the CLI works.
 */
async function readEvents(res: Response, onEvent: (event: IngestEvent) => void) {
  if (!res.body) throw new Error('The server returned no progress stream.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf('\n');
    while (index !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) {
        try {
          onEvent(JSON.parse(line) as IngestEvent);
        } catch {
          // A partial or malformed line is skipped; the result line is what
          // decides the outcome.
        }
      }
      index = buffer.indexOf('\n');
    }
  }
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer.trim()) as IngestEvent);
    } catch {
      // As above.
    }
  }
}

export function VideoPanel({ busy, onIngested }: { busy: boolean; onIngested: () => Promise<void> | void }) {
  const [video, setVideo] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [working, setWorking] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<IngestResult | null>(null);
  const [logoState, setLogoState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [showLog, setShowLog] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const pick = (files: FileList | File[]) => {
    const found = Array.from(files).find(
      (file) => file.type.startsWith('video/') || /\.(mov|mp4|m4v|avi|mkv)$/i.test(file.name),
    );
    if (!found) {
      setError('That is not a video. Use a screen recording — .mov or .mp4.');
      return;
    }
    setError(null);
    setResult(null);
    setVideo(found);
  };

  const submit = async () => {
    if (!video) return;
    setWorking(true);
    setError(null);
    setResult(null);
    setLog([]);
    setLogoState('idle');
    setProgress({ stage: 'upload', message: `Uploading ${megabytes(video.size)}…` });

    try {
      const token = await getIdToken();
      if (!token) throw new Error('You are signed out. Sign in again to continue.');

      // The file name travels too: it is what the app is named after if nothing
      // can identify it from the screens.
      const query = new URLSearchParams({ ext: extensionOf(video), name: video.name });

      const res = await fetch(`/api/crawler/ingest?${query}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': video.type || 'video/quicktime' },
        body: video,
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(payload.message || `Request failed (${res.status})`);
      }

      let final: IngestResult | null = null;
      let failure: string | null = null;
      await readEvents(res, (event) => {
        if (event.type === 'progress') setProgress({ stage: event.stage, message: event.message, done: event.done, total: event.total, frames: event.frames, screens: event.screens });
        else if (event.type === 'log') setLog((lines) => [...lines.slice(-79), event.line]);
        else if (event.type === 'result') final = event.data;
        else if (event.type === 'error') failure = event.message;
      });

      if (failure) throw new Error(failure);
      if (!final) throw new Error('The run ended without a result.');

      setResult(final);
      setProgress(null);
      setVideo(null);
      // The gallery's own client cache would otherwise keep showing the
      // library as it was before this upload.
      invalidateInspirationsCache();
      await onIngested();
    } catch (err) {
      setError((err as Error).message);
      setProgress(null);
    } finally {
      setWorking(false);
    }
  };

  const uploadLogo = async (file: File) => {
    if (!result) return;
    setLogoState('saving');
    try {
      await adminApi.uploadLogo(result.app.id, file.name, file);
      setLogoState('done');
      await onIngested();
    } catch (err) {
      setError((err as Error).message);
      setLogoState('idle');
    }
  };

  const stageIndex = progress ? STAGES.findIndex((s) => s.id === progress.stage) : -1;
  const classifyFraction =
    progress?.stage === 'classify' && progress.total ? Math.min(1, ((progress.done ?? 0) + 1) / progress.total) : null;

  return (
    <div className="ins-admin-panel">
      <p className="ins-field-hint">
        Record yourself using the app on a real device, then drop the video here. Walk at a normal
        pace and pause a moment on each screen. The recording is read as a timeline: every screen
        that held still is kept — splash, prompts, empty states, sheets and toasts included —
        repeats are folded into one, and pages still loading and Google or Apple sign-in pages are
        left out.
        Which app it is, what each screen is called and the journeys they form are worked out from
        the screens themselves.
      </p>

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
        <button type="button" className="ins-btn" onClick={() => inputRef.current?.click()} disabled={working}>
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
        <button
          type="button"
          className="ins-btn ins-btn--primary"
          disabled={!video || working || busy}
          onClick={() => void submit()}
        >
          {working ? <span className="ins-spinner" /> : <UploadIcon size={15} />}
          {working ? 'Finding screens…' : 'Find screens in this video'}
        </button>
        {working && <span className="ins-muted">Keep the tab open. A three-minute recording takes about a minute.</span>}
      </div>

      {progress && (
        <div className="ins-ingest" role="status" aria-live="polite">
          <ol className="ins-ingest-steps">
            {STAGES.map((stage, index) => {
              const state = index < stageIndex ? 'is-done' : index === stageIndex ? 'is-active' : '';
              return (
                <li key={stage.id} className={`ins-ingest-step ${state}`}>
                  {state === 'is-done' ? <CheckIcon size={12} /> : <span className="ins-ingest-step-dot" aria-hidden />}
                  {stage.label}
                </li>
              );
            })}
          </ol>
          <div className={`ins-ingest-bar ${classifyFraction === null ? 'is-indeterminate' : ''}`}>
            <span style={{ width: classifyFraction === null ? '30%' : `${Math.round(classifyFraction * 100)}%` }} />
          </div>
          <div className="ins-ingest-message">
            <span>{progress.message}</span>
            <button type="button" className="ins-linkbtn" onClick={() => setShowLog((v) => !v)}>
              {showLog ? 'Hide detail' : 'Show detail'}
            </button>
          </div>
          {showLog && log.length > 0 && <pre className="ins-ingest-log">{log.join('\n')}</pre>}
        </div>
      )}

      {error && <p className="ins-admin-err">{error}</p>}

      {result && <IngestSummary result={result} logoState={logoState} onPickLogo={() => logoRef.current?.click()} />}

      {result && (
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
 * What landed, read the way the gallery will show it: each journey as a strip
 * of screens in walk order, with the name, type and state the pipeline gave
 * every one. Anything left out is listed by name and reason, so nothing
 * disappears silently.
 */
function IngestSummary({
  result,
  logoState,
  onPickLogo,
}: {
  result: IngestResult;
  logoState: 'idle' | 'saving' | 'done';
  onPickLogo: () => void;
}) {
  const byId = new Map(result.screens.map((screen) => [screen.screenId, screen]));
  const dropped = result.timeline?.dropped;
  const appHref = `/inspirations/app/${encodeURIComponent(result.app.id)}`;

  return (
    <div className="ins-ingest">
      <p className="ins-admin-form-title">
        <CheckIcon size={14} /> {result.app.name} — {result.ingested} screen{result.ingested === 1 ? '' : 's'} in{' '}
        {result.flows.length} flow{result.flows.length === 1 ? '' : 's'}
        {' · '}
        <Link href={appHref} className="ins-link">
          Open in the gallery <ExternalIcon size={12} />
        </Link>
      </p>

      <div className="ins-ingest-summary">
        {result.capture && (
          <span>
            <strong>{result.capture.frames}</strong> frames read over {clock(result.capture.durationSeconds)}
          </span>
        )}
        <span>
          <strong>{result.duplicates}</strong> repeat{result.duplicates === 1 ? '' : 's'} folded in
        </span>
        {dropped && dropped.transitions > 0 && (
          <span>
            <strong>{dropped.transitions}</strong> transition frame{dropped.transitions === 1 ? '' : 's'} set aside
          </span>
        )}
        {dropped && dropped.scrims > 0 && (
          <span>
            <strong>{dropped.scrims}</strong> system prompt{dropped.scrims === 1 ? '' : 's'} iOS did not record
          </span>
        )}
        {result.excluded.length > 0 && (
          <span>
            <strong>{result.excluded.length}</strong> screen{result.excluded.length === 1 ? '' : 's'} left out
          </span>
        )}
      </div>

      {result.identified && !result.identified.confident && (
        <p className="ins-admin-note">
          {result.identified.detected
            ? `“${result.app.name}” was read off the app\u2019s own screens${result.identified.evidence ? ` (“${result.identified.evidence}”)` : ''}. `
            : `The app is named after the recording. `}
          Rename it under <strong>Apps</strong> if it is wrong — that also renames its folder.
        </p>
      )}

      {!result.classified && (
        <p className="ins-admin-note">
          Names, types, states and journeys came from on-device text recognition and the recording&rsquo;s
          own timeline. Set <code>ANTHROPIC_API_KEY</code> in <code>.env.local</code> for model-written
          descriptions and journey names.
        </p>
      )}

      {result.flows.length > 0 ? (
        result.flows.map((flow) => (
          <section key={flow.id} className="ins-ingest-flow">
            <p className="ins-ingest-flow-title">
              {flow.name}
              <span className="ins-muted">
                · {flow.screenIds.length} screen{flow.screenIds.length === 1 ? '' : 's'} · {flow.category}
              </span>
            </p>
            <div className="ins-ingest-strip">
              {flow.screenIds.map((screenId, index) => {
                const screen = byId.get(screenId);
                return screen ? <IngestShot key={screenId} screen={screen} index={index} /> : null;
              })}
            </div>
          </section>
        ))
      ) : (
        <div className="ins-ingest-strip">
          {result.screens.map((screen, index) => (
            <IngestShot key={screen.screenId} screen={screen} index={index} />
          ))}
        </div>
      )}

      {result.excluded.length > 0 && (
        <div className="ins-ingest-excluded">
          <strong>Left out of the library</strong>
          {result.excluded.map((entry) => (
            <span key={`${entry.file}-${entry.name}`}>
              {entry.name} — {entry.reason}
            </span>
          ))}
        </div>
      )}

      {/* A logo never appears inside an app's own screens, so it is the one
          thing the pipeline cannot work out for itself. */}
      <div className="ins-admin-actions">
        {logoState === 'done' ? (
          <span className="ins-admin-ok">
            <CheckIcon size={13} /> Logo saved
          </span>
        ) : (
          <button type="button" className="ins-btn" disabled={logoState === 'saving'} onClick={onPickLogo}>
            {logoState === 'saving' ? <span className="ins-spinner" /> : <UploadIcon size={15} />}
            Add {result.app.name}&rsquo;s logo
          </button>
        )}
        <span className="ins-muted">Optional. PNG, SVG or WebP.</span>
      </div>
    </div>
  );
}

function IngestShot({ screen, index }: { screen: IngestScreen; index: number }) {
  const src = inspirationsApi.mediaUrl(screen.url);
  const states = screen.states.filter((v) => v !== 'keyboard');
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const screenHref = (() => {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(SCREEN_PARAM, screen.screenId);
    return `${pathname}?${sp.toString()}`;
  })();
  return (
    <Link href={screenHref} scroll={false} className="ins-ingest-shot" title={screen.name}>
      <span className="ins-ingest-shot-img">
        {src && <img src={src} alt="" loading="lazy" />}
        <span className="ins-ingest-shot-num">{index + 1}</span>
        {states.length > 0 && (
          <span className="ins-card-states">
            {states.slice(0, 1).map((v) => (
              <span key={v} className={`ins-state-badge is-${v}`}>{screenStateLabel(v)}</span>
            ))}
          </span>
        )}
      </span>
      <span className="ins-ingest-shot-name">{screen.name}</span>
      <span className="ins-ingest-shot-sub">
        {fineTypeLabel(screen.screenType)}
        {screen.atSeconds !== null && ` · ${clock(screen.atSeconds)}`}
        {screen.brief && ' · brief'}
      </span>
    </Link>
  );
}
