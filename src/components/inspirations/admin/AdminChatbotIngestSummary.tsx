'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { inspirationsApi } from '@/lib/inspirations/api';
import { clock, type IngestResult, type IngestScreen } from '@/lib/inspirations/admin-chatbot/ingestJobs';
import { fineTypeLabel, screenStateLabel } from '@/lib/inspirations/taxonomy';
import { CheckIcon, ExternalIcon, UploadIcon } from '../Icons';
import { SCREEN_PARAM } from '../ScreenPreviewModal';

/**
 * What a run published, read the way the gallery will show it: each journey
 * as a strip of screens in walk order, with the name, type and state the
 * pipeline gave every one. Anything left out is listed by name and reason,
 * so nothing disappears silently.
 */

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
      </div>

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
