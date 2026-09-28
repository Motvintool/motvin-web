'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/shared/AuthProvider';
import { isAdminEmail } from '@/lib/inspirations/admin';
import { invalidateInspirationsCache } from '@/lib/inspirations/api';
import {
  INGEST_STAGES,
  aiLabel,
  clock,
  dismissIngestJob,
  isActive,
  stageIndex,
  useAiStatus,
  useDockSuppressed,
  useIngestJobs,
  type IngestJob,
} from '@/lib/inspirations/ingestJobs';
import { CheckIcon, ChevronDownIcon, CloseIcon, ExternalIcon, MinusIcon, SparklesIcon } from '../Icons';
import { tone } from './AiPicker';

/**
 * The assistant in the corner.
 *
 * A video run takes minutes and the library owner has other things to do in
 * the meantime — check a flow, rename an app. This card follows them to every
 * page of Inspirations and reads like a chat: their request at the top
 * ("Find screens in Swiggy.MP4"), the assistant's reply beneath it, updating
 * live — the step it is on, a progress bar, "AI is writing the flow content —
 * screens 13–18 of 64" with a typing indicator — and finally what landed,
 * with a link into the gallery. It folds down to a pill, and it is gone when
 * the runs are dismissed.
 *
 * The run itself lives on the server (lib/server/ingestJobs.ts); this only
 * shows it. Reload the page, open another tab, come back later: same card,
 * same place in the run.
 */

const COLLAPSED_KEY = 'motvin:ingest-dock:collapsed';

export function IngestDock() {
  const { user, ready } = useAuth();
  const admin = ready && Boolean(user && !user.isAnonymous && isAdminEmail(user.email));
  const { jobs } = useIngestJobs(admin);
  const { status: ai, loading: aiLoading } = useAiStatus(admin);
  const suppressed = useDockSuppressed();
  // Read once, on the client only. The dock renders nothing until the auth
  // state is known, which is after hydration, so the server never disagrees.
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      // Private mode or blocked storage: the dock simply starts open.
      return false;
    }
  });
  const [now, setNow] = useState(() => Date.now());

  const visible = jobs.filter((job) => !job.dismissed).slice(0, 3);
  const running = visible.some(isActive);

  // The elapsed time ticks once a second while a run is on.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // The gallery's own cache would otherwise keep showing the library as it
  // was before a run that finished while another page was open.
  const doneIds = visible.filter((job) => job.status === 'done').map((job) => job.id).join(',');
  useEffect(() => {
    if (doneIds) invalidateInspirationsCache();
  }, [doneIds]);

  if (!admin || !visible.length || suppressed) return null;

  const toggle = () => {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, value ? '0' : '1');
      } catch {
        // As above.
      }
      return !value;
    });
  };

  const latest = visible[0];

  if (collapsed) {
    return (
      <button type="button" className={`ins-dock-pill is-${latest.status}`} onClick={toggle} aria-label="Show the assistant">
        {isActive(latest) ? <span className="ins-spinner" /> : latest.status === 'done' ? <CheckIcon size={14} /> : <CloseIcon size={14} />}
        <span className="ins-dock-pill-text">{pillText(latest)}</span>
        <ChevronDownIcon size={14} className="ins-dock-pill-chevron" />
      </button>
    );
  }

  return (
    <aside className="ins-dock" role="status" aria-live="polite" aria-label="Video ingest assistant">
      <header className="ins-dock-head">
        <span className="ins-dock-avatar" aria-hidden>
          <SparklesIcon size={16} />
        </span>
        <div className="ins-dock-title">
          <strong>Motvin assistant</strong>
          <span className={`ins-dock-ai is-${tone(ai, aiLoading)}`}>
            <span className="ins-ai-dot" aria-hidden />
            {aiLabel(ai)}
            {ai?.usable && ai.connected ? ' · connected' : ai && ai.enabled && !ai.usable ? ' · not connected' : ''}
          </span>
        </div>
        <button type="button" className="ins-iconbtn ins-iconbtn--plain" onClick={toggle} aria-label="Minimise">
          <MinusIcon size={15} />
        </button>
      </header>
      <div className="ins-dock-body">
        {visible.map((job) => (
          <JobThread key={job.id} job={job} now={now} />
        ))}
      </div>
    </aside>
  );
}

function pillText(job: IngestJob): string {
  if (job.status === 'uploading') return `Uploading ${Math.round((job.uploaded ?? 0) * 100)}%`;
  if (job.status === 'running') return job.stage === 'research' ? 'AI writing content…' : INGEST_STAGES[stageIndex(job.stage)]?.label ?? 'Working…';
  if (job.status === 'done') return job.result ? `${job.result.app.name} is ready` : 'Done';
  return 'Run failed';
}

