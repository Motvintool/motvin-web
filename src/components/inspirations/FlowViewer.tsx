'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { INSPIRATIONS_ROUTES } from '@/lib/inspirations/routes';
import { FLOW_CATEGORY_LABEL, PLATFORM_LABEL, SCREEN_TYPE_LABEL } from '@/lib/inspirations/taxonomy';
import type { App, Flow, Screen } from '@/lib/inspirations/types';
import { AppLogo } from './AppLogo';
import { CollectionMenu } from './CollectionMenu';
import { ArrowLeftIcon, ChevronLeftIcon, ChevronRightIcon, ExternalIcon } from './Icons';
import { Screenshot } from './Screenshot';
import { SaveButton } from './SaveButton';

/**
 * Flow viewer: numbered step rail plus a large stage for the selected step.
 * ← → move between steps; each step links through to its screen page.
 */
export function FlowViewer({ flow, screens, app }: { flow: Flow; screens: Screen[]; app?: App }) {
  const [index, setIndex] = useState(0);
  const current = screens[index];
  const mobile = flow.platform !== 'web';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, screens.length - 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [screens.length]);

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
            {FLOW_CATEGORY_LABEL[flow.category]} · {PLATFORM_LABEL[flow.platform]} · {screens.length} steps
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
            <button type="button" className="ins-flow-rail-btn" onClick={() => setIndex(i)} aria-current={i === index ? 'step' : undefined}>
              <span className="ins-flow-rail-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ins-flow-rail-shot">
                <Screenshot screen={s} />
              </span>
              <span className="ins-flow-rail-name">{SCREEN_TYPE_LABEL[s.screenType]}</span>
            </button>
            {i < screens.length - 1 && <span className="ins-flow-rail-arrow" aria-hidden><ChevronRightIcon size={14} /></span>}
          </li>
        ))}
      </ol>

      <div className={`ins-flow-stage ${mobile ? 'is-mobile' : ''}`}>
        <button type="button" className="ins-stage-nav" aria-label="Previous step" disabled={index === 0} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
          <ChevronLeftIcon size={18} />
        </button>
        <figure className="ins-stage-figure">
          <div className="ins-stage-shot">
            <Screenshot screen={current} />
          </div>
          <figcaption className="ins-stage-caption">
            <span className="ins-stage-step">Step {index + 1} of {screens.length}</span>
            <span className="ins-stage-name">{current.name}</span>
            <Link href={INSPIRATIONS_ROUTES.screen(current)} className="ins-link ins-stage-open">
              Open screen <ExternalIcon size={12} />
            </Link>
          </figcaption>
        </figure>
        <button type="button" className="ins-stage-nav" aria-label="Next step" disabled={index === screens.length - 1} onClick={() => setIndex((i) => Math.min(screens.length - 1, i + 1))}>
          <ChevronRightIcon size={18} />
        </button>
      </div>
    </div>
  );
}
