'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { APP_FRESHNESS_LABEL, type AppFreshness } from '@/lib/inspirations/appFreshness';
import type { App, Platform } from '@/lib/inspirations/types';
import { FLOW_PARAM, appPrototypeFlowId } from './FlowPreview';

/**
 * An app or web card's top-right corner: its Latest / Updated tag and, beside it, the play button — the whole
 * app as a prototype (every screen of its newest capture, in order) in the flow player, over whatever page the
 * card is on. Its "Prototype" tip is centred under the button and drawn over the page, since the card's edges
 * would cut it off.
 */
export function CardCorner({ app, platform, freshness, playable }: { app: App; platform?: Platform; freshness: AppFreshness | null; playable: boolean }) {
  const router = useRouter();
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);

  const play = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sp = new URLSearchParams(window.location.search);
    sp.set(FLOW_PARAM, appPrototypeFlowId(app.slug, app.platforms.length > 1 ? platform : undefined));
    router.push(`${window.location.pathname}?${sp.toString()}`, { scroll: false });
  };
  const showTip = (e: React.MouseEvent | React.FocusEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ x: r.left + r.width / 2, y: r.bottom + 10 });
  };

  return (
    <div className="ins-card-corner">
      {freshness && (
        <span className={`ins-card-fresh-badge is-${freshness}`} aria-label={`${APP_FRESHNESS_LABEL[freshness]} app`}>
          {APP_FRESHNESS_LABEL[freshness]}
        </span>
      )}
      {playable && (
        <button
          type="button"
          className="ins-card-play"
          aria-label={`Play ${app.name} as a prototype`}
          onClick={play}
          onMouseEnter={showTip}
          onFocus={showTip}
          onMouseLeave={() => setTip(null)}
          onBlur={() => setTip(null)}
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
            <path d="M4.5 2.6c0-.8.86-1.28 1.53-.86l6.1 3.9a1 1 0 010 1.7l-6.1 3.9a1 1 0 01-1.53-.86V2.6z" />
          </svg>
        </button>
      )}
      {tip && typeof document !== 'undefined' && createPortal(
        <span className="ins-flow-tip ins-card-play-tip is-floating" style={{ left: tip.x, top: tip.y }} aria-hidden="true">
          Prototype
        </span>,
        document.body,
      )}
    </div>
  );
}