function fraction(job: IngestJob): number | null {
  if (job.status === 'uploading') return job.uploaded;
  if ((job.stage === 'classify' || job.stage === 'research') && job.total) return Math.min(1, (job.done ?? 0) / job.total);
  return null;
}

/** One request and its reply, the way a chat shows them. */
export function JobThread({ job, now }: { job: IngestJob; now: number }) {
  const started = Date.parse(job.startedAt);
  const ended = job.finishedAt ? Date.parse(job.finishedAt) : now;
  const elapsed = clock((ended - started) / 1000);
  const active = isActive(job);
  const current = stageIndex(job.stage);
  const bar = fraction(job);
  const app = job.result?.app ?? job.interim?.app ?? null;
  const appHref = app?.id ? `/inspirations/app/${encodeURIComponent(app.id)}` : null;

  return (
    <div className="ins-chat">
      <div className="ins-chat-msg ins-chat-msg--user">
        <span>Find screens in “{job.title}”</span>
        {job.sizeBytes !== null && <span className="ins-chat-meta">{(job.sizeBytes / 1024 / 1024).toFixed(0)} MB</span>}
      </div>

      <div className={`ins-chat-msg ins-chat-msg--assistant is-${job.status}`}>
        {active && (
          <>
            <ol className="ins-chat-steps">
              {INGEST_STAGES.map((stage, index) => {
                const state = job.status === 'uploading' ? (index === 0 ? 'is-active' : '') : index < current ? 'is-done' : index === current ? 'is-active' : '';
                if (!state && index > current + 1) return null;
                return (
                  <li key={stage.id} className={`ins-chat-step ${state}`}>
                    <span className="ins-chat-step-mark" aria-hidden>
                      {state === 'is-done' ? <CheckIcon size={11} /> : state === 'is-active' ? <span className="ins-spinner" /> : <span className="ins-chat-step-dot" />}
                    </span>
                    {stage.label}
                  </li>
                );
              })}
            </ol>
            <p className="ins-chat-line">
              <span className="ins-typing" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              {job.message}
            </p>
            <div className={`ins-ingest-bar ${bar === null ? 'is-indeterminate' : ''}`}>
              <span style={{ width: bar === null ? '30%' : `${Math.round(bar * 100)}%` }} />
            </div>
            {job.interim && appHref && (
              <p className="ins-chat-line ins-chat-line--soft">
                {job.interim.screens?.length ?? 0} screens are already live in the library.{' '}
                <Link href={appHref} className="ins-link">
                  Open {app?.name} <ExternalIcon size={11} />
                </Link>
              </p>
            )}
          </>
        )}

        {job.status === 'done' && job.result && (
          <>
            <p className="ins-chat-line">
              <CheckIcon size={13} className="ins-chat-ok" />
              Done. <strong>{job.result.app.name}</strong> — {job.result.ingested} screen{job.result.ingested === 1 ? '' : 's'} in {job.result.flows.length} flow
              {job.result.flows.length === 1 ? '' : 's'}.
            </p>
            {job.result.researched && (job.result.researched.flows > 0 || job.result.researched.screens > 0) && (
              <p className="ins-chat-line ins-chat-line--soft">
                The AI wrote {job.result.researched.flows} flow name{job.result.researched.flows === 1 ? '' : 's'} and described {job.result.researched.screens} screen
                {job.result.researched.screens === 1 ? '' : 's'}.
              </p>
            )}
            {job.result.excluded.length > 0 && (
              <p className="ins-chat-line ins-chat-line--soft">
                {job.result.excluded.length} screen{job.result.excluded.length === 1 ? '' : 's'} left out (loading states, third-party sign-in).
              </p>
            )}
          </>
        )}

        {job.status === 'failed' && (
          <p className="ins-chat-line is-error">
            <CloseIcon size={13} />
            {job.error ?? 'The run failed.'}
          </p>
        )}

        <div className="ins-chat-foot">
          <span className="ins-chat-meta">
            {active ? `${elapsed} elapsed` : `took ${elapsed}`}
            {job.analyzer && active ? ` · ${job.analyzer.replace(/^free AI — /, '')}` : ''}
          </span>
          {!active && appHref && (
            <Link href={appHref} className="ins-linkbtn">
              Open in gallery
            </Link>
          )}
          {!active && (
            <button type="button" className="ins-linkbtn" onClick={() => void dismissIngestJob(job.id)}>
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
