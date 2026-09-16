'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { inspirationsApi } from '@/lib/inspirations/api';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { flowCategoryLabel, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExternalIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { SaveButton } from './SaveButton';
import { useAsync } from './useAsync';

/**
 * Flow preview overlay.
 *
 * Opening a flow should not lose the gallery you were browsing, so a flow card
 * adds `?flow=<id>` to the current URL and this renders over the page. That one
 * decision buys three things for free: the preview is linkable, the browser's
 * back button closes it, and the filters underneath survive.
 *
 * The step is local state rather than another URL parameter. Back means "close
 * the preview", which is what people expect from an overlay; the full page at
 * /inspirations/flow/[id] is where a particular step gets its own link.
 */

/** Search-param name that opens the overlay. */
export const FLOW_PARAM = 'flow';

/** The mounted flag never changes after hydration, so nothing to subscribe to. */
function subscribeNever() {
  return () => {};
}

export function FlowPreview() {
  const params = useSearchParams();
  const flowId = params.get(FLOW_PARAM);
  if (!flowId) return null;
  return <FlowPreviewModal flowId={flowId} />;
}

function FlowPreviewModal({ flowId }: { flowId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [index, setIndex] = useState(0);

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Portals need a document, so the overlay renders on the client only. Read
  // through useSyncExternalStore rather than an effect, so the server and the
  // first client render agree.
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);

  const { data, loading } = useAsync(() => inspirationsApi.getFlow(flowId), `flow-preview:${flowId}`);
  const flow = data?.flow;
  const screens = data?.screens ?? [];
  const app = data?.app ?? undefined;
  const current = screens[index];

  // A different flow starts at its first step.
  const [seenFlow, setSeenFlow] = useState(flowId);
  if (seenFlow !== flowId) {
    setSeenFlow(flowId);
    setIndex(0);
  }

  const close = useCallback(() => {
    const sp = new URLSearchParams(params.toString());
    sp.delete(FLOW_PARAM);
    const qs = sp.toString();
    // back() keeps history tidy when the overlay was opened from this page;
    // replace() covers arriving here from a shared link.
    if (window.history.length > 1) router.back();
    else router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [params, pathname, router]);

  const step = useCallback(
    (delta: number) => {
      setIndex((i) => Math.max(0, Math.min(i + delta, screens.length - 1)));
    },
    [screens.length],
  );

  // Keyboard: Escape closes, arrows step, Tab stays inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        step(1);
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        step(-1);
        return;
      }
      if (e.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close, step]);

  // Hold the page still behind the overlay, and give focus back on close.
  useEffect(() => {
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    if (!loading) closeRef.current?.focus();
  }, [loading]);

  if (!mounted) return null;

  const title = flow ? `${app ? `${app.name} — ` : ''}${flow.name}` : 'Loading flow';

  return createPortal(
    <div className="ins-portal ins-preview" role="presentation">
      <div className="ins-preview-backdrop" onClick={close} />

      <div
        className="ins-preview-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={dialogRef}
      >
        <header className="ins-preview-head">
          <div className="ins-preview-title-wrap">
            {app && <AppLogo app={app} size={26} />}
            <div>
              <p className="ins-preview-title">{flow?.name ?? 'Flow'}</p>
              {flow && (
                <p className="ins-preview-sub">
                  {app?.name} · {flowCategoryLabel(flow.category)} · {PLATFORM_LABEL[flow.platform] ?? flow.platform}{' '}
                  · {screens.length} steps
                </p>
              )}
            </div>
          </div>

          <div className="ins-preview-head-actions">
            {flow && (
              <>
                <SaveButton type="flow" id={flow.id} variant="button" />
                <CollectionMenu type="flow" id={flow.id} variant="button" />
                <Link href={INSPIRATIONS_ROUTES.flow(flow)} className="ins-btn">
                  <ExternalIcon size={15} /> Full page
                </Link>
              </>
            )}
            <button ref={closeRef} type="button" className="ins-iconbtn ins-iconbtn--outline" aria-label="Close preview" onClick={close}>
              <CloseIcon size={16} />
            </button>
          </div>
        </header>

        {loading || !flow ? (
          <div className="ins-preview-loading">
            <span className="ins-spinner" />
          </div>
        ) : screens.length === 0 ? (
          <p className="ins-preview-loading ins-muted">This flow has no published screens.</p>
        ) : (
          <>
            <div className={`ins-preview-stage ${flow.platform !== 'web' ? 'is-mobile' : ''}`}>
              <button
                type="button"
                className="ins-preview-nav"
                aria-label="Previous step"
                disabled={index === 0}
                onClick={() => step(-1)}
              >
                <ChevronLeftIcon size={20} />
              </button>

              <figure className="ins-preview-figure">
                <div className="ins-preview-shot">{current && <Screenshot screen={current} priority />}</div>
              </figure>

              <button
                type="button"
                className="ins-preview-nav"
                aria-label="Next step"
                disabled={index === screens.length - 1}
                onClick={() => step(1)}
              >
                <ChevronRightIcon size={20} />
              </button>
            </div>

            <div className="ins-preview-caption">
              <span className="ins-preview-step" aria-live="polite">
                Step {index + 1} of {screens.length}
              </span>
              <span className="ins-preview-name">{current?.name}</span>
              {current && (
                <Link href={INSPIRATIONS_ROUTES.screen(current)} className="ins-link">
                  Open this screen
                </Link>
              )}
            </div>

            {/* The filmstrip is the whole point of a flow: the journey has to be
                visible at a glance, not one screen at a time. */}
            <ol className="ins-preview-strip" aria-label="Steps in this flow">
              {screens.map((s, i) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`ins-preview-thumb ${i === index ? 'is-active' : ''}`}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={`Step ${i + 1}: ${s.name || SCREEN_TYPE_LABEL[s.screenType]}`}
                    onClick={() => setIndex(i)}
                  >
                    <span className="ins-preview-thumb-num">{i + 1}</span>
                    <span className="ins-preview-thumb-shot">
                      <Screenshot screen={s} />
                    </span>
                  </button>
                </li>
              ))}
            </ol>

            <p className="ins-preview-hint">
              Arrow keys move between steps. Press Escape to close.
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
