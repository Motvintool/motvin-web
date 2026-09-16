'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { flowCategoryLabel, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { SaveButton } from './SaveButton';

/**
 * Flow viewer: a numbered filmstrip plus a large stage for the current step.
 *
 * The step lives in the URL (`?step=3`), so a particular moment in a journey
 * can be linked to and the browser's back button walks back through the steps
 * rather than leaving the flow. Arrow keys move between steps.
 */
export function FlowViewer({ flow, screens, app }: { flow: Flow; screens: Screen[]; app?: App }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const raw = Number(params.get('step'));
  const index = Number.isFinite(raw) && raw >= 1 && raw <= screens.length ? Math.floor(raw) - 1 : 0;
  const current = screens[index];
  const mobile = flow.platform !== 'web';

  const goTo = useCallback(
    (next: number, replace = false) => {
      const clamped = Math.max(0, Math.min(next, screens.length - 1));
      const sp = new URLSearchParams(params.toString());
      if (clamped === 0) sp.delete('step');
      else sp.set('step', String(clamped + 1));
      const qs = sp.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      // Stepping is navigation, so it goes in the history; only corrections
      // replace, to avoid trapping the back button.
      if (replace) router.replace(url, { scroll: false });
      else router.push(url, { scroll: false });
    },
    [params, pathname, router, screens.length],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goTo(index + 1);
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(index - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [goTo, index]);

  if (!current) return null;

  return (
    <div className="ins-flowview">
      <div className="ins-detail-top">
        <Link href={app ? INSPIRATIONS_ROUTES.app(app) : INSPIRATIONS_ROUTES.flows} className="ins-back">
          <ArrowLeftIcon size={15} />
          {app ? app.name : 'Flows'}
        </Link>
      </div>

      <header className="ins-detail-head">
        <div className="ins-detail-title-wrap">
          {app && (
            <Link href={INSPIRATIONS_ROUTES.app(app)} className="ins-detail-app">
              <AppLogo app={app} size={22} />
              <span>{app.name}</span>
            </Link>
          )}
          <h1 className="ins-detail-title">{flow.name}</h1>
          <p className="ins-detail-sub">
            <Link href={`${INSPIRATIONS_ROUTES.flows}?category=${encodeURIComponent(flow.category)}`} className="ins-link">
              {flowCategoryLabel(flow.category)}
            </Link>{' '}
            · {PLATFORM_LABEL[flow.platform] ?? flow.platform} · {screens.length} steps
          </p>
        </div>
        <div className="ins-detail-actions">
          <SaveButton type="flow" id={flow.id} variant="button" />
          <CollectionMenu type="flow" id={flow.id} variant="button" />
        </div>
      </header>

      <ol className={`ins-flow-rail ${mobile ? 'is-mobile' : ''}`} aria-label="Flow steps">
        {screens.map((s, i) => (
          <li key={s.id} className={`ins-flow-rail-step ${i === index ? 'is-active' : ''}`}>
            <button
              type="button"
              className="ins-flow-rail-btn"
              onClick={() => goTo(i)}
              aria-current={i === index ? 'step' : undefined}
            >
              <span className="ins-flow-rail-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ins-flow-rail-shot">
                <Screenshot screen={s} />
              </span>
              <span className="ins-flow-rail-name">{s.name || SCREEN_TYPE_LABEL[s.screenType]}</span>
            </button>
            {i < screens.length - 1 && (
              <span className="ins-flow-rail-arrow" aria-hidden>
                <ChevronRightIcon size={14} />
              </span>
            )}
          </li>
        ))}
      </ol>

      <div className={`ins-flow-stage ${mobile ? 'is-mobile' : ''}`}>
        <button
          type="button"
          className="ins-stage-nav"
          aria-label="Previous step"
          disabled={index === 0}
          onClick={() => goTo(index - 1)}
        >
          <ChevronLeftIcon size={18} />
        </button>

        <figure className="ins-stage-figure">
          <div className="ins-stage-shot">
            <Screenshot screen={current} priority />
          </div>
          <figcaption className="ins-stage-caption">
            <span className="ins-stage-step">
              Step {index + 1} of {screens.length}
            </span>
            <span className="ins-stage-name">{current.name}</span>
            <Link href={INSPIRATIONS_ROUTES.screen(current)} className="ins-link ins-stage-open">
              Open screen <ExternalIcon size={12} />
            </Link>
          </figcaption>
        </figure>

        <button
          type="button"
          className="ins-stage-nav"
          aria-label="Next step"
          disabled={index === screens.length - 1}
          onClick={() => goTo(index + 1)}
        >
          <ChevronRightIcon size={18} />
        </button>
      </div>

      <p className="ins-muted ins-flow-hint">Use the arrow keys to step through the flow.</p>
    </div>
  );
}
