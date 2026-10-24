'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { authHeaders, clock, type IngestResult, type IngestScreen } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { fineTypeLabel, screenStateLabel } from '@/lib/inspirations/taxonomy';
import { screenTitle } from '@/lib/inspirations/screenNaming';
import { CheckIcon, ExternalIcon, UploadIcon } from '../Icons';
import { SCREEN_PARAM } from '../ScreenPreviewModal';
import { useToast } from '../Toast';

/**
 * What a run published, read the way the gallery will show it: each journey
 * as a strip of screens in walk order, with the name, type and state the
 * pipeline gave every one. Anything left out is listed by name and reason,
 * so nothing disappears silently.
 */

/**
 * Claude's review of this upload. The button copies the one line to paste
 * into Claude (or any AI tool) — it names docs/review-motvin.md, which checks every screen from
 * the review package and applies its corrections; once it has, this shows
 * "Reviewed by Claude" with the number of fixes.
 */
/** The steps a review goes through, as docs/review-motvin.md numbers them for `crawl.js review-progress`. */
const REVIEW_STEPS = [
  'Read the review steps',
  'Build the review package',
  'Pick screens and best pictures',
  'Check names, types and elements',
  'Check flows, patterns and app info',
  'Apply the corrections',
  'Final check',
];

export function ClaudeReview({ appId, appName, platform, version }: { appId: string; appName?: string; platform: string; version: string }) {
  const { show } = useToast();
  const seenUnreviewed = useRef(false);
  const [status, setStatus] = useState<{ reviewed: boolean; reviewing?: boolean; startedAt?: string | null; step?: number; fixes?: number; problems?: string[]; hasBackup?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  // Names the steps file, so any AI tool opens it from the message alone.
  const request = `Follow docs/review-motvin.md to review ${appId} ${platform} ${version}`;
  useEffect(() => {
    let live = true;
    const check = async () => {
      try {
        const res = await fetch(`/api/crawler/review-status?${new URLSearchParams({ app: appId, platform, version })}`, { headers: await authHeaders(), cache: 'no-store' });
        if (!res.ok || !live) return;
        const next = (await res.json()) as { reviewed: boolean; reviewing?: boolean; startedAt?: string | null; step?: number; fixes?: number; problems?: string[]; hasBackup?: boolean };
        // The review just finished: say so, even if the admin is looking elsewhere.
        if (next.reviewed && seenUnreviewed.current) {
          seenUnreviewed.current = false;
          show(`The agent finished reviewing ${appName ?? appId} — check it now.`);
        }
        if (!next.reviewed) seenUnreviewed.current = true;
        setStatus(next);
      } catch {
        // The button still works without the status.
      }
    };
    void check();
    // Claude's review lands while this stays open: looked for every ten seconds.
    const timer = window.setInterval(() => void check(), 10_000);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [appId, appName, platform, version, show]);
  const [removing, setRemoving] = useState(false);
  const removeBackup = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/crawler/review-status?${new URLSearchParams({ app: appId, platform, version })}`, { method: 'DELETE', headers: await authHeaders(), cache: 'no-store' });
      if (res.ok) setStatus((current) => (current ? { ...current, hasBackup: false } : current));
    } finally {
      setRemoving(false);
    }
  };
  // A live clock while the review runs, ticking each second like the upload's.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!status?.reviewing) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(tick);
  }, [status?.reviewing]);
  const left = status?.problems ?? [];
  // Where this upload is: uploaded, Claude's review, then the admin's check and clean-up.
  const stage = status?.reviewed && !left.length ? (status.hasBackup ? 2 : 3) : 1;
  const steps = (
    <ol className="ins-review-steps" aria-label="Progress">
      {['Uploaded', 'Review', 'Check & clean up'].map((label, i) => (
        <li key={label} className={i < stage ? 'is-done' : i === stage ? 'is-current' : ''}>
          {i < stage ? <CheckIcon size={12} /> : <span className="ins-review-steps-dot" aria-hidden />} {label}
        </li>
      ))}
    </ol>
  );
  if (status?.reviewing) {
    const seconds = status.startedAt ? Math.max(0, Math.floor((now - Date.parse(status.startedAt)) / 1000)) : null;
    const clock = seconds === null ? null : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    return (
      <div className="ins-review-card">
        {steps}
        <p className="ins-review-card-title">
          <span className="ins-review-card-spinner" aria-hidden /> Agent is reviewing…
        </p>
        <p className="ins-review-card-text">
          {clock === null ? 'Started just now.' : `Reviewing for ${clock}`}
        </p>
        {/* The review's own steps, ticked off as it reports them (crawl.js review-progress). */}
        <ol className="ins-review-progress">
          {REVIEW_STEPS.map((label, i) => {
            const at = status.step ?? 3;
            const state = i + 1 < at ? 'is-done' : i + 1 === at ? 'is-current' : '';
            return (
              <li key={label} className={state}>
                {state === 'is-done' ? <CheckIcon size={13} /> : state === 'is-current' ? <span className="ins-review-card-spinner" aria-hidden /> : <span className="ins-review-progress-dot" aria-hidden />}
                {label}
              </li>
            );
          })}
        </ol>
      </div>
    );
  }
  if (status?.reviewed && !left.length) {
    return (
      <div className="ins-review-card is-done">
        {steps}
        <p className="ins-review-card-title">
          <CheckIcon size={14} /> Reviewed by agent
        </p>
        <p className="ins-review-card-text">
          {status.fixes ?? 0} fix{status.fixes === 1 ? '' : 'es'} applied — nothing left to fix.
        </p>
        {/* The screens as they were before the review are kept so it can be undone; once the admin is happy, they go. */}
        {status.hasBackup && (
          <>
            <p className="ins-review-card-hint">Happy with the review? Its working folder and backup are no longer needed.</p>
            <button type="button" className="ins-chip-btn ins-review-card-btn" disabled={removing} onClick={() => void removeBackup()}>
              {removing ? 'Removing…' : 'Looks good — clean up'}
            </button>
          </>
        )}
      </div>
    );
  }
  // Next step: the review. The check's findings are folded away — the count says enough.
  return (
    <div className="ins-review-card">
      {steps}
      <p className="ins-review-card-title">{status?.reviewed ? 'Almost done' : 'Next: review'}</p>
      <p className="ins-review-card-text">
        {status?.reviewed
          ? `${left.length} thing${left.length === 1 ? '' : 's'} still to fix. Ask the agent to review again.`
          : left.length
            ? `${left.length} thing${left.length === 1 ? '' : 's'} to fix — names, types and flows. The agent checks every screen and fixes them.`
            : 'The agent checks every screen and fixes names, types and flows.'}
      </p>
      <button
        type="button"
        className="ins-chip-btn ins-chip-btn--primary ins-review-card-btn"
        onClick={() => {
          void navigator.clipboard.writeText(request).then(() => setCopied(true), () => setCopied(false));
        }}
      >
        {copied ? <><CheckIcon size={13} /> Copied</> : status?.reviewed ? 'Ask agent to review again' : 'Ask agent to review'}
      </button>
      <p className="ins-review-card-hint">
        {copied ? 'Now paste it into your AI chat and send.' : 'Copies one line to paste into your AI chat.'}
      </p>
      {left.length > 0 && (
        <details className="ins-review-card-details">
          <summary>Show what to fix</summary>
          <ul>{left.slice(0, 30).map((problem) => <li key={problem}>{problem}</li>)}</ul>
          {left.length > 30 && <p className="ins-review-card-hint">…and {left.length - 30} more.</p>}
        </details>
      )}
    </div>
  );
}

/**
 * The published screens arrive before the AI has written their content; the
 * missing counts are filled with what is known so the summary can render.
 */
export function interimResult(partial: Partial<IngestResult>): IngestResult {
  return {
    ingested: partial.screens?.length ?? 0,
    duplicates: 0,
    status: 'approved',
    classified: true,
    backend: 'ai',
    grouped: (partial.flows?.length ?? 0) > 0,
    app: partial.app ?? { id: '', name: '', industry: '' },
    identified: null,
    excluded: partial.excluded ?? [],
    skipped: partial.skipped ?? [],
    capture: partial.capture ?? null,
    timeline: null,
    researched: null,
    flows: partial.flows ?? [],
    screens: partial.screens ?? [],
  };
}

export function AdminChatbotIngestSummary({
  result,
  writing,
  logoState,
  onPickLogo,
}: {
  result: IngestResult;
  /** True while the AI is still writing names — the strips will change. */
  writing?: boolean;
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
        {!writing && (
          <span>
            <strong>{result.duplicates}</strong> repeat{result.duplicates === 1 ? '' : 's'} folded in
          </span>
        )}
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
        {result.researched && (
          <span>
            <strong>{result.researched.flows}</strong> flow name{result.researched.flows === 1 ? '' : 's'} and{' '}
            <strong>{result.researched.screens}</strong> screen{result.researched.screens === 1 ? '' : 's'} written by the AI
          </span>
        )}
        {result.researched?.typesRechecked ? (
          <span>
            <strong>{result.researched.typesRechecked}</strong> type{result.researched.typesRechecked === 1 ? '' : 's'} double-checked, <strong>{result.researched.typesFixed ?? 0}</strong> fixed on its own
          </span>
        ) : null}
      </div>

      {!writing && result.version && <ClaudeReview appId={result.app.id} appName={result.app.name} platform={result.platform ?? 'ios'} version={result.version} />}

      {/* The tree's last check: clean, or what is still worth a look. */}
      {result.checks && (
        <p className="ins-admin-note">
          {result.checks.length
            ? <>Worth a look: {result.checks.join('; ')}. Ask me to rename, move or merge any of them.</>
            : 'Checked: no duplicate names, oversized flows or unnamed screens.'}
        </p>
      )}

      {result.identified && !result.identified.confident && (
        <p className="ins-admin-note">
          {result.identified.detected
            ? `“${result.app.name}” was read off the app’s own screens${result.identified.evidence ? ` (“${result.identified.evidence}”)` : ''}. `
            : `The app is named after the recording. `}
          Rename it under <strong>Apps</strong> if it is wrong — that also renames its folder.
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
    <Link href={screenHref} scroll={false} className="ins-ingest-shot" title={screenTitle(screen)}>
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
      <span className="ins-ingest-shot-name">{screenTitle(screen)}</span>
      <span className="ins-ingest-shot-sub">
        {fineTypeLabel(screen.screenType)}
        {screen.atSeconds !== null && ` · ${clock(screen.atSeconds)}`}
        {screen.brief && ' · brief'}
      </span>
    </Link>
  );
}
